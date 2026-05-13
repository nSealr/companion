import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSpecsRoot } from "@nsealr/fixtures";
import {
  clientIdForIdentity,
  decodeNativeMessage,
  encodeNativeMessage,
  type LocalClientGrant,
  type LocalClientIdentity
} from "@nsealr/client";
import { runServiceOnce } from "./index.js";

const specsRoot = resolveSpecsRoot();
const request = JSON.parse(readFileSync(resolve(specsRoot, "examples/request-kind-1-basic.json"), "utf8"));
const client: LocalClientIdentity = {
  surface: "native_host_test",
  origin: "app:nsealr-service-test",
  app_name: "nSealr service test"
};
const grant: LocalClientGrant = {
  client_id: clientIdForIdentity(client),
  origin: client.origin,
  surface: client.surface,
  allowed_operations: ["validate_signer_request"],
  approved_at: 1_900_000_000,
  expires_at: 2_000_000_000
};

describe("local companion service app", () => {
  it("handles one native-messaging service request", () => {
    const output = runServiceOnce(encodeNativeMessage({
      version: 1,
      request_id: "svc-status-1",
      operation: "service_status"
    }));

    expect(decodeNativeMessage(output)).toMatchObject({
      version: 1,
      request_id: "svc-status-1",
      ok: true,
      result: {
        service: {
          protocol: "nsealr-local-service-v0",
          stores_production_secrets: false
        }
      }
    });
  });

  it("passes injected in-memory authorization context to the local service", () => {
    const output = runServiceOnce(encodeNativeMessage({
      version: 1,
      request_id: "svc-validate-1",
      operation: "validate_signer_request",
      params: { client, request }
    }), {
      grants: [grant],
      now: 1_900_000_000
    });

    expect(decodeNativeMessage(output)).toMatchObject({
      version: 1,
      request_id: "svc-validate-1",
      ok: true,
      result: {
        validation: { valid: true }
      }
    });
  });

  it("returns deterministic native-message errors for malformed frames", () => {
    const output = runServiceOnce(new Uint8Array([1, 0, 0, 0]));

    expect(decodeNativeMessage(output)).toMatchObject({
      version: 1,
      request_id: "invalid-service-request",
      ok: false,
      error: {
        code: "invalid_native_message",
        message: expect.stringMatching(/length prefix/u),
        retryable: false
      }
    });
  });
});
