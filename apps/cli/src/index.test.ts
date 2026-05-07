import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateResponse } from "../../../packages/protocol/src/protocol.js";
import { decodeQrEnvelope } from "../../../packages/qr/src/qr.js";
import { buildCli } from "./index.js";

const specsRoot = resolve("../specs");

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function runCli(args: string[]): Promise<void> {
  const cli = buildCli().exitOverride();
  await cli.parseAsync(args, { from: "user" });
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
});
