import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { verifySignedEventResponse } from "../../core/src/nostr.js";
import { resolveSpecsRoot } from "../../fixtures/src/specs-root.js";
import { decodeSerialFrame, encodeSerialFrame } from "../../framing/src/serial.js";
import { validateResponse } from "../../protocol/src/protocol.js";
import {
  DevSignerTransport,
  JsonFileTransport,
  JsonLineStdioTransport,
  SerialFrameTransport,
  SerialLineTransport,
  readJsonFile,
  writeJsonFile
} from "./transport.js";

const specsRoot = resolveSpecsRoot();
const key = JSON.parse(readFileSync(resolve(specsRoot, "vectors/keys/test-key-1.json"), "utf8")) as {
  secret_key: string;
};
const signEventRequest = JSON.parse(readFileSync(resolve(specsRoot, "examples/request-kind-1-basic.json"), "utf8"));
const signingDisabledResponse = JSON.parse(
  readFileSync(resolve(specsRoot, "examples/response-sign-event-disabled-esp32-s3-scaffold.json"), "utf8")
);
const capabilitiesRequest = JSON.parse(readFileSync(resolve(specsRoot, "examples/request-get-capabilities.json"), "utf8"));
const capabilitiesResponse = JSON.parse(
  readFileSync(resolve(specsRoot, "examples/response-get-capabilities-esp32-s3-scaffold.json"), "utf8")
);
const publicKeyVector = JSON.parse(
  readFileSync(resolve(specsRoot, "vectors/devices/esp32-s3-get-public-key-dev.json"), "utf8")
);
const basicEventVector = JSON.parse(readFileSync(resolve(specsRoot, "vectors/events/kind-1-basic.json"), "utf8"));

