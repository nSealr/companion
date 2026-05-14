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

export type BrowserExtensionContentWindowMessageListener = (event: unknown) => void;

export type BrowserExtensionContentWindowEventTarget = {
  addEventListener(type: "message", listener: BrowserExtensionContentWindowMessageListener): void;
  removeEventListener(type: "message", listener: BrowserExtensionContentWindowMessageListener): void;
};

export type BrowserExtensionContentWindowResponseTarget = {
  source: unknown;
  origin: string;
};

export type BrowserExtensionContentWindowResponsePoster = (
  response: BrowserExtensionPageBridgeResponse,
  target: BrowserExtensionContentWindowResponseTarget
) => Promise<void> | void;

export type BrowserExtensionContentWindowListenerOptions = BrowserExtensionContentWindowBridgeOptions & {
  target: BrowserExtensionContentWindowEventTarget;
  postResponse: BrowserExtensionContentWindowResponsePoster;
  onError?: (error: unknown) => void;
};

export type BrowserExtensionContentWindowListenerHandle = {
  dispose(): void;
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

function requireResponseTarget(event: unknown): BrowserExtensionContentWindowResponseTarget {
  if (!isRecord(event) || typeof event.origin !== "string") {
    throw new Error("browser content-window response target is invalid");
  }
  return {
    source: event.source,
    origin: event.origin
  };
}

function reportListenerError(error: unknown, onError: ((error: unknown) => void) | undefined): void {
  if (onError === undefined) return;
  try {
    onError(error);
  } catch {
    // Listener diagnostics must not create unhandled browser promise failures.
  }
}

export function installBrowserExtensionContentWindowBridgeListener(
  options: BrowserExtensionContentWindowListenerOptions
): BrowserExtensionContentWindowListenerHandle {
  let disposed = false;
  const bridgeOptions: BrowserExtensionContentWindowBridgeOptions = {
    expectedOrigin: options.expectedOrigin,
    expectedSource: options.expectedSource,
    sender: options.sender,
    requestBackground: options.requestBackground,
    ...(options.abortSignal !== undefined ? { abortSignal: options.abortSignal } : {})
  };
  const listener: BrowserExtensionContentWindowMessageListener = (event) => {
    void (async () => {
      try {
        const response = await handleBrowserExtensionContentWindowBridgeEvent(event, bridgeOptions);
        if (response === undefined || disposed) return;
        await options.postResponse(response, requireResponseTarget(event));
      } catch (error) {
        reportListenerError(error, options.onError);
      }
    })();
  };
  options.target.addEventListener("message", listener);
  return Object.freeze({
    dispose(): void {
      if (disposed) return;
      disposed = true;
      options.target.removeEventListener("message", listener);
    }
  });
}
