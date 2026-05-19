import { NATIVE_HOST_NAME } from "@nsealr/browser-provider";
import { type LocalServiceRequest } from "@nsealr/client";
import { describe, expect, it } from "vitest";
import { BROWSER_EXTENSION_MESSAGE_PROTOCOL, type BrowserExtensionResponse } from "./handler.js";
import { type BrowserExtensionRequest } from "./messages.js";
import {
  BROWSER_EXTENSION_PAGE_BRIDGE_PROTOCOL,
  type BrowserExtensionPageBridgeRequest,
  type BrowserExtensionPageBridgeResponse
} from "./page-bridge.js";
import {
  BROWSER_EXTENSION_PAGE_SCRIPT_ELEMENT_ID,
  BROWSER_EXTENSION_PAGE_SCRIPT_FILE,
  type BrowserExtensionInjectedPageScriptElement,
  type BrowserExtensionPageScriptDocument
} from "./page-injection.js";
import { BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT } from "./route-config.js";
import {
  type BrowserExtensionRuntimeMessageListener,
  type BrowserExtensionRuntimeMessageResponse
} from "./runtime-message.js";
import { installNsealrBackgroundEntrypoint } from "./nsealr-background-entrypoint.js";
import { installNsealrContentScriptEntrypoint } from "./nsealr-content-script-entrypoint.js";
import { installNsealrPageScriptEntrypoint } from "./nsealr-page-script-entrypoint.js";

const publicKey = "4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa";
const routeRequest = {
  account_id: "esp32-usb-slot-0",
  method: "sign_event",
  route_type: "esp32_usb_nip46" as const
};

type WindowMessageListener = (event: unknown) => void;

function routeConfig(): unknown {
  return {
    format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
    account_id: routeRequest.account_id,
    route_type: routeRequest.route_type
  };
}

function routeSelectionResponse(request: LocalServiceRequest): unknown {
  return {
    version: 1,
    request_id: request.request_id,
    ok: true,
    result: {
      route_selection: {
        format: "nsealr-route-selection-v0",
        account_id: routeRequest.account_id,
        public_key: publicKey,
        route_type: routeRequest.route_type,
        repository: "esp32",
        transport: "usb",
        custody: "device_persistent",
        trusted_review: "device_display",
        policy_support: "scoped_automation",
        policy_profile_id: "policy-esp32-usb-manual-v0",
        physical_review: true,
        physical_approval: true,
        persistent_grants: false,
        contains_secret_material: false
      }
    }
  };
}

function getPublicKeyRequest(requestId: string): BrowserExtensionRequest {
  return {
    protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
    version: 1,
    request_id: requestId,
    method: "get_public_key"
  };
}

function getPublicKeyResponse(requestId: string): BrowserExtensionResponse {
  return {
    protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
    version: 1,
    request_id: requestId,
    ok: true,
    result: {
      pubkey: publicKey
    }
  };
}

function createRuntimeGlobal(): {
  runtime: {
    onMessage: {
      addListener(listener: BrowserExtensionRuntimeMessageListener): void;
      removeListener(listener: BrowserExtensionRuntimeMessageListener): void;
    };
    getURL(path: string): string;
    sendMessage(message: unknown): unknown;
    sendNativeMessage(hostName: string, message: unknown): unknown;
  };
  nativeMessages: Array<{ hostName: string; message: unknown }>;
  runtimeMessages: unknown[];
  resolvedPaths: string[];
  emit(
    value: unknown,
    sender: unknown,
    sendResponse: (response: BrowserExtensionRuntimeMessageResponse) => void
  ): true | undefined;
  listenerCount(): number;
} {
  const listeners = new Set<BrowserExtensionRuntimeMessageListener>();
  const nativeMessages: Array<{ hostName: string; message: unknown }> = [];
  const runtimeMessages: unknown[] = [];
  const resolvedPaths: string[] = [];
  const runtime = {
    onMessage: {
      addListener(listener: BrowserExtensionRuntimeMessageListener): void {
        listeners.add(listener);
      },
      removeListener(listener: BrowserExtensionRuntimeMessageListener): void {
        listeners.delete(listener);
      }
    },
    getURL(path: string): string {
      resolvedPaths.push(path);
      return `chrome-extension://extension-id/${path}`;
    },
    sendMessage(message: unknown): unknown {
      runtimeMessages.push(message);
      return getPublicKeyResponse((message as BrowserExtensionRequest).request_id);
    },
    sendNativeMessage(hostName: string, message: unknown): unknown {
      nativeMessages.push({ hostName, message });
      return routeSelectionResponse(message as LocalServiceRequest);
    }
  };
  return {
    runtime,
    nativeMessages,
    runtimeMessages,
    resolvedPaths,
    emit(value, sender, sendResponse): true | undefined {
      const [listener] = listeners;
      return listener?.(value, sender, sendResponse);
    },
    listenerCount(): number {
      return listeners.size;
    }
  };
}

