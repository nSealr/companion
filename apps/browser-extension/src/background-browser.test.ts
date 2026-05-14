import { describe, expect, it } from "vitest";
import { NATIVE_HOST_NAME } from "@nsealr/browser-provider";
import { type LocalServiceRequest } from "@nsealr/client";
import {
  createBrowserExtensionBackgroundBrowserNativeMessageSender,
  installBrowserExtensionBackgroundBrowserEntrypoint
} from "./background-browser.js";
import { BROWSER_EXTENSION_MESSAGE_PROTOCOL } from "./handler.js";
import { BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT } from "./route-config.js";
import {
  type BrowserExtensionRuntimeMessageListener,
  type BrowserExtensionRuntimeMessageResponder
} from "./runtime-message.js";

const publicKey = "4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa";
const routeRequest = {
  account_id: "esp32-usb-slot-0",
  method: "sign_event",
  route_type: "esp32_usb_nip46" as const
};

function getPublicKeyRequest(requestId: string): unknown {
  return {
    protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
    version: 1,
    request_id: requestId,
    method: "get_public_key"
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
        route_type: "esp32_usb_nip46",
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

function createInjectedRuntime(): {
  runtime: {
    onMessage: {
      addListener(listener: BrowserExtensionRuntimeMessageListener): void;
      removeListener(listener: BrowserExtensionRuntimeMessageListener): void;
    };
    sendNativeMessage(hostName: string, message: unknown): unknown;
  };
  nativeMessages: Array<{ hostName: string; message: unknown }>;
  emit(value: unknown, sender: unknown, sendResponse: BrowserExtensionRuntimeMessageResponder): true | undefined;
  listenerCount(): number;
} {
  const listeners = new Set<BrowserExtensionRuntimeMessageListener>();
  const nativeMessages: Array<{ hostName: string; message: unknown }> = [];
  return {
    runtime: {
      onMessage: {
        addListener(listener: BrowserExtensionRuntimeMessageListener): void {
          listeners.add(listener);
        },
        removeListener(listener: BrowserExtensionRuntimeMessageListener): void {
          listeners.delete(listener);
        }
      },
      sendNativeMessage(hostName: string, message: unknown): unknown {
        nativeMessages.push({ hostName, message });
        return routeSelectionResponse(message as LocalServiceRequest);
      }
    },
    nativeMessages,
    emit(value: unknown, sender: unknown, sendResponse: BrowserExtensionRuntimeMessageResponder): true | undefined {
      const [listener] = listeners;
      return listener?.(value, sender, sendResponse);
    },
    listenerCount(): number {
      return listeners.size;
    }
  };
}

async function flushAsyncListeners(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("browser extension background browser entrypoint", () => {
  it("installs runtime message handling over explicit browser-like runtime dependencies", async () => {
    const runtime = createInjectedRuntime();
    const responses: unknown[] = [];
    const handle = installBrowserExtensionBackgroundBrowserEntrypoint({
      runtime: runtime.runtime,
      routeRequest,
      extensionId: "extension@nsealr.dev",
      nextServiceRequestId: () => "background-browser-route"
    });
    expect(runtime.listenerCount()).toBe(1);

    expect(runtime.emit(
      getPublicKeyRequest("background-browser-get-public-key"),
      {
        id: "extension@nsealr.dev",
        url: "https://example.com/app"
      },
      (response) => {
        responses.push(response);
      }
    )).toBe(true);
    await flushAsyncListeners();

    expect(responses).toEqual([{
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "background-browser-get-public-key",
      ok: true,
      result: {
        pubkey: publicKey
      }
    }]);
    expect(runtime.nativeMessages).toHaveLength(1);
    expect(runtime.nativeMessages[0]).toMatchObject({
      hostName: NATIVE_HOST_NAME,
      message: {
        request_id: "background-browser-route",
        operation: "select_account_route",
        params: {
          client: {
            surface: "browser_extension",
            origin: "https://example.com",
            instance_id: "extension@nsealr.dev"
          },
          route_request: routeRequest
        }
      }
    });

    handle.dispose();
    expect(runtime.listenerCount()).toBe(0);
  });

  it("rejects invalid browser-like runtime dependencies before listener installation", () => {
    expect(() => installBrowserExtensionBackgroundBrowserEntrypoint({
      runtime: {
        onMessage: {},
        sendNativeMessage: () => ({})
      } as never,
      routeRequest
    })).toThrow(/runtime/u);
  });

  it("can derive selected route metadata from a secretless browser route config", async () => {
    const runtime = createInjectedRuntime();
    const responses: unknown[] = [];
    const handle = installBrowserExtensionBackgroundBrowserEntrypoint({
      runtime: runtime.runtime,
      routeConfig: {
        format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
        account_id: routeRequest.account_id,
        route_type: routeRequest.route_type
      },
      extensionId: "extension@nsealr.dev",
      nextServiceRequestId: () => "background-browser-config-route"
    });

    expect(runtime.emit(
      getPublicKeyRequest("background-browser-config-get-public-key"),
      {
        id: "extension@nsealr.dev",
        url: "https://example.com/app"
      },
      (response) => {
        responses.push(response);
      }
    )).toBe(true);
    await flushAsyncListeners();

    expect(responses).toHaveLength(1);
    expect(runtime.nativeMessages).toEqual([{
      hostName: NATIVE_HOST_NAME,
      message: expect.objectContaining({
        request_id: "background-browser-config-route",
        operation: "select_account_route",
        params: expect.objectContaining({
          route_request: routeRequest
        })
      })
    }]);
    handle.dispose();
  });

  it("rejects ambiguous route configuration before listener installation", () => {
    const runtime = createInjectedRuntime();
    expect(() => installBrowserExtensionBackgroundBrowserEntrypoint({
      runtime: runtime.runtime,
      routeRequest,
      routeConfig: {
        format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
        account_id: routeRequest.account_id
      }
    })).toThrow(/route configuration/u);
    expect(() => installBrowserExtensionBackgroundBrowserEntrypoint({
      runtime: runtime.runtime
    })).toThrow(/route configuration/u);
    expect(runtime.listenerCount()).toBe(0);
  });

  it("does not call browser native messaging after request cancellation", async () => {
    const runtime = createInjectedRuntime();
    const abortController = new AbortController();
    abortController.abort();
    const sender = createBrowserExtensionBackgroundBrowserNativeMessageSender(runtime.runtime);

    await expect(Promise.resolve().then(() => sender(
      NATIVE_HOST_NAME,
      {
        version: 1,
        request_id: "cancelled-native-message",
        operation: "request_pairing",
        params: {
          client: {
            surface: "browser_extension",
            origin: "https://example.com",
            app_name: "nSealr Browser Extension",
            instance_id: "extension@nsealr.dev"
          },
          requested_operations: ["select_account_route"]
        }
      },
      { abortSignal: abortController.signal }
    ))).rejects.toThrow(/cancelled/u);
    expect(runtime.nativeMessages).toEqual([]);
  });
});
