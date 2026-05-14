import {
  type BrowserExtensionBackgroundController,
  type BrowserExtensionBackgroundRequestOptions
} from "./background.js";
import { type BrowserExtensionResponse } from "./handler.js";
import {
  browserExtensionErrorResponse,
  isBrowserExtensionRequestId
} from "./messages.js";
import {
  browserExtensionClientContextFromSender,
  type BrowserExtensionSenderInput
} from "./sender.js";

export type BrowserExtensionRuntimeSender = {
  id?: unknown;
  origin?: unknown;
  url?: unknown;
};

export type BrowserExtensionRuntimeSenderOptions = {
  extensionId?: string;
  appName?: string;
};

export type BrowserExtensionRuntimeMessageOptions = BrowserExtensionRuntimeSenderOptions & {
  controller: Pick<BrowserExtensionBackgroundController, "handleRequest">;
  nativeMessageAbortSignal?: AbortSignal;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fallbackRequestId(value: unknown): string {
  if (isRecord(value) && isBrowserExtensionRequestId(value.request_id)) {
    return value.request_id;
  }
  return "invalid-browser-extension-request";
}

function requireRuntimeString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`browser runtime sender ${label} is invalid`);
  }
  return value;
}

function runtimeExtensionId(
  runtimeSender: BrowserExtensionRuntimeSender,
  options: BrowserExtensionRuntimeSenderOptions
): string {
  const senderId = requireRuntimeString(runtimeSender.id, "id");
  if (options.extensionId !== undefined && senderId !== undefined && options.extensionId !== senderId) {
    throw new Error("browser runtime sender id does not match expected extension id");
  }
  const extensionId = options.extensionId ?? senderId;
  if (extensionId === undefined) {
    throw new Error("browser runtime sender id is required");
  }
  return extensionId;
}

export function browserExtensionSenderFromRuntimeSender(
  value: unknown,
  options: BrowserExtensionRuntimeSenderOptions = {}
): BrowserExtensionSenderInput {
  if (!isRecord(value)) throw new Error("browser runtime sender must be an object");
  const runtimeSender: BrowserExtensionRuntimeSender = value;
  const pageOrigin = requireRuntimeString(runtimeSender.origin, "origin");
  const pageUrl = requireRuntimeString(runtimeSender.url, "url");
  if (pageOrigin === undefined && pageUrl === undefined) {
    throw new Error("browser runtime sender page origin or url is required");
  }
  const sender: BrowserExtensionSenderInput = {
    extension_id: runtimeExtensionId(runtimeSender, options),
    ...(pageOrigin !== undefined ? { page_origin: pageOrigin } : {}),
    ...(pageUrl !== undefined ? { page_url: pageUrl } : {}),
    ...(options.appName !== undefined ? { app_name: options.appName } : {})
  };
  browserExtensionClientContextFromSender(sender);
  return sender;
}

export async function handleBrowserExtensionRuntimeMessage(
  value: unknown,
  runtimeSender: unknown,
  options: BrowserExtensionRuntimeMessageOptions
): Promise<BrowserExtensionResponse> {
  let sender: BrowserExtensionSenderInput;
  try {
    sender = browserExtensionSenderFromRuntimeSender(runtimeSender, options);
  } catch {
    return browserExtensionErrorResponse(
      fallbackRequestId(value),
      "invalid_sender",
      "browser runtime sender is invalid"
    );
  }
  const requestOptions: BrowserExtensionBackgroundRequestOptions = {
    ...(options.nativeMessageAbortSignal !== undefined
      ? { nativeMessageAbortSignal: options.nativeMessageAbortSignal }
      : {})
  };
  return options.controller.handleRequest(value, sender, requestOptions);
}