function createDocument(): {
  document: BrowserExtensionPageScriptDocument;
  appended: BrowserExtensionInjectedPageScriptElement[];
  removed: BrowserExtensionInjectedPageScriptElement[];
} {
  const appended: BrowserExtensionInjectedPageScriptElement[] = [];
  const removed: BrowserExtensionInjectedPageScriptElement[] = [];
  return {
    document: {
      createElement(tagName: "script"): BrowserExtensionInjectedPageScriptElement {
        expect(tagName).toBe("script");
        return {
          id: "",
          type: "",
          async: true,
          src: "",
          remove(): void {
            removed.push(this);
          }
        };
      },
      getElementById(): unknown {
        return null;
      },
      documentElement: {
        appendChild(element: BrowserExtensionInjectedPageScriptElement): unknown {
          appended.push(element);
          return element;
        }
      }
    },
    appended,
    removed
  };
}

function isPageBridgeRequest(value: unknown): value is BrowserExtensionPageBridgeRequest {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).protocol === BROWSER_EXTENSION_PAGE_BRIDGE_PROTOCOL &&
    (value as Record<string, unknown>).direction === "page_to_extension";
}

function createPageWindow(origin = "https://example.com"): {
  pageWindow: {
    nostr?: unknown;
    addEventListener(type: "message", listener: WindowMessageListener): void;
    removeEventListener(type: "message", listener: WindowMessageListener): void;
    postMessage(message: BrowserExtensionPageBridgeRequest | BrowserExtensionPageBridgeResponse, targetOrigin: string): void;
  };
  bridgeRequests: BrowserExtensionPageBridgeRequest[];
  postMessages: unknown[];
  dispatch(event: unknown): void;
  listenerCount(): number;
} {
  const listeners = new Set<WindowMessageListener>();
  const bridgeRequests: BrowserExtensionPageBridgeRequest[] = [];
  const postMessages: unknown[] = [];
  const pageWindow = {
    nostr: undefined as unknown,
    addEventListener(type: "message", listener: WindowMessageListener): void {
      expect(type).toBe("message");
      listeners.add(listener);
    },
    removeEventListener(type: "message", listener: WindowMessageListener): void {
      expect(type).toBe("message");
      listeners.delete(listener);
    },
    postMessage(message: BrowserExtensionPageBridgeRequest | BrowserExtensionPageBridgeResponse, targetOrigin: string): void {
      postMessages.push({ message, targetOrigin });
      if (!isPageBridgeRequest(message)) return;
      bridgeRequests.push(message);
      for (const listener of listeners) {
        listener({
          source: pageWindow,
          origin,
          data: {
            protocol: BROWSER_EXTENSION_PAGE_BRIDGE_PROTOCOL,
            version: 1,
            direction: "extension_to_page",
            request_id: message.request_id,
            response: getPublicKeyResponse(message.request_id)
          }
        });
      }
    }
  };
  return {
    pageWindow,
    bridgeRequests,
    postMessages,
    dispatch(event: unknown): void {
      for (const listener of listeners) {
        listener(event);
      }
    },
    listenerCount(): number {
      return listeners.size;
    }
  };
}

