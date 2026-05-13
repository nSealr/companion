import {
  handleBrowserExtensionContentScriptBridgeMessage,
  type BrowserExtensionContentScriptBackgroundRequester
} from "./content-script.js";
import {
  BROWSER_EXTENSION_PAGE_BRIDGE_PROTOCOL,
  type BrowserExtensionPageBridgeResponse
} from "./page-bridge.js";

export type BrowserExtensionContentWindowEvent = {
  data: unknown;
  origin: string;
  source: unknown;
};

export type BrowserExtensionContentWindowBridgeOptions = {
  expectedOrigin: string;
  expectedSource: unknown;
  sender: unknown;
  requestBackground: BrowserExtensionContentScriptBackgroundRequester;
  abortSignal?: AbortSignal;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePageOrigin(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if (url.origin !== value) return undefined;
    if (url.protocol === "https:") return value;
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      return value;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function requireExpectedPageOrigin(value: unknown): string {
  const origin = normalizePageOrigin(value);
  if (origin === undefined) {
    throw new Error("browser content-window expected origin is invalid");
  }
  return origin;
}

function isPageBridgeEnvelope(value: unknown): boolean {
  return isRecord(value) && value.protocol === BROWSER_EXTENSION_PAGE_BRIDGE_PROTOCOL;
}

export async function handleBrowserExtensionContentWindowBridgeEvent(
  event: unknown,
  options: BrowserExtensionContentWindowBridgeOptions
): Promise<BrowserExtensionPageBridgeResponse | undefined> {
  if (!isRecord(event)) throw new Error("browser content-window event must be an object");
  if (event.source !== options.expectedSource) return undefined;
  const expectedOrigin = requireExpectedPageOrigin(options.expectedOrigin);
  if (normalizePageOrigin(event.origin) !== expectedOrigin) return undefined;
  if (!isPageBridgeEnvelope(event.data)) return undefined;
  return handleBrowserExtensionContentScriptBridgeMessage(event.data, {
    sender: options.sender,
    requestBackground: options.requestBackground,
    ...(options.abortSignal !== undefined ? { abortSignal: options.abortSignal } : {})
  });
}
