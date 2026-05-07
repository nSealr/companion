import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { verifySignedEventResponse } from "../../core/src/nostr.js";
import { decodeSerialFrame, encodeSerialFrame } from "../../framing/src/serial.js";
import { validateResponse } from "../../protocol/src/protocol.js";
import {
  DevSignerTransport,
  JsonFileTransport,
  JsonLineStdioTransport,
  SerialFrameTransport,
  readJsonFile,
  writeJsonFile
} from "./transport.js";

const specsRoot = resolve("../specs");
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

describe("transport adapters", () => {
  it("signs through the in-memory development signer transport", async () => {
    const transport = new DevSignerTransport(key.secret_key);
    const response = await transport.exchange(signEventRequest);

    expect(verifySignedEventResponse(signEventRequest, response).ok).toBe(true);
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
});
