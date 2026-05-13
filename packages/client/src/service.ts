import { verifySignedEventResponse } from "@nsealr/core";
import { compactJsonUtf8ByteLength, NSEALR_V0_LIMITS, validateRequest, validateResponse } from "@nsealr/protocol";

export const LOCAL_SERVICE_PROTOCOL = "nsealr-local-service-v0";
export const LOCAL_SERVICE_NAME = "nsealr-companion-service";
export const LOCAL_SERVICE_OPERATIONS = [
  "service_status",
  "validate_signer_request",
  "verify_signer_response"
] as const;

export type LocalServiceOperation = (typeof LOCAL_SERVICE_OPERATIONS)[number];

export type LocalServiceRequest =
  | {
      version: 1;
      request_id: string;
      operation: "service_status";
    }
  | {
      version: 1;
      request_id: string;
      operation: "validate_signer_request";
      params: {
        request: unknown;
      };
    }
  | {
      version: 1;
      request_id: string;
      operation: "verify_signer_response";
      params: {
        request: unknown;
        response: unknown;
      };
    };

export type LocalServiceResponse =
  | {
      version: 1;
      request_id: string;
      ok: true;
      result:
        | {
            service: {
              protocol: typeof LOCAL_SERVICE_PROTOCOL;
              name: typeof LOCAL_SERVICE_NAME;
              operations: LocalServiceOperation[];
              stores_production_secrets: false;
            };
          }
        | {
            validation: {
              valid: boolean;
              error?: string;
            };
          };
    }
  | {
      version: 1;
      request_id: string;
      ok: false;
      error: {
        code: string;
        message: string;
        retryable: false;
      };
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRequestId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9._:-]+$/u.test(value) &&
    value.length <= NSEALR_V0_LIMITS.max_request_id_length
  );
}

function safeRequestId(value: unknown): string {
  return isRecord(value) && isRequestId(value.request_id) ? value.request_id : "invalid-service-request";
}

function errorResponse(request: unknown, code: string, message: string): LocalServiceResponse {
  return {
    version: 1,
    request_id: safeRequestId(request),
    ok: false,
    error: {
      code,
      message,
      retryable: false
    }
  };
}

function validationResult(valid: boolean, error?: string): { validation: { valid: boolean; error?: string } } {
  return error === undefined ? { validation: { valid } } : { validation: { valid, error } };
}

function validateServiceRequest(value: unknown): { ok: true; request: LocalServiceRequest } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "service request must be an object" };
  if (compactJsonUtf8ByteLength(value) > MAX_SERVICE_JSON_BYTES) {
    return { ok: false, error: "service request JSON exceeds max bytes" };
  }
  if (value.version !== 1) return { ok: false, error: "service request version must be 1" };
  if (!isRequestId(value.request_id)) return { ok: false, error: "service request_id is invalid" };
  if (!LOCAL_SERVICE_OPERATIONS.includes(value.operation as LocalServiceOperation)) {
    return { ok: false, error: "service operation is unsupported" };
  }
  if (value.operation === "service_status") {
    if ("params" in value) return { ok: false, error: "service_status must not include params" };
    return { ok: true, request: value as LocalServiceRequest };
  }
  if (!isRecord(value.params)) return { ok: false, error: `${String(value.operation)} requires params` };
  if (value.operation === "validate_signer_request" && "request" in value.params) {
    return { ok: true, request: value as LocalServiceRequest };
  }
  if (value.operation === "verify_signer_response" && "request" in value.params && "response" in value.params) {
    return { ok: true, request: value as LocalServiceRequest };
  }
  return { ok: false, error: `${String(value.operation)} params are invalid` };
}

export const MAX_SERVICE_JSON_BYTES = 16 * 1024;

export function handleLocalServiceRequest(value: unknown): LocalServiceResponse {
  const serviceRequest = validateServiceRequest(value);
  if (!serviceRequest.ok) {
    return errorResponse(value, "invalid_service_request", serviceRequest.error);
  }

  const request = serviceRequest.request;
  if (request.operation === "service_status") {
    return {
      version: 1,
      request_id: request.request_id,
      ok: true,
      result: {
        service: {
          protocol: LOCAL_SERVICE_PROTOCOL,
          name: LOCAL_SERVICE_NAME,
          operations: [...LOCAL_SERVICE_OPERATIONS],
          stores_production_secrets: false
        }
      }
    };
  }

  if (request.operation === "validate_signer_request") {
    const validation = validateRequest(request.params.request);
    return {
      version: 1,
      request_id: request.request_id,
      ok: true,
      result: validationResult(validation.ok, validation.error)
    };
  }

  const signerRequest = validateRequest(request.params.request);
  if (!signerRequest.ok) {
    return {
      version: 1,
      request_id: request.request_id,
      ok: true,
      result: validationResult(false, signerRequest.error)
    };
  }
  const signerResponse = validateResponse(request.params.response);
  if (!signerResponse.ok) {
    return {
      version: 1,
      request_id: request.request_id,
      ok: true,
      result: validationResult(false, signerResponse.error)
    };
  }
  if (
    isRecord(request.params.request) &&
    isRecord(request.params.response) &&
    request.params.request.request_id !== request.params.response.request_id
  ) {
    return {
      version: 1,
      request_id: request.request_id,
      ok: true,
      result: validationResult(false, "response request_id does not match request")
    };
  }
  if (
    isRecord(request.params.request) &&
    request.params.request.method === "sign_event" &&
    isRecord(request.params.response) &&
    request.params.response.ok === true
  ) {
    const verification = verifySignedEventResponse(request.params.request, request.params.response);
    if (!verification.ok) {
      return {
        version: 1,
        request_id: request.request_id,
        ok: true,
        result: validationResult(false, verification.error)
      };
    }
  }
  return {
    version: 1,
    request_id: request.request_id,
    ok: true,
    result: validationResult(true)
  };
}
