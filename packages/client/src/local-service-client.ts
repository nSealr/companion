import {
  decodeNativeMessage,
  encodeNativeMessage,
  type NativeMessageFrameExchange
} from "./native-messaging.js";
import {
  LOCAL_CLIENT_SURFACES,
  LOCAL_SERVICE_NAME,
  LOCAL_SERVICE_OPERATIONS,
  LOCAL_SERVICE_PROTOCOL,
  type LocalClientIdentity,
  type LocalServiceOperation,
  type LocalServiceRequest,
  type LocalServiceResponse,
  type PairableLocalServiceOperation
} from "./service.js";

export type LocalServiceExchange = (request: LocalServiceRequest) => Promise<unknown> | unknown;

export type LocalServiceClientOptions = {
  exchange: LocalServiceExchange;
  nextRequestId?: () => string;
};

export type NativeMessagingLocalServiceClientOptions = {
  exchange: NativeMessageFrameExchange;
  nextRequestId?: () => string;
};

type RequestParams = Extract<LocalServiceRequest, { params: unknown }>["params"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isHex64(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function isLocalServiceOperation(value: unknown): value is LocalServiceOperation {
  return typeof value === "string" && LOCAL_SERVICE_OPERATIONS.includes(value as LocalServiceOperation);
}

function isPairableOperation(value: unknown): value is PairableLocalServiceOperation {
  return isLocalServiceOperation(value) && value !== "service_status" && value !== "request_pairing";
}

function isLocalClientIdentity(value: unknown): value is LocalClientIdentity {
  if (!isRecord(value)) return false;
  if (!hasOnlyKeys(value, ["surface", "origin", "app_name", "instance_id"])) return false;
  if (typeof value.surface !== "string" || !LOCAL_CLIENT_SURFACES.includes(value.surface as LocalClientIdentity["surface"])) {
    return false;
  }
  if (typeof value.origin !== "string" || value.origin.length === 0) return false;
  if ("app_name" in value && typeof value.app_name !== "string") return false;
  if ("instance_id" in value && typeof value.instance_id !== "string") return false;
  return true;
}

function defaultRequestIdFactory(): () => string {
  let sequence = 0;
  return () => {
    sequence += 1;
    return `local-client-${sequence}`;
  };
}

function validateRequestId(value: unknown, expectedRequestId: string): string | undefined {
  if (typeof value !== "string") return "local service response request_id is invalid";
  if (value !== expectedRequestId) return "local service response request_id does not match request";
  return undefined;
}

function validateServiceError(value: unknown): string | undefined {
  if (!isRecord(value)) return "local service error must be an object";
  if (!hasOnlyKeys(value, ["code", "message", "retryable"])) return "local service error has unsupported fields";
  if (typeof value.code !== "string" || value.code.length === 0) return "local service error code is invalid";
  if (typeof value.message !== "string" || value.message.length === 0) return "local service error message is invalid";
  if (value.retryable !== false) return "local service error retryable must be false";
  return undefined;
}

function validateServiceResult(value: unknown): string | undefined {
  if (!isRecord(value)) return "local service result must be an object";
  const resultTypes = ["service", "pairing_intent", "validation"].filter((key) => key in value);
  if (resultTypes.length !== 1 || !hasOnlyKeys(value, resultTypes)) {
    return "local service result type is unsupported";
  }
  if ("service" in value) {
    if (!isRecord(value.service)) return "local service status result is invalid";
    if (!hasOnlyKeys(value.service, ["protocol", "name", "operations", "requires_pairing", "stores_production_secrets"])) {
      return "local service status result has unsupported fields";
    }
    if (value.service.protocol !== LOCAL_SERVICE_PROTOCOL) return "local service protocol is invalid";
    if (value.service.name !== LOCAL_SERVICE_NAME) return "local service name is invalid";
    if (
      !Array.isArray(value.service.operations) ||
      value.service.operations.length !== LOCAL_SERVICE_OPERATIONS.length ||
      !value.service.operations.every((operation, index) => operation === LOCAL_SERVICE_OPERATIONS[index])
    ) {
      return "local service operations are invalid";
    }
    if (value.service.requires_pairing !== true) return "local service pairing requirement is invalid";
    if (value.service.stores_production_secrets !== false) return "local service secret-storage flag is invalid";
    return undefined;
  }
  if ("pairing_intent" in value) {
    if (!isRecord(value.pairing_intent)) return "local service pairing result is invalid";
    if (
      !hasOnlyKeys(value.pairing_intent, [
        "format",
        "client_id",
        "client",
        "requested_operations",
        "pairing_digest",
        "requires_user_approval",
        "stores_production_secrets"
      ])
    ) {
      return "local service pairing result has unsupported fields";
    }
    if (value.pairing_intent.format !== "nsealr-local-pairing-intent-v0") return "local service pairing format is invalid";
    if (!isHex64(value.pairing_intent.client_id)) return "local service pairing client_id is invalid";
    if (!isLocalClientIdentity(value.pairing_intent.client)) return "local service pairing client is invalid";
    if (
      !Array.isArray(value.pairing_intent.requested_operations) ||
      value.pairing_intent.requested_operations.length === 0 ||
      !value.pairing_intent.requested_operations.every(isPairableOperation) ||
      new Set(value.pairing_intent.requested_operations).size !== value.pairing_intent.requested_operations.length
    ) {
      return "local service pairing operations are invalid";
    }
    if (!isHex64(value.pairing_intent.pairing_digest)) return "local service pairing digest is invalid";
    if (value.pairing_intent.requires_user_approval !== true) return "local service pairing approval flag is invalid";
    if (value.pairing_intent.stores_production_secrets !== false) return "local service pairing secret-storage flag is invalid";
    return undefined;
  }
  if ("validation" in value) {
    if (!isRecord(value.validation)) return "local service validation result is invalid";
    if (!hasOnlyKeys(value.validation, ["valid", "error"])) return "local service validation result has unsupported fields";
    if (typeof value.validation.valid !== "boolean") return "local service validation flag is invalid";
    if ("error" in value.validation && typeof value.validation.error !== "string") {
      return "local service validation error is invalid";
    }
    return undefined;
  }
  return "local service result type is unsupported";
}

export function validateLocalServiceResponse(value: unknown, expectedRequestId: string): LocalServiceResponse {
  if (!isRecord(value)) throw new Error("local service response must be an object");
  if (value.version !== 1) throw new Error("local service response version must be 1");
  const requestIdError = validateRequestId(value.request_id, expectedRequestId);
  if (requestIdError !== undefined) throw new Error(requestIdError);
  if (value.ok === false) {
    if (!hasOnlyKeys(value, ["version", "request_id", "ok", "error"])) {
      throw new Error("local service error response has unsupported fields");
    }
    const error = validateServiceError(value.error);
    if (error !== undefined) throw new Error(error);
    return value as LocalServiceResponse;
  }
  if (value.ok === true) {
    if (!hasOnlyKeys(value, ["version", "request_id", "ok", "result"])) {
      throw new Error("local service success response has unsupported fields");
    }
    const error = validateServiceResult(value.result);
    if (error !== undefined) throw new Error(error);
    return value as LocalServiceResponse;
  }
  throw new Error("local service response ok flag is invalid");
}

export class LocalServiceClient {
  private readonly exchange: LocalServiceExchange;
  private readonly nextRequestId: () => string;

  constructor(options: LocalServiceClientOptions) {
    this.exchange = options.exchange;
    this.nextRequestId = options.nextRequestId ?? defaultRequestIdFactory();
  }

  serviceStatus(requestId = this.nextRequestId()): Promise<LocalServiceResponse> {
    return this.send({
      version: 1,
      request_id: requestId,
      operation: "service_status"
    });
  }

  requestPairing(
    client: LocalClientIdentity,
    requestedOperations: PairableLocalServiceOperation[],
    requestId = this.nextRequestId()
  ): Promise<LocalServiceResponse> {
    return this.sendWithParams("request_pairing", {
      client,
      requested_operations: requestedOperations
    }, requestId);
  }

  validateSignerRequest(
    client: LocalClientIdentity,
    request: unknown,
    requestId = this.nextRequestId()
  ): Promise<LocalServiceResponse> {
    return this.sendWithParams("validate_signer_request", {
      client,
      request
    }, requestId);
  }

  verifySignerResponse(
    client: LocalClientIdentity,
    request: unknown,
    response: unknown,
    requestId = this.nextRequestId()
  ): Promise<LocalServiceResponse> {
    return this.sendWithParams("verify_signer_response", {
      client,
      request,
      response
    }, requestId);
  }

  private async send(request: LocalServiceRequest): Promise<LocalServiceResponse> {
    const response = await this.exchange(request);
    return validateLocalServiceResponse(response, request.request_id);
  }

  private sendWithParams(
    operation: Exclude<LocalServiceOperation, "service_status">,
    params: RequestParams,
    requestId: string
  ): Promise<LocalServiceResponse> {
    return this.send({
      version: 1,
      request_id: requestId,
      operation,
      params
    } as LocalServiceRequest);
  }
}

export function createNativeMessagingLocalServiceClient(
  options: NativeMessagingLocalServiceClientOptions
): LocalServiceClient {
  return new LocalServiceClient({
    nextRequestId: options.nextRequestId,
    exchange: async (request) => decodeNativeMessage(await options.exchange(encodeNativeMessage(request)))
  });
}