describe("transport adapters", () => {
  it("signs through the in-memory development signer transport", async () => {
    const transport = new DevSignerTransport(key.secret_key);
    const response = await transport.exchange(signEventRequest);

    expect(verifySignedEventResponse(signEventRequest, response).ok).toBe(true);
  });

  it("rejects invalid development signer transport requests before signing", async () => {
    const transport = new DevSignerTransport(key.secret_key);

    await expect(transport.exchange({ ...signEventRequest, request_id: "bad request id" })).rejects.toThrow(
      "transport request invalid: request_id is invalid"
    );
  });

  it("moves request and response JSON through files", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-file-"));
    const requestPath = join(tempRoot, "request.json");
    const responsePath = join(tempRoot, "response.json");
    const transport = new JsonFileTransport({ requestPath, responsePath });
    const expectedResponse = {
      version: 1,
      request_id: signEventRequest.request_id,
      ok: false,
      error: {
        code: "user_rejected",
        message: "Rejected in file handoff test",
        retryable: false
      }
    };

    await transport.writeRequest(signEventRequest);
    writeJsonFile(responsePath, expectedResponse);

    expect(readJsonFile(requestPath)).toEqual(signEventRequest);
    await expect(transport.readResponse()).resolves.toEqual(expectedResponse);
  });

  it("rejects file transport exchange responses for a different request id", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-file-mismatched-response-"));
    const requestPath = join(tempRoot, "request.json");
    const responsePath = join(tempRoot, "response.json");
    const transport = new JsonFileTransport({ requestPath, responsePath });
    writeJsonFile(responsePath, {
      version: 1,
      request_id: "different-request",
      ok: false,
      error: {
        code: "user_rejected",
        message: "Rejected in file handoff test",
        retryable: false
      }
    });

    await expect(transport.exchange(signEventRequest)).rejects.toThrow("transport response request_id does not match request");
  });

  it("rejects invalid file transport requests before writing them", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-file-invalid-request-"));
    const requestPath = join(tempRoot, "request.json");
    const responsePath = join(tempRoot, "response.json");
    const transport = new JsonFileTransport({ requestPath, responsePath });

    await expect(transport.writeRequest({ version: 1, request_id: "bad request id", method: "get_capabilities" })).rejects.toThrow(
      "transport request invalid: request_id is invalid"
    );
    expect(() => readFileSync(requestPath, "utf8")).toThrow();
  });

  it("rejects invalid file transport responses before returning them", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-file-invalid-response-"));
    const requestPath = join(tempRoot, "request.json");
    const responsePath = join(tempRoot, "response.json");
    const transport = new JsonFileTransport({ requestPath, responsePath });

    writeJsonFile(responsePath, { version: 1, request_id: signEventRequest.request_id });

    await expect(transport.readResponse()).rejects.toThrow("transport response invalid: ok must be true or false");
    expect(() => readFileSync(requestPath, "utf8")).toThrow();
  });

  it("exchanges one JSON request and response over stdio JSON lines", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-stdio-"));
    const signerPath = join(tempRoot, "stdio-signer.mjs");
    writeFileSync(
      signerPath,
      [
        "import { createInterface } from 'node:readline';",
        "const rl = createInterface({ input: process.stdin });",
        "rl.once('line', (line) => {",
        "  const request = JSON.parse(line);",
        "  process.stdout.write(JSON.stringify({",
        "    version: 1,",
        "    request_id: request.request_id,",
        "    ok: false,",
        "    error: { code: 'user_rejected', message: 'Rejected by stdio test signer', retryable: false }",
        "  }) + '\\n');",
        "});"
      ].join("\n"),
      "utf8"
    );

    const transport = new JsonLineStdioTransport({
      command: process.execPath,
      args: [signerPath]
    });

    await expect(transport.exchange(signEventRequest)).resolves.toEqual({
      version: 1,
      request_id: signEventRequest.request_id,
      ok: false,
      error: {
        code: "user_rejected",
        message: "Rejected by stdio test signer",
        retryable: false
      }
    });
  });

  it("rejects stdio transport responses for a different request id", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-stdio-mismatched-response-"));
    const signerPath = join(tempRoot, "stdio-signer.mjs");
    writeFileSync(
      signerPath,
      [
        "import { createInterface } from 'node:readline';",
        "const rl = createInterface({ input: process.stdin });",
        "rl.once('line', () => {",
        "  process.stdout.write(JSON.stringify({",
        "    version: 1,",
        "    request_id: 'different-request',",
        "    ok: false,",
        "    error: { code: 'user_rejected', message: 'Rejected by stdio test signer', retryable: false }",
        "  }) + '\\n');",
        "});"
      ].join("\n"),
      "utf8"
    );
    const transport = new JsonLineStdioTransport({
      command: process.execPath,
      args: [signerPath]
    });

    await expect(transport.exchange(signEventRequest)).rejects.toThrow("transport response request_id does not match request");
  });

  it("rejects invalid stdio transport requests before spawning a signer", async () => {
    const transport = new JsonLineStdioTransport({
      command: "/definitely/missing/nseal-stdio-signer"
    });

    await expect(transport.exchange({ version: 1, request_id: "bad request id", method: "get_capabilities" })).rejects.toThrow(
      "transport request invalid: request_id is invalid"
    );
  });

  it("rejects invalid stdio transport responses before returning them", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-stdio-invalid-response-"));
    const signerPath = join(tempRoot, "stdio-signer.mjs");
    writeFileSync(
      signerPath,
      [
        "import { createInterface } from 'node:readline';",
        "const rl = createInterface({ input: process.stdin });",
        "rl.once('line', () => {",
        "  process.stdout.write(JSON.stringify({ version: 1, request_id: 'req-sign-event-1' }) + '\\n');",
        "});"
      ].join("\n"),
      "utf8"
    );

    const transport = new JsonLineStdioTransport({
      command: process.execPath,
      args: [signerPath]
    });

    await expect(transport.exchange(signEventRequest)).rejects.toThrow("transport response invalid: ok must be true or false");
  });

  it("exchanges one request and response over serial frames", async () => {
    const transport = new SerialFrameTransport({
      exchangeFrame: async (line) => {
        expect(decodeSerialFrame(line)).toEqual({ type: "request", payload: capabilitiesRequest });
        return encodeSerialFrame({ type: "response", payload: capabilitiesResponse });
      }
    });

    const response = await transport.exchange(capabilitiesRequest);

    expect(response).toEqual(capabilitiesResponse);
    expect(validateResponse(response).ok).toBe(true);
  });

  it("rejects serial response payloads for a different request id", async () => {
    const transport = new SerialFrameTransport({
      exchangeFrame: async () => encodeSerialFrame({
        type: "response",
        payload: { ...capabilitiesResponse, request_id: "different-request" }
      })
    });

    await expect(transport.exchange(capabilitiesRequest)).rejects.toThrow("serial frame response request_id does not match request");
  });

  it("moves ESP32-S3 scaffold signing-disabled responses over serial frames", async () => {
    const transport = new SerialFrameTransport({
      exchangeFrame: async (line) => {
        expect(decodeSerialFrame(line)).toEqual({ type: "request", payload: signEventRequest });
        return encodeSerialFrame({ type: "response", payload: signingDisabledResponse });
      }
    });

    const response = await transport.exchange(signEventRequest);

    expect(response).toEqual(signingDisabledResponse);
    expect(validateResponse(response).ok).toBe(true);
  });

  it("rejects successful sign_event serial responses with invalid signatures before returning from transport", async () => {
    const invalidSignedResponse = {
      ...basicEventVector.response,
      result: {
        event: {
          ...basicEventVector.response.result.event,
          sig: "00".repeat(64)
        }
      }
    };
    const transport = new SerialFrameTransport({
      exchangeFrame: async (line) => {
        expect(decodeSerialFrame(line)).toEqual({ type: "request", payload: basicEventVector.request });
        return encodeSerialFrame({ type: "response", payload: invalidSignedResponse });
      }
    });

    await expect(transport.exchange(basicEventVector.request)).rejects.toThrow("signed event signature is invalid");
  });

  it("moves ESP32-S3 scaffold public-key responses over serial frames", async () => {
    const transport = new SerialFrameTransport({
      exchangeFrame: async (line) => {
        expect(decodeSerialFrame(line)).toEqual({ type: "request", payload: publicKeyVector.request });
        return encodeSerialFrame({ type: "response", payload: publicKeyVector.response });
      }
    });

    const response = await transport.exchange(publicKeyVector.request);

    expect(response).toEqual(publicKeyVector.response);
    expect(validateResponse(response).ok).toBe(true);
  });

  it("rejects invalid serial response payloads before returning from transport", async () => {
    const transport = new SerialFrameTransport({
      exchangeFrame: async () => encodeSerialFrame({
        type: "response",
        payload: { version: 1, request_id: capabilitiesRequest.request_id }
      })
    });

    await expect(transport.exchange(capabilitiesRequest)).rejects.toThrow("serial frame response invalid: ok must be true or false");
  });

  it("rejects invalid serial request payloads before writing to transport", async () => {
    let exchangeCalled = false;
    const transport = new SerialFrameTransport({
      exchangeFrame: async () => {
        exchangeCalled = true;
        return encodeSerialFrame({ type: "response", payload: capabilitiesResponse });
      }
    });

    await expect(transport.exchange({ version: 1, request_id: "invalid request id", method: "get_capabilities" })).rejects.toThrow(
      "serial frame request invalid: request_id is invalid"
    );
    expect(exchangeCalled).toBe(false);
  });

  it("exchanges one request over an injected serial line port while ignoring device logs", async () => {
    const writtenLines: string[] = [];
    const incomingLines = [
      "I (123) boot: device log before protocol frame\n",
      encodeSerialFrame({ type: "response", payload: capabilitiesResponse })
    ];
    const transport = new SerialLineTransport({
      port: {
        writeLine: async (line) => {
          writtenLines.push(line);
        },
        readLine: async () => incomingLines.shift() ?? null
      }
    });

    await expect(transport.exchange(capabilitiesRequest)).resolves.toEqual(capabilitiesResponse);
    expect(decodeSerialFrame(writtenLines[0])).toEqual({ type: "request", payload: capabilitiesRequest });
  });
});