async function flushAsyncListeners(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("packaged browser extension entrypoints", () => {
  it("wires the background packaged entrypoint through browser.runtime and secretless route config", async () => {
    const runtime = createRuntimeGlobal();
    const responses: BrowserExtensionRuntimeMessageResponse[] = [];
    const handle = installNsealrBackgroundEntrypoint({
      globalScope: { browser: { runtime: runtime.runtime } },
      routeConfig: routeConfig(),
      extensionId: "extension@nsealr.dev",
      nextServiceRequestId: () => "packaged-background-route"
    });

    expect(runtime.listenerCount()).toBe(1);
    expect(runtime.emit(
      getPublicKeyRequest("packaged-background-get-public-key"),
      {
        id: "extension@nsealr.dev",
        url: "https://example.com/app"
      },
      (response) => {
        responses.push(response);
      }
    )).toBe(true);
    await flushAsyncListeners();

    expect(responses).toEqual([getPublicKeyResponse("packaged-background-get-public-key")]);
    expect(runtime.nativeMessages).toEqual([{
      hostName: NATIVE_HOST_NAME,
      message: expect.objectContaining({
        request_id: "packaged-background-route",
        operation: "select_account_route",
        params: expect.objectContaining({
          route_request: routeRequest
        })
      })
    }]);
    handle.dispose();
    expect(runtime.listenerCount()).toBe(0);
  });

  it("wires the content-script packaged entrypoint through chrome.runtime without storage", async () => {
    const runtime = createRuntimeGlobal();
    const document = createDocument();
    const pageWindow = createPageWindow();
    const handle = installNsealrContentScriptEntrypoint({
      globalScope: {
        chrome: { runtime: runtime.runtime },
        document: document.document,
        window: pageWindow.pageWindow,
        location: { origin: "https://example.com" }
      }
    });

    expect(runtime.resolvedPaths).toEqual([BROWSER_EXTENSION_PAGE_SCRIPT_FILE]);
    expect(document.appended).toEqual([expect.objectContaining({
      id: BROWSER_EXTENSION_PAGE_SCRIPT_ELEMENT_ID,
      type: "module",
      async: false,
      src: `chrome-extension://extension-id/${BROWSER_EXTENSION_PAGE_SCRIPT_FILE}`
    })]);

    pageWindow.dispatch({
      source: pageWindow.pageWindow,
      origin: "https://example.com",
      data: {
        protocol: BROWSER_EXTENSION_PAGE_BRIDGE_PROTOCOL,
        version: 1,
        direction: "page_to_extension",
        request_id: "packaged-content-get-public-key",
        request: getPublicKeyRequest("packaged-content-get-public-key")
      }
    });
    await flushAsyncListeners();

    expect(runtime.runtimeMessages).toEqual([getPublicKeyRequest("packaged-content-get-public-key")]);
    handle.dispose();
    expect(pageWindow.listenerCount()).toBe(0);
    expect(document.removed).toEqual([document.appended[0]]);
  });

  it("wires the page-script packaged entrypoint over the reviewed page-window provider", async () => {
    const pageWindow = createPageWindow();
    const provider = installNsealrPageScriptEntrypoint({
      globalScope: {
        window: pageWindow.pageWindow,
        location: { origin: "https://example.com" }
      },
      nextRequestId: () => "packaged-page-get-public-key"
    });

    await expect(provider.getPublicKey()).resolves.toBe(publicKey);
    expect(pageWindow.pageWindow.nostr).toBe(provider);
    expect(pageWindow.bridgeRequests).toEqual([{
      protocol: BROWSER_EXTENSION_PAGE_BRIDGE_PROTOCOL,
      version: 1,
      direction: "page_to_extension",
      request_id: "packaged-page-get-public-key",
      request: getPublicKeyRequest("packaged-page-get-public-key")
    }]);
  });

  it("rejects ambiguous extension runtime globals before installing listeners or scripts", () => {
    const runtime = createRuntimeGlobal();
    const otherRuntime = createRuntimeGlobal();
    const document = createDocument();

    expect(() => installNsealrBackgroundEntrypoint({
      globalScope: {
        browser: { runtime: runtime.runtime },
        chrome: { runtime: otherRuntime.runtime }
      },
      routeConfig: routeConfig()
    })).toThrow(/ambiguous/u);
    expect(runtime.listenerCount()).toBe(0);

    expect(() => installNsealrContentScriptEntrypoint({
      globalScope: {
        browser: { runtime: runtime.runtime },
        chrome: { runtime: otherRuntime.runtime },
        document: document.document,
        window: createPageWindow().pageWindow,
        location: { origin: "https://example.com" }
      }
    })).toThrow(/ambiguous/u);
    expect(document.appended).toEqual([]);
  });
});
