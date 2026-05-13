import { createHash } from "node:crypto";
import { verifySignedEventResponse } from "@nsealr/core";
import { compactJsonUtf8ByteLength, NSEALR_V0_LIMITS, validateRequest, validateResponse } from "@nsealr/protocol";

export const LOCAL_SERVICE_PROTOCOL = "nsealr-local-service-v0";
export const LOCAL_SERVICE_NAME = "nsealr-companion-service";
export const MAX_SERVICE_JSON_BYTES = 16 * 1024;

export const LOCAL_SERVICE_OPERATIONS = [
  "service_status",
  "request_pairing",
  "validate_signer_request",
  "verify_signer_response"
] as const;

export const LOCAL_CLIENT_SURFACES = [
  "browser_extension",
  "desktop_app",
  "cli",
  "sdk",
  "native_host_test"
] as const;

export type LocalServiceOperation = (typeof LOCAL_SERVICE_OPERATIONS)[number];
export type PairableLocalServiceOperation = Exclude<LocalServiceOperation, "service_status" | "request_pairing">;
export type LocalClientSurface = (typeof LOCAL_CLIENT_SURFACES)[number];

export type LocalClientIdentity = {
  surface: LocalClientSurface;
  origin: string;
  app_name?: string;
  instance_id?: string;
};

export type LocalClientGrant = {
  client_id: string;
  origin: string;
  surface: LocalClientSurface;
  allowed_operations: PairableLocalServiceOperation[];
  revoked?: boolean;
  expires_at?: number;
};

export type LocalServiceContext = {
  grants?: LocalClientGrant[];
  now?: number;
};

export type PairingIntent = {
  format: "nsealr-local-pairing-intent-v0";
  client_id: string;
  client: LocalClientIdentity;
  requested_operations: PairableLocalServiceOperation[];
  pairing_digest: string;
  requires_user_approval: true;
  stores_production_secrets: false;
};

export type LocalServiceRequest =
  | {
      version: 1;
      request_id: string;
      operation: "service_status";
    }
  | {
      version: 1;
      request_id: string;
      operation: "request_pairing";
      params: {
        client: LocalClientIdentity;
        requested_operations: PairableLocalServiceOperation[];
      };
    }
  | {
      version: 1;
      request_id: string;
      operation: "validate_signer_request";
      params: {
        client: LocalClientIdentity;
        request: unknown;
      };
    }
  | {
      version: 1;
      request_id: string;
      operation: "verify_signer_response";
      params: {
        client: LocalClientIdentity;
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
              requires_pairing: true;
              stores_production_secrets: false;
            };
          }
        | {
            pairing_intent: PairingIntent;
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

function isLocalClientSurface(value: unknown): value is LocalClientSurface {
  return typeof value === "string" && LOCAL_CLIENT_SURFACES.includes(value as LocalClientSurface);
}

function isAllowedOperation(value: unknown): value is LocalServiceOperation {
  return typeof value === "string" && LOCAL_SERVICE_OPERATIONS.includes(value as LocalServiceOperation);
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

function validateClientIdentity(value: unknown): { ok: true; client: LocalClientIdentity } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "client identity must be an object" };
  if (!isLocalClientSurface(value.surface)) return { ok: false, error: "client surface is unsupported" };
  if (typeof value.origin !== "string" || value.origin.length === 0 || value.origin.length > 256) {
    return { ok: false, error: "client origin is invalid" };
  }
  if (!isSupportedOrigin(value.origin)) return { ok: false, error: "client origin scheme is unsupported" };
  if ("app_name" in value && (typeof value.app_name !== "string" || value.app_name.length > 80)) {
    return { ok: false, error: "client app_name is invalid" };
  }
  if ("instance_id" in value && (typeof value.instance_id !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value.instance_id))) {
    return { ok: false, error: "client instance_id is invalid" };
  }
  return {
    ok: true,
    client: {
      surface: value.surface,
      origin: value.origin,
      ...(typeof value.app_name === "string" ? { app_name: value.app_name } : {}),
      ...(typeof value.instance_id === "string" ? { instance_id: value.instance_id } : {})
    }
  };
}

function isSupportedOrigin(origin: string): boolean {
  if (origin.startsWith("extension:")) return true;
  if (origin.startsWith("app:")) return true;
  if (origin.startsWith("cli:")) return true;
  if (origin.startsWith("sdk:")) return true;
  try {
    const url = new URL(origin);
    if (url.origin !== origin) return false;
    if (url.protocol === "https:") return true;
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return true;
  } catch {
    return false;
  }
  return false;
}

function validateRequestedOperations(value: unknown): { ok: true; operations: PairableLocalServiceOperation[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length === 0) return { ok: false, error: "requested_operations must be a non-empty array" };
  const operations: PairableLocalServiceOperation[] = [];
  for (const operation of value) {
    if (!isAllowedOperation(operation)) return { ok: false, error: "requested operation is unsupported" };
    if (operation === "service_status" || operation === "request_pairing") {
      return { ok: false, error: "requested operation does not require pairing" };
    }
    if (operations.includes(operation)) return { ok: false, error: "requested operation is duplicated" };
    operations.push(operation);
  }
  return { ok: true, operations };
}

