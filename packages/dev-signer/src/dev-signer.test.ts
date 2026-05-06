import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { verifySignedEventResponse } from "../../core/src/nostr.js";
import { devSignRequest } from "./dev-signer.js";

const specsRoot = resolve("../specs");
const key = JSON.parse(readFileSync(resolve(specsRoot, "vectors/keys/test-key-1.json"), "utf8"));
const request = JSON.parse(readFileSync(resolve(specsRoot, "examples/request-kind-1-basic.json"), "utf8"));

describe("dev signer", () => {
  it("signs a shared fixture request and produces a verifiable response", () => {
    const response = devSignRequest(request, key.secret_key);
    expect(response.request_id).toBe(request.request_id);
    expect(response.ok).toBe(true);
    expect(verifySignedEventResponse(request, response).ok).toBe(true);
  });
});

