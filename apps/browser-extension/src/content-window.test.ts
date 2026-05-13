import { describe, expect, it } from "vitest";
import { handleLocalServiceRequest, type LocalServiceRequest } from "@nsealr/client";
import { type BrowserNativeMessageSender } from "@nsealr/browser-provider";
import {
  createBrowserExtensionBackgroundController,
  type BrowserExtensionBackgroundRequestOptions
} from "./background.js";
import { handleBrowserExtensionContentWindowBridgeEvent } from "./content-window.js";
import { BROWSER_EXTENSION_MESSAGE_PROTOCOL } from "./handler.js";
import { type BrowserExtensionRequest } from "./messages.js";
import { BROWSER_EXTENSION_PAGE_BRIDGE_PROTOCOL } from "./page-bridge.js";

const publicKey = "4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa";
const routeRequest = {
  account_id: "esp32-usb-slot-0",
  method: "sign_event",
  route_type: "esp32_usb_nip46" as const
};
const sender = {
  extension_id: "extension@nsealr.dev",
  page_url: "https://example.com/app"
};

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

function nativeResponder(requests: LocalServiceRequest[]): BrowserNativeMessageSender {
  return (_hostName, message) => {
    requests.push(message);
    if (message.operation === "select_account_route") return routeSelectionResponse(message);
    return handleLocalServiceRequest(message);
  };
}

function pageBridgeRequest(requestId: string): unknown {
  return {
    protocol: BROWSER_EXTENSION_PAGE_BRIDGE_PROTOCOL,
    version: 1,
    direction: "page_to_extension",
    request_id: requestId,
    request: {
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: requestId,
      method: "get_public_key"
    }
  };
}

describe("browser extension content-window bridge boundary", () => {
  it("accepts page bridge events only from the expected source and origin", async () => {
    const nativeRequests: LocalServiceRequest[] = [];
    const pageWindow = {};
    const controller = createBrowserExtensionBackgroundController({
      sendNativeMessage: nativeResponder(nativeRequests),
      routeRequest,
      nextServiceRequestId: () => "content-window-route"
    });

    await expect(handleBrowserExtensionContentWindowBridgeEvent({
      source: pageWindow,
      origin: "https://example.com",
      data: pageBridgeRequest("content-window-get-public-key")
    }, {
      expectedSource: pageWindow,
      expectedOrigin: "https://example.com",
      sender,
      requestBackground: (request, requestSender, options) => controller.handleRequest(request, requestSender, options)
    })).resolves.toEqual({
      protocol: BROWSER_EXTENSION_PAGE_BRIDGE_PROTOCOL,
      version: 1,
      direction: "extension_to_page",
      request_id: "content-window-get-public-key",
      response: {
        protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
        version: 1,
        request_id: "content-window-get-public-key",
        ok: true,
        result: {
          pubkey: publicKey
        }
      }
    });
    expect(nativeRequests.map((request) => request.operation)).toEqual(["select_account_route"]);
  });

  it("ignores unrelated or untrusted page messages without contacting background", async () => {
    const expectedSource = {};
    const nativeRequests: LocalServiceRequest[] = [];
    const controller = createBrowserExtensionBackgroundController({
      sendNativeMessage: nativeResponder(nativeRequests),
      routeRequest
    });
    const options = {
      expectedSource,
      expectedOrigin: "https://example.com",
      sender,
      requestBackground: (
        request: BrowserExtensionRequest,
        requestSender: unknown,
        requestOptions: BrowserExtensionBackgroundRequestOptions
      ) =>
        controller.handleRequest(request, requestSender, requestOptions)
    };

    await expect(handleBrowserExtensionContentWindowBridgeEvent({
      source: {},
      origin: "https://example.com",
      data: pageBridgeRequest("wrong-source")
    }, options)).resolves.toBeUndefined();
    await expect(handleBrowserExtensionContentWindowBridgeEvent({
      source: expectedSource,
      origin: "https://evil.example",
      data: pageBridgeRequest("wrong-origin")
    }, options)).resolves.toBeUndefined();
    await expect(handleBrowserExtensionContentWindowBridgeEvent({
      source: expectedSource,
      origin: "https://example.com",
      data: { protocol: "other-protocol" }
    }, options)).resolves.toBeUndefined();
    expect(nativeRequests).toEqual([]);
  });

  it("rejects malformed nSealr page bridge events before contacting background", async () => {
    const pageWindow = {};
    let called = false;
    await expect(handleBrowserExtensionContentWindowBridgeEvent({
      source: pageWindow,
      origin: "https://example.com",
      data: {
        protocol: BROWSER_EXTENSION_PAGE_BRIDGE_PROTOCOL,
        version: 1,
        direction: "extension_to_page",
        request_id: "content-window-wrong-direction",
        request: {
          protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
          version: 1,
          request_id: "content-window-wrong-direction",
          method: "get_public_key"
        }
      }
    }, {
      expectedSource: pageWindow,
      expectedOrigin: "https://example.com",
      sender,
      requestBackground: () => {
        called = true;
        return {};
      }
    })).rejects.toThrow(/direction/u);
    expect(called).toBe(false);
  });

  it("rejects non-object content-window events before bridge handling", async () => {
    await expect(handleBrowserExtensionContentWindowBridgeEvent(null, {
      expectedSource: {},
      expectedOrigin: "https://example.com",
      sender,
      requestBackground: () => ({})
    })).rejects.toThrow(/event must be an object/u);
  });

  it("rejects invalid expected origins before bridge handling", async () => {
    const pageWindow = {};
    await expect(handleBrowserExtensionContentWindowBridgeEvent({
      source: pageWindow,
      origin: "https://example.com",
      data: pageBridgeRequest("invalid-expected-origin")
    }, {
      expectedSource: pageWindow,
      expectedOrigin: "https://example.com/path",
      sender,
      requestBackground: () => ({})
    })).rejects.toThrow(/expected origin/u);
  });
});
