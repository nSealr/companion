import {
  BROWSER_EXTENSION_MESSAGE_PROTOCOL,
  isBrowserExtensionRequestId,
  parseBrowserExtensionRequest,
  type BrowserExtensionRequest
} from "./messages.js";
import { type BrowserExtensionResponse } from "./handler.js";
import { type BrowserExtensionPageRequestOptions } from "./page-provider.js";

export const BROWSER_EXTENSION_PAGE_BRIDGE_PROTOCOL = "nsealr-page-bridge-v0";

export type BrowserExtensionPageBridgeRequest = {
  protocol: typeof BROWSER_EXTENSION_PAGE_BRIDGE_PROTOCOL;
  version: 1;
  direction: "page_to_extension";
  request_id: string;
  request: BrowserExtensionRequest;
};

export type BrowserExtensionPageBridgeResponse = {
  protocol: typeof BROWSER_EXTENSION_PAGE_BRIDGE_PROTOCOL;
  version: 1;
  direction: "extension_to_page";
  request_id: string;
  response: BrowserExtensionResponse;
};

export type BrowserExtensionPageBridgeOptions = {
  requestBackground: (
    request: BrowserExtensionRequest,
    options: BrowserExtensionPageRequestOptions
  ) => Promise<unknown> | unknown;
  abortSignal?: AbortSignal;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function assertNotCancelled(abortSignal: AbortSignal | undefined): void {
  if (abortSignal?.aborted === true) {
    throw new Error("browser page bridge request was cancelled");
  }
}

export function parseBrowserExtensionPageBridgeRequest(value: unknown): BrowserExtensionPageBridgeRequest {
  if (!isRecord(value)) throw new Error("browser page bridge request must be an object");
  if (!hasOnlyKeys(value, ["protocol", "version", "direction", "request_id", "request"])) {
    throw new Error("browser page bridge request has unsupported fields");
  }
  if (value.protocol !== BROWSER_EXTENSION_PAGE_BRIDGE_PROTOCOL) {
    throw new Error("browser page bridge request protocol is unsupported");
  }
  if (value.version !== 1) {
    throw new Error("browser page bridge request version is unsupported");
  }
  if (value.direction !== "page_to_extension") {
    throw new Error("browser page bridge request direction is unsupported");
  }
  if (!isBrowserExtensionRequestId(value.request_id)) {
    throw new Error("browser page bridge request_id is invalid");
  }
  const request = parseBrowserExtensionRequest(value.request);
  if (request.request_id !== value.request_id) {
    throw new Error("browser page bridge request_id does not match inner request");
  }
  return {
    protocol: BROWSER_EXTENSION_PAGE_BRIDGE_PROTOCOL,
    version: 1,
    direction: "page_to_extension",
    request_id: value.request_id,
    request
  };
}

function requireBackgroundResponse(value: unknown, requestId: string): BrowserExtensionResponse {
  if (!isRecord(value)) throw new Error("browser page bridge response must be an object");
  if (value.protocol !== BROWSER_EXTENSION_MESSAGE_PROTOCOL) {
    throw new Error("browser page bridge response protocol is unsupported");
  }
  if (value.version !== 1) {
    throw new Error("browser page bridge response version is unsupported");
  }
  if (!isBrowserExtensionRequestId(value.request_id) || value.request_id !== requestId) {
    throw new Error("browser page bridge response request_id does not match request");
  }
  if (value.ok !== true && value.ok !== false) {
    throw new Error("browser page bridge response ok flag is invalid");
  }
  return value as BrowserExtensionResponse;
}

export async function handleBrowserExtensionPageBridgeRequest(
  value: unknown,
  options: BrowserExtensionPageBridgeOptions
): Promise<BrowserExtensionPageBridgeResponse> {
  assertNotCancelled(options.abortSignal);
  const request = parseBrowserExtensionPageBridgeRequest(value);
  const response = requireBackgroundResponse(await options.requestBackground(request.request, {
    ...(options.abortSignal !== undefined ? { abortSignal: options.abortSignal } : {})
  }), request.request_id);
  return {
    protocol: BROWSER_EXTENSION_PAGE_BRIDGE_PROTOCOL,
    version: 1,
    direction: "extension_to_page",
    request_id: request.request_id,
    response
  };
}
