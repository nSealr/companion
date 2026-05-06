import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { devSignRequest } from "../../dev-signer/src/dev-signer.js";
import { type SignEventRequest } from "../../core/src/nostr.js";

export type SignerTransport = {
  readonly name: string;
  exchange(request: unknown): Promise<unknown>;
};

export function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJsonFile(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export class DevSignerTransport implements SignerTransport {
  readonly name = "dev-signer";

  constructor(private readonly secretKeyHex: string) {}

  async exchange(request: unknown): Promise<unknown> {
    return devSignRequest(request as SignEventRequest, this.secretKeyHex);
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
    writeJsonFile(this.requestPath, request);
  }

  async readResponse(): Promise<unknown> {
    return readJsonFile(this.responsePath);
  }

  async exchange(request: unknown): Promise<unknown> {
    await this.writeRequest(request);
    return this.readResponse();
  }
}

export class JsonLineStdioTransport implements SignerTransport {
  readonly name = "json-line-stdio";
  private readonly command: string;
  private readonly args: string[];
  private readonly cwd?: string;
  private readonly env?: NodeJS.ProcessEnv;

  constructor(options: { command: string; args?: string[]; cwd?: string; env?: NodeJS.ProcessEnv }) {
    this.command = options.command;
    this.args = options.args ?? [];
    this.cwd = options.cwd;
    this.env = options.env;
  }

  async exchange(request: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.command, this.args, {
        cwd: this.cwd,
        env: this.env,
        stdio: ["pipe", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      let settled = false;

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      const succeed = (response: unknown): void => {
        if (settled) return;
        settled = true;
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
      });
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        const newlineIndex = stdout.indexOf("\n");
        if (newlineIndex === -1) return;
        const line = stdout.slice(0, newlineIndex);
        try {
          succeed(JSON.parse(line));
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
