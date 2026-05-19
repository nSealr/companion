import {
  type BrowserExtensionBackgroundBrowserRuntimeApi
} from "./background-browser.js";
import {
  type BrowserExtensionContentRuntimeApi
} from "./content-runtime.js";
import {
  type BrowserExtensionPopupRuntimeApi
} from "./popup-control.js";
import {
  type BrowserExtensionPopupDocument
} from "./popup-dom.js";
import {
  type BrowserExtensionContentScriptBrowserLocation,
  type BrowserExtensionContentScriptBrowserPageWindow
} from "./content-browser.js";
import {
  type BrowserExtensionPageScriptDocument
} from "./page-injection.js";
import {
  type BrowserExtensionPageScriptBrowserWindow
} from "./page-browser.js";

export type BrowserExtensionPackagedGlobalScope = {
  browser?: {
    runtime?: unknown;
  };
  chrome?: {
    runtime?: unknown;
  };
  document?: unknown;
  window?: unknown;
  location?: unknown;
};

export type BrowserExtensionPackagedPageWindow =
  BrowserExtensionContentScriptBrowserPageWindow &
  BrowserExtensionPageScriptBrowserWindow;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireGlobalScope(value: BrowserExtensionPackagedGlobalScope): BrowserExtensionPackagedGlobalScope {
  if (!isRecord(value)) {
    throw new Error("browser extension packaged global scope is invalid");
  }
  return value;
}

function optionalRuntimeContainer(value: unknown, label: string): unknown {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error(`${label} runtime container is invalid`);
  }
  return value.runtime;
}

function requireExtensionRuntimeGlobal(
  value: BrowserExtensionPackagedGlobalScope,
  label: string
): unknown {
  const globalScope = requireGlobalScope(value);
  const browserRuntime = optionalRuntimeContainer(globalScope.browser, "browser");
  const chromeRuntime = optionalRuntimeContainer(globalScope.chrome, "chrome");
  if (browserRuntime !== undefined && chromeRuntime !== undefined && browserRuntime !== chromeRuntime) {
    throw new Error(`${label} runtime global is ambiguous`);
  }
  const runtime = browserRuntime ?? chromeRuntime;
  if (runtime === undefined) {
    throw new Error(`${label} runtime global is unavailable`);
  }
  return runtime;
}

export function requireBrowserExtensionBackgroundRuntimeGlobal(
  value: BrowserExtensionPackagedGlobalScope
): BrowserExtensionBackgroundBrowserRuntimeApi {
  const runtime = requireExtensionRuntimeGlobal(value, "browser extension background");
  if (
    !isRecord(runtime) ||
    !isRecord(runtime.onMessage) ||
    typeof runtime.onMessage.addListener !== "function" ||
    typeof runtime.onMessage.removeListener !== "function" ||
    typeof runtime.sendNativeMessage !== "function"
  ) {
    throw new Error("browser extension background runtime global is invalid");
  }
  return runtime as BrowserExtensionBackgroundBrowserRuntimeApi;
}

export function requireBrowserExtensionContentRuntimeGlobal(
  value: BrowserExtensionPackagedGlobalScope
): BrowserExtensionContentRuntimeApi {
  const runtime = requireExtensionRuntimeGlobal(value, "browser extension content-script");
  if (
    !isRecord(runtime) ||
    typeof runtime.getURL !== "function" ||
    typeof runtime.sendMessage !== "function"
  ) {
    throw new Error("browser extension content-script runtime global is invalid");
  }
  return runtime as BrowserExtensionContentRuntimeApi;
}

export function requireBrowserExtensionPopupRuntimeGlobal(
  value: BrowserExtensionPackagedGlobalScope
): BrowserExtensionPopupRuntimeApi {
  const runtime = requireExtensionRuntimeGlobal(value, "browser extension popup");
  if (!isRecord(runtime) || typeof runtime.sendMessage !== "function") {
    throw new Error("browser extension popup runtime global is invalid");
  }
  return runtime as BrowserExtensionPopupRuntimeApi;
}

export function requireBrowserExtensionPopupDocumentGlobal(
  value: BrowserExtensionPackagedGlobalScope
): BrowserExtensionPopupDocument {
  const globalScope = requireGlobalScope(value);
  if (
    !isRecord(globalScope.document) ||
    typeof globalScope.document.createElement !== "function" ||
    typeof globalScope.document.getElementById !== "function"
  ) {
    throw new Error("browser extension popup document global is invalid");
  }
  return globalScope.document as BrowserExtensionPopupDocument;
}

export function requireBrowserExtensionDocumentGlobal(
  value: BrowserExtensionPackagedGlobalScope
): BrowserExtensionPageScriptDocument {
  const globalScope = requireGlobalScope(value);
  if (
    !isRecord(globalScope.document) ||
    typeof globalScope.document.createElement !== "function" ||
    typeof globalScope.document.getElementById !== "function"
  ) {
    throw new Error("browser extension document global is invalid");
  }
  return globalScope.document as BrowserExtensionPageScriptDocument;
}

export function requireBrowserExtensionPageWindowGlobal(
  value: BrowserExtensionPackagedGlobalScope
): BrowserExtensionPackagedPageWindow {
  const globalScope = requireGlobalScope(value);
  if (
    !isRecord(globalScope.window) ||
    typeof globalScope.window.addEventListener !== "function" ||
    typeof globalScope.window.removeEventListener !== "function" ||
    typeof globalScope.window.postMessage !== "function"
  ) {
    throw new Error("browser extension window global is invalid");
  }
  return globalScope.window as BrowserExtensionPackagedPageWindow;
}

export function requireBrowserExtensionLocationGlobal(
  value: BrowserExtensionPackagedGlobalScope
): BrowserExtensionContentScriptBrowserLocation {
  const globalScope = requireGlobalScope(value);
  if (!isRecord(globalScope.location)) {
    throw new Error("browser extension location global is invalid");
  }
  return { origin: globalScope.location.origin };
}
