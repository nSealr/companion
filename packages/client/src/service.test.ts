import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSpecsRoot } from "@nsealr/fixtures";
import { handleLocalServiceRequest, LOCAL_SERVICE_OPERATIONS, LOCAL_SERVICE_PROTOCOL } from "./service.js";

const specsRoot = resolveSpecsRoot();
const request = JSON.parse(readFileSync(resolve(specsRoot, "examples/request-kind-1-basic.json"), "utf8"));
const response = JSON.parse(readFileSync(resolve(specsRoot, "examples/response-kind-1-basic.json"), "utf8"));

describe("local service boundary", () => {
  it("reports secretless service status", () => {
    const result = handleLocalServiceRequest({
      version: 1,
      request_id: "svc-status-1",
      operation: "service_status"
    });

    expect(result).toEqual({
      version: 1,
      request_id: "svc-status-1",
      ok: true,
      result: {
        service: {
          protocol: LOCAL_SERVICE_PROTOCOL,
          name: "nsealr-companion-service",
          operations: [...LOCAL_SERVICE_OPERATIONS],
          stores_production_secrets: false
        }
      }
    });
  });

  it("validates signer requests without contacting a signer", () => {
    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-validate-1",
      operation: "validate_signer_request",
      params: { request }
    })).toMatchObject({
      ok: true,
      result: { validation: { valid: true } }
    });

    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-validate-2",
      operation: "validate_signer_request",
      params: { request: { ...request, request_id: "bad request id" } }
    })).toMatchObject({
      ok: true,
      result: { validation: { valid: false, error: "request_id is invalid" } }
    });
  });

  it("verifies signer responses against their original request", () => {
    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-verify-1",
      operation: "verify_signer_response",
      params: { request, response }
    })).toMatchObject({
      ok: true,
      result: { validation: { valid: true } }
    });

    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-verify-2",
      operation: "verify_signer_response",
      params: { request, response: { ...response, request_id: "other-request" } }
    })).toMatchObject({
      ok: true,
      result: { validation: { valid: false, error: "response request_id does not match request" } }
    });
  });

  it("rejects malformed local service requests deterministically", () => {
    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "bad service id",
      operation: "service_status"
    })).toEqual({
      version: 1,
      request_id: "invalid-service-request",
      ok: false,
      error: {
        code: "invalid_service_request",
        message: "service request_id is invalid",
        retryable: false
      }
    });
  });
});
