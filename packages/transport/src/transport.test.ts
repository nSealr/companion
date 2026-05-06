import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { verifySignedEventResponse } from "../../core/src/nostr.js";
import {
  DevSignerTransport,
  JsonFileTransport,
  JsonLineStdioTransport,
  readJsonFile,
  writeJsonFile
} from "./transport.js";

const specsRoot = resolve("../specs");
const key = JSON.parse(readFileSync(resolve(specsRoot, "vectors/keys/test-key-1.json"), "utf8")) as {
  secret_key: string;
};
const signEventRequest = JSON.parse(readFileSync(resolve(specsRoot, "examples/request-kind-1-basic.json"), "utf8"));

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
});