function validateServiceRequest(value: unknown): { ok: true; request: LocalServiceRequest } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "service request must be an object" };
  if (compactJsonUtf8ByteLength(value) > MAX_SERVICE_JSON_BYTES) {
    return { ok: false, error: "service request JSON exceeds max bytes" };
  }
  if (value.version !== 1) return { ok: false, error: "service request version must be 1" };
  if (!isRequestId(value.request_id)) return { ok: false, error: "service request_id is invalid" };
  if (!isAllowedOperation(value.operation)) return { ok: false, error: "service operation is unsupported" };
  if (value.operation === "service_status") {
    if ("params" in value) return { ok: false, error: "service_status must not include params" };
    return { ok: true, request: value as LocalServiceRequest };
  }
  if (!isRecord(value.params)) return { ok: false, error: `${value.operation} requires params` };
  const client = validateClientIdentity(value.params.client);
  if (!client.ok) return client;
  if (value.operation === "request_pairing") {
    const requestedOperations = validateRequestedOperations(value.params.requested_operations);
    if (!requestedOperations.ok) return requestedOperations;
    return {
      ok: true,
      request: {
        version: 1,
        request_id: value.request_id,
        operation: "request_pairing",
        params: {
          client: client.client,
          requested_operations: requestedOperations.operations
        }
      }
    };
  }
  if (value.operation === "validate_signer_request" && "request" in value.params) {
    return {
      ok: true,
      request: {
        version: 1,
        request_id: value.request_id,
        operation: "validate_signer_request",
        params: {
          client: client.client,
          request: value.params.request
        }
      }
    };
  }
  if (value.operation === "verify_signer_response" && "request" in value.params && "response" in value.params) {
    return {
      ok: true,
      request: {
        version: 1,
        request_id: value.request_id,
        operation: "verify_signer_response",
        params: {
          client: client.client,
          request: value.params.request,
          response: value.params.response
        }
      }
    };
  }
  return { ok: false, error: `${value.operation} params are invalid` };
}

export function clientIdForIdentity(client: LocalClientIdentity): string {
  return createHash("sha256")
    .update(JSON.stringify({
      surface: client.surface,
      origin: client.origin,
      app_name: client.app_name ?? "",
      instance_id: client.instance_id ?? ""
    }))
    .digest("hex");
}

function pairingDigest(intent: Omit<PairingIntent, "pairing_digest">): string {
  return createHash("sha256").update(JSON.stringify(intent)).digest("hex");
}

function pairingIntent(client: LocalClientIdentity, requestedOperations: PairableLocalServiceOperation[]): PairingIntent {
  const intentWithoutDigest = {
    format: "nsealr-local-pairing-intent-v0" as const,
    client_id: clientIdForIdentity(client),
    client,
    requested_operations: requestedOperations,
    requires_user_approval: true as const,
    stores_production_secrets: false as const
  };
  return {
    ...intentWithoutDigest,
    pairing_digest: pairingDigest(intentWithoutDigest)
  };
}

function authorizeClient(
  context: LocalServiceContext,
  client: LocalClientIdentity,
  operation: PairableLocalServiceOperation
): { ok: true } | { ok: false; error: string } {
  const clientId = clientIdForIdentity(client);
  const now = context.now ?? Math.floor(Date.now() / 1000);
  const grant = (context.grants ?? []).find((candidate) =>
    candidate.client_id === clientId &&
    candidate.origin === client.origin &&
    candidate.surface === client.surface
  );
  if (grant === undefined) return { ok: false, error: "client is not paired" };
  if (grant.revoked === true) return { ok: false, error: "client pairing is revoked" };
  if (grant.expires_at !== undefined && grant.expires_at <= now) {
    return { ok: false, error: "client pairing is expired" };
  }
  if (!grant.allowed_operations.includes(operation)) {
    return { ok: false, error: "client is not authorized for operation" };
  }
  return { ok: true };
}

function serviceStatus(requestId: string): LocalServiceResponse {
  return {
    version: 1,
    request_id: requestId,
    ok: true,
    result: {
      service: {
        protocol: LOCAL_SERVICE_PROTOCOL,
        name: LOCAL_SERVICE_NAME,
        operations: [...LOCAL_SERVICE_OPERATIONS],
        requires_pairing: true,
        stores_production_secrets: false
      }
    }
  };
}

export function handleLocalServiceRequest(value: unknown, context: LocalServiceContext = {}): LocalServiceResponse {
  const serviceRequest = validateServiceRequest(value);
  if (!serviceRequest.ok) {
    return errorResponse(value, "invalid_service_request", serviceRequest.error);
  }

  const request = serviceRequest.request;
  if (request.operation === "service_status") return serviceStatus(request.request_id);
  if (request.operation === "request_pairing") {
    return {
      version: 1,
      request_id: request.request_id,
      ok: true,
      result: {
        pairing_intent: pairingIntent(request.params.client, request.params.requested_operations)
      }
    };
  }

  const authorization = authorizeClient(context, request.params.client, request.operation);
  if (!authorization.ok) {
    return errorResponse(request, "unauthorized_client", authorization.error);
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

  return verifySignerResponse(request);
}

function verifySignerResponse(request: Extract<LocalServiceRequest, { operation: "verify_signer_response" }>): LocalServiceResponse {
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
