import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateRequest, validateResponse } from "./protocol.js";

const specsRoot = resolve("../specs");

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

  it("accepts ESP32-S3 scaffold signing-disabled responses", () => {
    expect(validateResponse(load("examples/response-sign-event-disabled-esp32-s3-scaffold.json")).ok).toBe(true);
  });

  it("rejects invalid v0 requests", () => {
    expect(validateRequest(load("examples/invalid/request-sign-event-with-pubkey.json")).ok).toBe(false);
    expect(validateRequest(load("examples/invalid/request-unknown-method.json")).ok).toBe(false);
  });
});
