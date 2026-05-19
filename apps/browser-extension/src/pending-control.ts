import {
  isBrowserExtensionRequestId
} from "./messages.js";
import {
  type BrowserExtensionPendingRequestLifecycle,
  type BrowserExtensionPendingRequestState
} from "./pending-request.js";

export const BROWSER_EXTENSION_CONTROL_PROTOCOL = "nsealr-browser-extension-control-v0";

export type BrowserExtensionControlRequest = {
  protocol: typeof BROWSER_EXTENSION_CONTROL_PROTOCOL;
  version: 1;
  request_id: string;
  method: "cancel_pending_request";
  params: {
    pending_request_id: string;
  };
};

export type BrowserExtensionControlResponse = {
  protocol: typeof BROWSER_EXTENSION_CONTROL_PROTOCOL;
  version: 1;
  request_id: string;
  ok: true;
  result: {
    pending_request_id: string;
    cancelled: boolean;
    stores_production_secrets: false;
    contains_secret_material: false;
  };
} | {
  protocol: typeof BROWSER_EXTENSION_CONTROL_PROTOCOL;
  version: 1;
  request_id: string;
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: false;
  };
};

export type BrowserExtensionControlSenderOptions = {
  extensionId?: string;
};

export type BrowserExtensionControlHandlerOptions = BrowserExtensionControlSenderOptions & {
  pendingRequests?: BrowserExtensionPendingRequestLifecycle;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function requireRequestId(value: unknown, label: string): string {
  if (!isBrowserExtensionRequestId(value)) {
    throw new Error(`browser extension control ${label} is invalid`);
  }
  return value;
}

function requireErrorCode(value: string): string {
  if (!/^[a-z0-9_:-]{1,64}$/u.test(value)) {
    throw new Error("browser extension control error code is invalid");
  }
  return value;
}

function requireErrorMessage(value: string): string {
  if (value.length === 0 || value.length > 512) {
    throw new Error("browser extension control error message is invalid");
  }
  return value;
}

function fallbackControlRequestId(value: unknown): string {
  if (isRecord(value) && isBrowserExtensionRequestId(value.request_id)) {
    return value.request_id;
  }
  return "invalid-browser-extension-control-request";
}

function controlErrorResponse(
  requestId: string,
  code: string,
  message: string
): BrowserExtensionControlResponse {
  return {
    protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
    version: 1,
    request_id: requireRequestId(requestId, "request_id"),
    ok: false,
    error: {
      code: requireErrorCode(code),
      message: requireErrorMessage(message),
      retryable: false
    }
  };
}

function internalSenderUrl(value: unknown, label: string): URL | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`browser extension control sender ${label} is invalid`);
  }
  try {
    return new URL(value);
  } catch {
    throw new Error(`browser extension control sender ${label} is invalid`);
  }
}

function requireInternalSender(value: unknown, options: BrowserExtensionControlSenderOptions): void {
  if (!isRecord(value)) {
    throw new Error("browser extension control sender must be an object");
  }
  const senderId = value.id;
  if (typeof senderId !== "string" || senderId.length === 0) {
    throw new Error("browser extension control sender id is required");
  }
  if (options.extensionId !== undefined && senderId !== options.extensionId) {
    throw new Error("browser extension control sender id does not match expected extension id");
  }
  const originUrl = internalSenderUrl(value.origin, "origin");
  const pageUrl = internalSenderUrl(value.url, "url");
  if (originUrl === undefined && pageUrl === undefined) {
    throw new Error("browser extension control sender internal origin or url is required");
  }
  for (const url of [originUrl, pageUrl]) {
    if (url === undefined) continue;
    if (url.protocol === "http:" || url.protocol === "https:") {
      throw new Error("browser extension control sender must be extension-internal");
    }
    if (url.protocol !== "chrome-extension:" && url.protocol !== "moz-extension:") {
      throw new Error("browser extension control sender URL scheme is unsupported");
    }
  }
}

function parseControlParams(value: unknown): BrowserExtensionControlRequest["params"] {
  if (!isRecord(value)) {
    throw new Error("browser extension control params must be an object");
  }
  if (!hasOnlyKeys(value, ["pending_request_id"])) {
    throw new Error("browser extension control params have unsupported fields");
  }
  return {
    pending_request_id: requireRequestId(value.pending_request_id, "pending_request_id")
  };
}

export function isBrowserExtensionControlEnvelope(value: unknown): boolean {
  return isRecord(value) && value.protocol === BROWSER_EXTENSION_CONTROL_PROTOCOL;
}

export function parseBrowserExtensionControlRequest(value: unknown): BrowserExtensionControlRequest {
  if (!isRecord(value)) {
    throw new Error("browser extension control request must be an object");
  }
  if (!hasOnlyKeys(value, ["protocol", "version", "request_id", "method", "params"])) {
    throw new Error("browser extension control request has unsupported fields");
  }
  if (value.protocol !== BROWSER_EXTENSION_CONTROL_PROTOCOL) {
    throw new Error("browser extension control protocol is unsupported");
  }
  if (value.version !== 1) {
    throw new Error("browser extension control version is unsupported");
  }
  if (value.method !== "cancel_pending_request") {
    throw new Error("browser extension control method is unsupported");
  }
  return {
    protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
    version: 1,
    request_id: requireRequestId(value.request_id, "request_id"),
    method: "cancel_pending_request",
    params: parseControlParams(value.params)
  };
}

export function handleBrowserExtensionControlMessage(
  value: unknown,
  runtimeSender: unknown,
  options: BrowserExtensionControlHandlerOptions
): BrowserExtensionControlResponse {
  const requestId = fallbackControlRequestId(value);
  let request: BrowserExtensionControlRequest;
  try {
    request = parseBrowserExtensionControlRequest(value);
  } catch {
    return controlErrorResponse(requestId, "invalid_request", "browser extension control request is invalid");
  }
  try {
    requireInternalSender(runtimeSender, options);
  } catch {
    return controlErrorResponse(request.request_id, "invalid_sender", "browser extension control sender is invalid");
  }
  if (options.pendingRequests === undefined) {
    return controlErrorResponse(request.request_id, "pending_requests_unavailable", "pending request control is unavailable");
  }

  let cancelled: BrowserExtensionPendingRequestState | undefined;
  try {
    cancelled = options.pendingRequests.cancel(request.params.pending_request_id);
  } catch {
    return controlErrorResponse(request.request_id, "cancel_failed", "pending request cancellation failed");
  }
  return {
    protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
    version: 1,
    request_id: request.request_id,
    ok: true,
    result: {
      pending_request_id: request.params.pending_request_id,
      cancelled: cancelled !== undefined,
      stores_production_secrets: false,
      contains_secret_material: false
    }
  };
}
