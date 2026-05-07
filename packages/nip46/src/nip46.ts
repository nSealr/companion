import { validateRequest, validateResponse } from "../../protocol/src/protocol.js";

export type Nip46RequestMessage = {
  id: string;
  method: string;
  params: string[];
};

export type Nip46ResponseMessage = {
  id: string;
  result?: string;
  error?: string;
};

export type Nip46Permission = {
  method: string;
  parameter?: string;
  event_kind?: number;
};

const NIP46_PERMISSION_METHODS = new Set([
  "sign_event",
  "nip04_encrypt",
  "nip04_decrypt",
  "nip44_encrypt",
  "nip44_decrypt",
  "get_public_key",
  "ping",
  "switch_relays"
]);

type NostrSealBridgeRequest =
  | {
      version: 1;
      request_id: string;
      method: "get_public_key";
    }
  | {
      version: 1;
      request_id: string;
      method: "sign_event";
      params: {
        event_template: unknown;
      };
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNip46Id(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value)) {
    throw new Error("NIP-46 request id is invalid");
  }
  return value;
}

function requireMessage(value: unknown): Nip46RequestMessage {
  if (!isRecord(value)) throw new Error("NIP-46 message must be an object");
  const id = requireNip46Id(value.id);
  if (typeof value.method !== "string" || value.method.length === 0) {
    throw new Error("NIP-46 method is required");
  }
  if (!Array.isArray(value.params) || !value.params.every((param) => typeof param === "string")) {
    throw new Error("NIP-46 params must be an array of strings");
  }
  return {
    id,
    method: value.method,
    params: value.params
  };
}

function parseJsonParam(param: string, label: string): unknown {
  try {
    return JSON.parse(param);
  } catch (error) {
    throw new Error(`NIP-46 ${label} param must be valid JSON`);
  }
}

function assertValidNostrSealRequest(request: NostrSealBridgeRequest): void {
  const result = validateRequest(request);
  if (!result.ok) throw new Error(result.error ?? "invalid NostrSeal request");
}

export function parseNip46Permissions(value: string): Nip46Permission[] {
  if (value.trim() === "") return [];
  return value.split(",").map((item) => {
    const permission = item.trim();
    if (permission.length === 0) throw new Error("NIP-46 permission entries must be non-empty");
    const [method, parameter, extra] = permission.split(":");
    if (!method || extra !== undefined) throw new Error("NIP-46 permission format is invalid");
    if (method === "connect") throw new Error("NIP-46 permissions must not request connect");
    if (!NIP46_PERMISSION_METHODS.has(method)) throw new Error(`unsupported permission method: ${method}`);
    if (method === "sign_event" && parameter !== undefined) {
      if (!/^[0-9]+$/u.test(parameter)) throw new Error("NIP-46 sign_event permission kind must be numeric");
      return {
        method,
        parameter,
        event_kind: Number(parameter)
      };
    }
    if (parameter !== undefined) {
      throw new Error(`NIP-46 permission method does not accept a parameter: ${method}`);
    }
    return { method };
  });
}

export function respondToLocalNip46Request(value: unknown): Nip46ResponseMessage | undefined {
  const message = requireMessage(value);
  if (message.method !== "ping") return undefined;
  if (message.params.length !== 0) throw new Error("NIP-46 ping params must be empty");
  return {
    id: message.id,
    result: "pong"
  };
}

export function nostrSealRequestFromNip46(value: unknown): NostrSealBridgeRequest {
  const message = requireMessage(value);
  if (message.method === "ping") {
    throw new Error("NIP-46 ping is handled locally");
  }
  if (message.method === "get_public_key") {
    if (message.params.length !== 0) throw new Error("NIP-46 get_public_key params must be empty");
    const request: NostrSealBridgeRequest = {
      version: 1,
      request_id: message.id,
      method: "get_public_key"
    };
    assertValidNostrSealRequest(request);
    return request;
  }
  if (message.method === "sign_event") {
    if (message.params.length !== 1) throw new Error("NIP-46 sign_event requires one JSON event-template param");
    const request: NostrSealBridgeRequest = {
      version: 1,
      request_id: message.id,
      method: "sign_event",
      params: {
        event_template: parseJsonParam(message.params[0], "sign_event")
      }
    };
    assertValidNostrSealRequest(request);
    return request;
  }
  throw new Error(`unsupported NIP-46 method: ${message.method}`);
}

export function nip46ResponseFromNostrSeal(nip46RequestId: string, response: unknown): Nip46ResponseMessage {
  const id = requireNip46Id(nip46RequestId);
  const shape = validateResponse(response);
  if (!shape.ok) throw new Error(shape.error ?? "invalid NostrSeal response");
  if (!isRecord(response)) throw new Error("NostrSeal response must be an object");

  if (response.ok === false) {
    if (!isRecord(response.error)) throw new Error("NostrSeal error response must include error");
    return {
      id,
      error: `${response.error.code}: ${response.error.message}`
    };
  }

  if (!isRecord(response.result)) throw new Error("NostrSeal success response must include result");
  if ("event" in response.result) {
    return {
      id,
      result: JSON.stringify(response.result.event)
    };
  }
  if (typeof response.result.public_key === "string") {
    return {
      id,
      result: response.result.public_key
    };
  }
  throw new Error("unsupported NostrSeal response result for NIP-46");
}
