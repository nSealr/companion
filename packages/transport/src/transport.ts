import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { type Readable, type Writable } from "node:stream";
import { devSignRequest } from "../../dev-signer/src/dev-signer.js";
import { type SignEventRequest, verifySignedEventResponse } from "../../core/src/nostr.js";
import { decodeSerialFrame, encodeSerialFrame } from "../../framing/src/serial.js";
import { NOSTRSEAL_V0_LIMITS, utf8ByteLength } from "../../protocol/src/limits.js";
import { validateRequest, validateResponse } from "../../protocol/src/protocol.js";

export type SignerTransport = {
  readonly name: string;
  exchange(request: unknown): Promise<unknown>;
};

export type SerialLinePort = {
  writeLine(line: string): Promise<void>;
  readLine(): Promise<string | null>;
};

export class SerialLineStreamPort implements SerialLinePort {
  private readonly input: Readable;
  private readonly output: Writable;
  private buffer = "";
  private ended = false;
  private inputError: Error | null = null;
  private readonly waiters: Array<() => void> = [];
  private readonly maxBufferedBytes: number;

  constructor(options: { input: Readable; output: Writable; encoding?: BufferEncoding; maxBufferedBytes?: number }) {
    const encoding = options.encoding ?? "utf8";
    this.input = options.input;
    this.output = options.output;
    this.maxBufferedBytes = options.maxBufferedBytes ?? NOSTRSEAL_V0_LIMITS.max_serial_frame_bytes;
    this.input.setEncoding(encoding);
    this.input.on("data", (chunk: string | Buffer) => {
      this.buffer += typeof chunk === "string" ? chunk : chunk.toString(encoding);
      if (!this.inputError && this.hasOversizedBufferedLine()) {
        this.inputError = new Error("serial line port buffer exceeded max_serial_frame_bytes");
      }
      this.notifyWaiters();
    });
    this.input.on("end", () => {
      this.ended = true;
      this.notifyWaiters();
    });
    this.input.on("error", (error) => {
      this.inputError = error instanceof Error ? error : new Error(String(error));
      this.notifyWaiters();
    });
  }

