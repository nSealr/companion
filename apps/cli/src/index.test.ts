import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSpecsRoot } from "../../../packages/fixtures/src/specs-root.js";
import { decodeSerialFrame, encodeSerialFrame } from "../../../packages/framing/src/serial.js";
import { validateRequest, validateResponse } from "../../../packages/protocol/src/protocol.js";
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
  it("creates parameterless device requests with caller supplied request ids", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-device-requests-"));
    const cases = [
      ["get-capabilities", "req-cli-capabilities", "get_capabilities"],
      ["get-public-key", "req-cli-public-key", "get_public_key"],
      ["get-signing-status", "req-cli-signing-status", "get_signing_status"]
    ] as const;

    for (const [cliMethod, requestId, protocolMethod] of cases) {
      const requestPath = join(tempRoot, `${cliMethod}.json`);

      await runCli(["request", cliMethod, "--request-id", requestId, "--out", requestPath]);

      const request = loadJson(requestPath);
      expect(request).toEqual({
        version: 1,
        request_id: requestId,
        method: protocolMethod
      });
      expect(validateRequest(request).ok).toBe(true);
    }
  });

  it("rejects invalid caller supplied request ids before writing device requests", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-device-request-id-"));
    const requestPath = join(tempRoot, "request.json");

    await expect(
      runCli(["request", "get-signing-status", "--request-id", "invalid request id", "--out", requestPath])
    ).rejects.toThrow("request_id is invalid");

    expect(existsSync(requestPath)).toBe(false);
  });

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
      "verified 2 event fixtures, 4 review fixtures, 2 review-screen fixtures, 1 review display-frame fixture, 2 review transcript fixtures, 5 NIP-46 payload fixtures, 1 NIP-46 policy-file fixture, and 43 invalid hardening fixtures"
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

  it("rejects NIP-46 policy-file fixture drift", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-invalid-nip46-policy-file-"));
    const tempSpecsRoot = join(tempRoot, "specs");
    cpSync(specsRoot, tempSpecsRoot, { recursive: true });
    const policyPath = resolve(tempSpecsRoot, "vectors/nip46-policy-files/sign-event-kind-1-approved.json");
    const policy = loadJson(policyPath) as {
      approved_permissions: Array<{ event_kind: number }>;
    };
    policy.approved_permissions[0].event_kind = 4;
    writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");

    await expect(runCli(["fixture", "verify", "--specs", tempSpecsRoot])).rejects.toThrow(
      /NIP-46 policy-file fixture/u
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

  it("can read NIP-46 approved permissions from an explicit policy file", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-nip46-policy-file-"));
    const signEventVector = loadJson(resolve(specsRoot, "vectors/nip46/sign-event-kind-1-basic.json")) as {
      request_message: unknown;
      bridge_decisions: Array<{
        decision: unknown;
      }>;
    };
    const messagePath = join(tempRoot, "message.json");
    const policyPath = resolve(specsRoot, "vectors/nip46-policy-files/sign-event-kind-1-approved.json");
    const decisionPath = join(tempRoot, "decision.json");

    writeFileSync(messagePath, `${JSON.stringify(signEventVector.request_message, null, 2)}\n`, "utf8");

    await runCli(["nip46", "decide", "--message", messagePath, "--policy-file", policyPath, "--out", decisionPath]);

    expect(loadJson(decisionPath)).toEqual(signEventVector.bridge_decisions[0].decision);
  });

  it("rejects ambiguous NIP-46 permission sources", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-nip46-ambiguous-policy-"));
    const signEventVector = loadJson(resolve(specsRoot, "vectors/nip46/sign-event-kind-1-basic.json")) as {
      request_message: unknown;
    };
    const messagePath = join(tempRoot, "message.json");
    const policyPath = resolve(specsRoot, "vectors/nip46-policy-files/sign-event-kind-1-approved.json");
    const decisionPath = join(tempRoot, "decision.json");

    writeFileSync(messagePath, `${JSON.stringify(signEventVector.request_message, null, 2)}\n`, "utf8");

    await expect(
      runCli([
        "nip46",
        "decide",
        "--message",
        messagePath,
        "--permissions",
        "sign_event:1",
        "--policy-file",
        policyPath,
        "--out",
        decisionPath
      ])
    ).rejects.toThrow("--policy-file cannot be combined with --permissions");
  });

  it("rejects invalid NIP-46 decisions before writing output", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-invalid-nip46-hardening-"));
    const vector = loadJson(resolve(specsRoot, "vectors/invalid/nip46-sign-event-param-unsafe-template.json")) as {
      request_message: unknown;
    };
    const messagePath = join(tempRoot, "message.json");
    const decisionPath = join(tempRoot, "decision.json");

    writeFileSync(messagePath, `${JSON.stringify(vector.request_message, null, 2)}\n`, "utf8");

    await expect(
      runCli(["nip46", "decide", "--message", messagePath, "--permissions", "sign_event", "--out", decisionPath])
    ).rejects.toThrow("event_template contains forbidden fields");
    expect(existsSync(decisionPath)).toBe(false);
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

  it("rejects invalid original requests before verifying responses", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-invalid-verify-request-"));
    const requestPath = join(tempRoot, "request.json");
    const responsePath = join(tempRoot, "response.json");
    writeFileSync(
      requestPath,
      `${JSON.stringify(
        {
          version: 1,
          request_id: "req-invalid-original",
          method: "get_capabilities",
          unexpected: true
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    writeFileSync(
      responsePath,
      `${JSON.stringify(
        {
          version: 1,
          request_id: "req-invalid-original",
          ok: false,
          error: {
            code: "user_rejected",
            message: "Rejected",
            retryable: false
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    await expect(runCli(["verify-response", "--request", requestPath, "--response", responsePath])).rejects.toThrow(
      "unknown top-level fields"
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

  it("renders review previews bound to a caller-provided signer author pubkey", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-review-author-"));
    const vector = loadJson(resolve(specsRoot, "vectors/review/kind-1-basic.json")) as { request: unknown };
    const authorPubkey = "17162c921dc4d2518f9a101db33695df1afb56ab82f5ff3e5da6eec3ca5cd917";
    const requestPath = join(tempRoot, "request.qr");
    const reviewPath = join(tempRoot, "review.json");
    const screenReviewPath = join(tempRoot, "screen-review.json");

    writeFileSync(requestPath, `${encodeQrEnvelope(vector.request)}\n`, "utf8");

    await runCli([
      "review-request",
      "--request",
      requestPath,
      "--request-format",
      "qr",
      "--author-pubkey",
      authorPubkey,
      "--out",
      reviewPath
    ]);
    await runCli([
      "review-request",
      "--request",
      requestPath,
      "--request-format",
      "qr",
      "--screen-review",
      "--author-pubkey",
      authorPubkey,
      "--out",
      screenReviewPath
    ]);

    const screenReview = loadJson(screenReviewPath) as { pages: Array<{ lines: string[] }> };
    expect(loadJson(reviewPath)).toMatchObject({ author_pubkey: authorPubkey });
    expect(screenReview.pages[0].lines).toEqual(["Kind 1", "Created 1710000000", "Author", authorPubkey]);
  });

  it("renders screen-review pages with approval digest from a QR signing request", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-screen-review-"));
    const vector = loadJson(resolve(specsRoot, "vectors/review-screens/kind-1-tags.json")) as {
      request: unknown;
      screen_review: unknown;
    };
    const requestPath = join(tempRoot, "request.qr");
    const reviewPath = join(tempRoot, "screen-review.json");

    writeFileSync(requestPath, `${encodeQrEnvelope(vector.request)}\n`, "utf8");

    await runCli(["review-request", "--request", requestPath, "--request-format", "qr", "--screen-review", "--out", reviewPath]);

    expect(loadJson(reviewPath)).toEqual(vector.screen_review);
  });

  it("runs request -> smartcard-sim-sign -> verify-response after explicit review acknowledgement", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "nseal-cli-smartcard-"));
    const key = loadJson(resolve(specsRoot, "vectors/keys/test-key-1.json")) as { secret_key: string };
    const request = loadJson(resolve(specsRoot, "examples/request-kind-1-basic.json"));
    const screenReview = loadJson(resolve(specsRoot, "vectors/review-screens/kind-1-basic.json")) as {
      screen_review: { approval_digest: string };
    };
    const requestPath = join(tempRoot, "request.json");
    const responsePath = join(tempRoot, "response.json");
    const mismatchResponsePath = join(tempRoot, "mismatch-response.json");

    writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");

    await expect(
      runCli(["smartcard-sim-sign", "--secret-key", key.secret_key, "--request", requestPath, "--out", responsePath])
    ).rejects.toThrow("smartcard signing requires explicit review acknowledgement");

    await expect(
      runCli([
        "smartcard-sim-sign",
        "--secret-key",
        key.secret_key,
        "--request",
        requestPath,
        "--review-acknowledged",
        "--out",
        responsePath
      ])
    ).rejects.toThrow("approval_digest is required for display-less smartcard signing");
    expect(existsSync(responsePath)).toBe(false);

    await expect(
      runCli([
        "smartcard-sim-sign",
        "--secret-key",
        key.secret_key,
        "--request",
        requestPath,
        "--review-acknowledged",
        "--approval-digest",
        "00".repeat(32),
        "--out",
        mismatchResponsePath
      ])
    ).rejects.toThrow("approval_digest_mismatch");
    expect(existsSync(mismatchResponsePath)).toBe(false);

    await runCli([
      "smartcard-sim-sign",
      "--secret-key",
      key.secret_key,
      "--request",
      requestPath,
      "--review-acknowledged",
      "--approval-digest",
      screenReview.screen_review.approval_digest,
      "--out",
      responsePath
    ]);
    await runCli(["verify-response", "--request", requestPath, "--response", responsePath]);

    expect(validateResponse(loadJson(responsePath)).ok).toBe(true);
  });
});
