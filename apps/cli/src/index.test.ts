import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSpecsRoot } from "../../../packages/fixtures/src/specs-root.js";
import { decodeSerialFrame, encodeSerialFrame } from "../../../packages/framing/src/serial.js";
import { validateResponse } from "../../../packages/protocol/src/protocol.js";
import { decodeQrEnvelope, encodeQrEnvelope } from "../../../packages/qr/src/qr.js";
import { buildCli } from "./index.js";

const specsRoot = resolveSpecsRoot();

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function runCli(args: string[]): Promise<void> {
  const cli = buildCli().exitOverride();
  await cli.parseAsync(args, { from: "user" });
}

async function collectCliOutput(args: string[]): Promise<string[]> {
  const messages: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown) => {
    messages.push(String(message));
  };
  try {
    await runCli(args);
  } finally {
    console.log = originalLog;
  }
  return messages;
}

describe("nseal CLI", () => {
  it("runs request -> dev-sign -> verify-response for a shared fixture template", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-"));
    const key = loadJson(resolve(specsRoot, "vectors/keys/test-key-1.json")) as { secret_key: string };
    const fixtureRequest = loadJson(resolve(specsRoot, "examples/request-kind-1-basic.json")) as {
      params: { event_template: unknown };
    };
    const templatePath = join(tempRoot, "template.json");
    const requestPath = join(tempRoot, "request.json");
    const responsePath = join(tempRoot, "response.json");

    writeFileSync(templatePath, `${JSON.stringify(fixtureRequest.params.event_template, null, 2)}\n`, "utf8");

    await runCli(["request", "sign-event", "--event-template", templatePath, "--out", requestPath]);
    await runCli(["dev-sign", "--secret-key", key.secret_key, "--request", requestPath, "--out", responsePath]);
    await runCli(["verify-response", "--request", requestPath, "--response", responsePath]);

    expect(validateResponse(loadJson(responsePath)).ok).toBe(true);
  });

  it("runs request -> dev-sign -> verify-response through QR envelopes", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-qr-"));
    const key = loadJson(resolve(specsRoot, "vectors/keys/test-key-1.json")) as { secret_key: string };
    const fixtureRequest = loadJson(resolve(specsRoot, "examples/request-kind-1-basic.json")) as {
      params: { event_template: unknown };
    };
    const templatePath = join(tempRoot, "template.json");
    const requestPath = join(tempRoot, "request.qr");
    const responsePath = join(tempRoot, "response.qr");

    writeFileSync(templatePath, `${JSON.stringify(fixtureRequest.params.event_template, null, 2)}\n`, "utf8");

    await runCli(["request", "sign-event", "--event-template", templatePath, "--out", requestPath, "--output-format", "qr"]);
    await runCli([
      "dev-sign",
      "--secret-key",
      key.secret_key,
      "--request",
      requestPath,
      "--request-format",
      "qr",
      "--out",
      responsePath,
      "--output-format",
      "qr"
    ]);
    await runCli([
      "verify-response",
      "--request",
      requestPath,
      "--request-format",
      "qr",
      "--response",
      responsePath,
      "--response-format",
      "qr"
    ]);

    expect(validateResponse(decodeQrEnvelope(readFileSync(responsePath, "utf8").trim())).ok).toBe(true);
  });

  it("verifies all event fixtures from the specs repository", async () => {
    await runCli(["fixture", "verify", "--specs", specsRoot]);
  });

  it("verifies event and trusted-review fixtures from the specs repository", async () => {
    await expect(collectCliOutput(["fixture", "verify", "--specs", specsRoot])).resolves.toEqual([
      "verified 2 event fixtures, 4 review fixtures, 1 review display-frame fixture, 2 review transcript fixtures, and 5 NIP-46 payload fixtures"
    ]);
  });

  it("rejects NIP-46 permission policy fixture drift", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-invalid-nip46-policy-"));
    const tempSpecsRoot = join(tempRoot, "specs");
    cpSync(specsRoot, tempSpecsRoot, { recursive: true });
    const vectorPath = resolve(tempSpecsRoot, "vectors/nip46/sign-event-kind-1-basic.json");
    const vector = loadJson(vectorPath) as {
      permission_checks: Array<{ permitted: boolean }>;
    };
    vector.permission_checks[0].permitted = false;
    writeFileSync(vectorPath, `${JSON.stringify(vector, null, 2)}\n`, "utf8");

    await expect(runCli(["fixture", "verify", "--specs", tempSpecsRoot])).rejects.toThrow(
      /permission check mismatch/u
    );
  });

  it("rejects NIP-46 bridge decision fixture drift", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-invalid-nip46-bridge-decision-"));
    const tempSpecsRoot = join(tempRoot, "specs");
    cpSync(specsRoot, tempSpecsRoot, { recursive: true });
    const vectorPath = resolve(tempSpecsRoot, "vectors/nip46/ping.json");
    const vector = loadJson(vectorPath) as {
      bridge_decisions: Array<{ decision: { response_message: { result: string } } }>;
    };
    vector.bridge_decisions[0].decision.response_message.result = "wrong";
    writeFileSync(vectorPath, `${JSON.stringify(vector, null, 2)}\n`, "utf8");

    await expect(runCli(["fixture", "verify", "--specs", tempSpecsRoot])).rejects.toThrow(
      /bridge decision mismatch/u
    );
  });

  it("writes NIP-46 bridge decisions without opening relay or signer transports", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-nip46-decision-"));
    const signEventVector = loadJson(resolve(specsRoot, "vectors/nip46/sign-event-kind-1-basic.json")) as {
      request_message: unknown;
      bridge_decisions: Array<{
        decision: unknown;
      }>;
    };
    const connectVector = loadJson(resolve(specsRoot, "vectors/nip46/connect-policy-review.json")) as {
      request_message: unknown;
      bridge_decisions: Array<{
        decision: unknown;
      }>;
    };
    const signEventMessagePath = join(tempRoot, "sign-event-message.json");
    const connectMessagePath = join(tempRoot, "connect-message.json");
    const permittedDecisionPath = join(tempRoot, "permitted-decision.json");
    const deniedDecisionPath = join(tempRoot, "denied-decision.json");
    const connectDecisionPath = join(tempRoot, "connect-decision.json");

    writeFileSync(signEventMessagePath, `${JSON.stringify(signEventVector.request_message, null, 2)}\n`, "utf8");
    writeFileSync(connectMessagePath, `${JSON.stringify(connectVector.request_message, null, 2)}\n`, "utf8");

    await runCli([
      "nip46",
      "decide",
      "--message",
      signEventMessagePath,
      "--permissions",
      "sign_event:1",
      "--out",
      permittedDecisionPath
    ]);
    await runCli([
      "nip46",
      "decide",
      "--message",
      signEventMessagePath,
      "--permissions",
      "sign_event:4",
      "--out",
      deniedDecisionPath
    ]);
    await runCli(["nip46", "decide", "--message", connectMessagePath, "--out", connectDecisionPath]);

    expect(loadJson(permittedDecisionPath)).toEqual(signEventVector.bridge_decisions[0].decision);
    expect(loadJson(deniedDecisionPath)).toEqual(signEventVector.bridge_decisions[1].decision);
    expect(loadJson(connectDecisionPath)).toEqual(connectVector.bridge_decisions[0].decision);
  });

  it("rejects malformed event-template JSON before writing a request", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-malformed-json-"));
    const templatePath = join(tempRoot, "template.json");
    const requestPath = join(tempRoot, "request.json");
    writeFileSync(templatePath, "{not-json", "utf8");

    await expect(runCli(["request", "sign-event", "--event-template", templatePath, "--out", requestPath])).rejects.toThrow();
    expect(existsSync(requestPath)).toBe(false);
  });

  it("rejects unsupported request methods before writing output", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-unsupported-method-"));
    const requestPath = join(tempRoot, "request.json");

    await expect(runCli(["request", "nip44-encrypt", "--out", requestPath])).rejects.toThrow(
      "unsupported request method: nip44-encrypt"
    );
    expect(existsSync(requestPath)).toBe(false);
  });

  it("verifies shared get_public_key responses and rejects mismatched request ids", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-pubkey-"));
    const vector = loadJson(resolve(specsRoot, "vectors/devices/esp32-s3-get-public-key-dev.json")) as {
      request: unknown;
      response: { request_id: string };
    };
    const requestPath = join(tempRoot, "request.json");
    const responsePath = join(tempRoot, "response.json");
    const mismatchedResponsePath = join(tempRoot, "mismatched-response.json");

    writeFileSync(requestPath, `${JSON.stringify(vector.request, null, 2)}\n`, "utf8");
    writeFileSync(responsePath, `${JSON.stringify(vector.response, null, 2)}\n`, "utf8");
    writeFileSync(
      mismatchedResponsePath,
      `${JSON.stringify({ ...vector.response, request_id: "different-request" }, null, 2)}\n`,
      "utf8"
    );

    await runCli(["verify-response", "--request", requestPath, "--response", responsePath]);
    await expect(runCli(["verify-response", "--request", requestPath, "--response", mismatchedResponsePath])).rejects.toThrow(
      "response request_id does not match request"
    );
  });

  it("wraps requests and unwraps responses as serial frames", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-serial-frame-"));
    const request = loadJson(resolve(specsRoot, "examples/request-get-capabilities.json"));
    const response = loadJson(resolve(specsRoot, "examples/response-get-capabilities-esp32-s3-scaffold.json"));
    const requestPath = join(tempRoot, "request.json");
    const requestFramePath = join(tempRoot, "request.frame");
    const responseFramePath = join(tempRoot, "response.frame");
    const responsePath = join(tempRoot, "response.json");

    writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");

    await runCli(["serial-frame", "wrap-request", "--request", requestPath, "--out", requestFramePath]);
    expect(decodeSerialFrame(readFileSync(requestFramePath, "utf8").trim())).toEqual({
      type: "request",
      payload: request
    });

    writeFileSync(responseFramePath, `${encodeSerialFrame({ type: "response", payload: response })}\n`, "utf8");

    await runCli(["serial-frame", "unwrap-response", "--response-frame", responseFramePath, "--out", responsePath]);
    expect(loadJson(responsePath)).toEqual(response);
  });

  it("renders an untrusted review preview from a QR signing request", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-review-"));
    const vector = loadJson(resolve(specsRoot, "vectors/review/kind-1-tags.json")) as {
      request: unknown;
      review: unknown;
    };
    const requestPath = join(tempRoot, "request.qr");
    const reviewPath = join(tempRoot, "review.json");

    writeFileSync(requestPath, `${encodeQrEnvelope(vector.request)}\n`, "utf8");

    await runCli(["review-request", "--request", requestPath, "--request-format", "qr", "--out", reviewPath]);

    expect(loadJson(reviewPath)).toEqual(vector.review);
  });

  it("runs request -> smartcard-sim-sign -> verify-response after explicit review acknowledgement", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-smartcard-"));
    const key = loadJson(resolve(specsRoot, "vectors/keys/test-key-1.json")) as { secret_key: string };
    const request = loadJson(resolve(specsRoot, "examples/request-kind-1-basic.json"));
    const requestPath = join(tempRoot, "request.json");
    const responsePath = join(tempRoot, "response.json");

    writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");

    await expect(
      runCli(["smartcard-sim-sign", "--secret-key", key.secret_key, "--request", requestPath, "--out", responsePath])
    ).rejects.toThrow("smartcard signing requires explicit review acknowledgement");

    await runCli([
      "smartcard-sim-sign",
      "--secret-key",
      key.secret_key,
      "--request",
      requestPath,
      "--review-acknowledged",
      "--out",
      responsePath
    ]);
    await runCli(["verify-response", "--request", requestPath, "--response", responsePath]);

    expect(validateResponse(loadJson(responsePath)).ok).toBe(true);
  });
});