  async writeLine(line: string): Promise<void> {
    const outputLine = line.endsWith("\n") ? line : `${line}\n`;
    await new Promise<void>((resolve, reject) => {
      this.output.write(outputLine, "utf8", (error?: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async readLine(): Promise<string | null> {
    while (true) {
      if (this.inputError) {
        throw this.inputError;
      }
      const line = this.shiftLine();
      if (line !== null) {
        return line;
      }
      if (this.ended) {
        if (this.buffer.length === 0) {
          return null;
        }
        const trailingLine = this.buffer;
        this.buffer = "";
        return trailingLine;
      }
      await this.waitForInput();
    }
  }

  private shiftLine(): string | null {
    const newlineIndex = this.buffer.indexOf("\n");
    if (newlineIndex === -1) {
      return null;
    }
    const line = this.buffer.slice(0, newlineIndex + 1);
    this.buffer = this.buffer.slice(newlineIndex + 1);
    return line;
  }

  private hasOversizedBufferedLine(): boolean {
    let lineStart = 0;
    while (true) {
      const newlineIndex = this.buffer.indexOf("\n", lineStart);
      if (newlineIndex === -1) {
        break;
      }
      const completeLine = this.buffer.slice(lineStart, newlineIndex + 1);
      if (utf8ByteLength(completeLine) > this.maxBufferedBytes) {
        return true;
      }
      lineStart = newlineIndex + 1;
    }
    return utf8ByteLength(this.buffer.slice(lineStart)) > this.maxBufferedBytes;
  }

  private async waitForInput(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private notifyWaiters(): void {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) {
      waiter();
    }
  }
}

export function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJsonFile(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertValidRequest(value: unknown, label = "transport request"): void {
  const validation = validateRequest(value);
  if (!validation.ok) {
    throw new Error(`${label} invalid: ${validation.error}`);
  }
}

function assertValidResponse(value: unknown, label = "transport response"): void {
  const validation = validateResponse(value);
  if (!validation.ok) {
    throw new Error(`${label} invalid: ${validation.error}`);
  }
}

function requestIdOf(value: unknown): string {
  return (value as { request_id: string }).request_id;
}

function assertResponseMatchesRequest(request: unknown, response: unknown, label = "transport response"): void {
  if (requestIdOf(response) !== requestIdOf(request)) {
    throw new Error(`${label} request_id does not match request`);
  }
}

function assertResponseVerifiedAgainstRequest(request: unknown, response: unknown, label = "transport response"): void {
  assertResponseMatchesRequest(request, response, label);
  if ((request as { method?: unknown }).method !== "sign_event" || (response as { ok?: unknown }).ok !== true) {
    return;
  }
  const verification = verifySignedEventResponse(request, response);
  if (!verification.ok) {
    throw new Error(`${label} ${verification.error}`);
  }
}

function truncateUtf8(value: string, maxBytes: number): string {
  let result = "";
  for (const char of value) {
    if (utf8ByteLength(result + char) > maxBytes) {
      return result;
    }
    result += char;
  }
  return result;
}

export class DevSignerTransport implements SignerTransport {
  readonly name = "dev-signer";

  constructor(private readonly secretKeyHex: string) {}

  async exchange(request: unknown): Promise<unknown> {
    assertValidRequest(request);
    const response = devSignRequest(request as SignEventRequest, this.secretKeyHex);
    assertValidResponse(response);
    assertResponseVerifiedAgainstRequest(request, response);
    return response;
  }
}

export class JsonFileTransport implements SignerTransport {
  readonly name = "json-file";
  readonly requestPath: string;
  readonly responsePath: string;

  constructor(options: { requestPath: string; responsePath: string }) {
    this.requestPath = options.requestPath;
    this.responsePath = options.responsePath;
  }

  async writeRequest(request: unknown): Promise<void> {
    assertValidRequest(request);
    writeJsonFile(this.requestPath, request);
  }

  async readResponse(): Promise<unknown> {
    const response = readJsonFile(this.responsePath);
    assertValidResponse(response);
    return response;
  }

  async exchange(request: unknown): Promise<unknown> {
    await this.writeRequest(request);
    const response = await this.readResponse();
    assertResponseVerifiedAgainstRequest(request, response);
    return response;
  }
}

export class JsonLineStdioTransport implements SignerTransport {
  readonly name = "json-line-stdio";
  private readonly command: string;
  private readonly args: string[];
  private readonly cwd?: string;
  private readonly env?: NodeJS.ProcessEnv;
  private readonly maxOutputLineBytes: number;
  private readonly maxStderrBytes: number;
  private readonly responseTimeoutMs: number;

  constructor(options: {
    command: string;
    args?: string[];
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    maxOutputLineBytes?: number;
    maxStderrBytes?: number;
    responseTimeoutMs?: number;
  }) {
    this.command = options.command;
    this.args = options.args ?? [];
    this.cwd = options.cwd;
    this.env = options.env;
    this.maxOutputLineBytes = options.maxOutputLineBytes ?? NOSTRSEAL_V0_LIMITS.max_serial_frame_bytes;
    this.maxStderrBytes = options.maxStderrBytes ?? NOSTRSEAL_V0_LIMITS.max_serial_frame_bytes;
    this.responseTimeoutMs = options.responseTimeoutMs ?? 30_000;
  }

  async exchange(request: unknown): Promise<unknown> {
    assertValidRequest(request);
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, this.args, {
        cwd: this.cwd,
        env: this.env,
        stdio: ["pipe", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const responseTimer = setTimeout(() => {
        fail(new Error(`stdio signer timed out before response after ${this.responseTimeoutMs}ms`));
      }, this.responseTimeoutMs);

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(responseTimer);
        if (child.exitCode === null && child.signalCode === null && !child.killed) {
          child.kill();
        }
        reject(error);
      };

      const succeed = (response: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(responseTimer);
        resolve(response);
      };

      if (!child.stdin || !child.stdout || !child.stderr) {
        fail(new Error("stdio transport requires piped stdin, stdout, and stderr"));
        return;
      }

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
        if (utf8ByteLength(stderr) > this.maxStderrBytes) {
          stderr = `${truncateUtf8(stderr, this.maxStderrBytes)}...<stderr truncated>`;
        }
      });
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        if (utf8ByteLength(stdout) > this.maxOutputLineBytes) {
          fail(new Error("stdio signer stdout exceeded max_output_line_bytes before newline response"));
          return;
        }
        const newlineIndex = stdout.indexOf("\n");
        if (newlineIndex === -1) return;
        const line = stdout.slice(0, newlineIndex);
        try {
          const response = JSON.parse(line);
          assertValidResponse(response);
          assertResponseVerifiedAgainstRequest(request, response);
          succeed(response);
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      });
      child.on("error", fail);
      child.on("close", (code) => {
        if (settled) return;
        fail(new Error(`stdio signer exited before responding with code ${code}; stderr: ${stderr.trim()}`));
      });
      child.stdin.end(`${JSON.stringify(request)}\n`, "utf8");
    });
  }
}

export class SerialFrameTransport implements SignerTransport {
  readonly name = "serial-frame";
  private readonly exchangeFrame: (line: string) => Promise<string>;

  constructor(options: { exchangeFrame: (line: string) => Promise<string> }) {
    this.exchangeFrame = options.exchangeFrame;
  }

  async exchange(request: unknown): Promise<unknown> {
    assertValidRequest(request, "serial frame request");
    const requestLine = encodeSerialFrame({ type: "request", payload: request });
    const responseLine = await this.exchangeFrame(requestLine);
    const responseFrame = decodeSerialFrame(responseLine);
    if (responseFrame.type !== "response") {
      throw new Error(`serial frame transport expected response frame, got ${responseFrame.type}`);
    }
    assertValidResponse(responseFrame.payload, "serial frame response");
    assertResponseVerifiedAgainstRequest(request, responseFrame.payload, "serial frame response");
    return responseFrame.payload;
  }
}

export class SerialLineTransport implements SignerTransport {
  readonly name = "serial-line";
  private readonly port: SerialLinePort;
  private readonly maxIgnoredLines: number;

  constructor(options: { port: SerialLinePort; maxIgnoredLines?: number }) {
    this.port = options.port;
    this.maxIgnoredLines = options.maxIgnoredLines ?? 32;
  }

  async exchange(request: unknown): Promise<unknown> {
    const transport = new SerialFrameTransport({
      exchangeFrame: async (line) => {
        await this.port.writeLine(line);
        for (let ignored = 0; ignored <= this.maxIgnoredLines; ignored += 1) {
          const responseLine = await this.port.readLine();
          if (responseLine === null) {
            throw new Error("serial line transport reached end of input before response");
          }
          if (responseLine.startsWith("nseal1f:")) {
            return responseLine;
          }
        }
        throw new Error("serial line transport did not receive a protocol frame");
      }
    });
    return transport.exchange(request);
  }
}
