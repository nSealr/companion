import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSpecsRoot } from "../../fixtures/src/specs-root.js";
import { loadSpecsFixtures } from "../../fixtures/src/fixtures.js";
import { NOSTRSEAL_V0_LIMITS } from "./limits.js";
import { validateRequest, validateResponse } from "./protocol.js";

const specsRoot = resolveSpecsRoot();

function load(rel: string): unknown {
  return JSON.parse(readFileSync(resolve(specsRoot, rel), "utf8"));
}

describe("protocol validation", () => {
  it("accepts valid v0 sign_event requests and responses", () => {
    expect(validateRequest(load("examples/request-kind-1-basic.json")).ok).toBe(true);
    expect(validateResponse(load("examples/response-kind-1-basic.json")).ok).toBe(true);
  });

  it("accepts valid v0 capability requests and ESP32-S3 scaffold responses", () => {
    expect(validateRequest(load("examples/request-get-capabilities.json")).ok).toBe(true);
    expect(validateResponse(load("examples/response-get-capabilities-esp32-s3-scaffold.json")).ok).toBe(true);
  });

  it("accepts valid v0 public-key requests and responses", () => {
    expect(validateRequest(load("examples/request-get-public-key.json")).ok).toBe(true);
    expect(validateResponse(load("examples/response-get-public-key.json")).ok).toBe(true);
    expect(load("vectors/devices/esp32-s3-get-public-key-dev.json")).toMatchObject({
      request: load("examples/request-get-public-key.json"),
      response: load("examples/response-get-public-key.json")
    });
  });

  it("accepts ESP32-S3 scaffold signing-disabled responses", () => {
    expect(validateResponse(load("examples/response-sign-event-disabled-esp32-s3-scaffold.json")).ok).toBe(true);
  });

  it("rejects invalid v0 requests", () => {
    expect(validateRequest(load("examples/invalid/request-sign-event-with-pubkey.json")).ok).toBe(false);
    expect(validateRequest(load("examples/invalid/request-unknown-method.json")).ok).toBe(false);
  });

  it("mirrors the shared NostrSeal v0 implementation limits", () => {
    const fixtures = loadSpecsFixtures(specsRoot);

    expect(NOSTRSEAL_V0_LIMITS).toEqual(fixtures.limits.limits);
  });

  it("rejects shared invalid signing-request vectors deterministically", () => {
    const fixtures = loadSpecsFixtures(specsRoot);
    const requestVectors = fixtures.invalidVectors.filter((vector) => vector.category === "signing-request");

    expect(requestVectors.length).toBeGreaterThan(0);
    for (const vector of requestVectors) {
      const result = validateRequest(vector.request);
      expect(result.ok, vector.name).toBe(false);
      expect(result.error, vector.name).toContain(vector.expected_error);
    }
  });
});
