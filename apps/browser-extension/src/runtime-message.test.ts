import { describe, expect, it } from "vitest";
import { handleLocalServiceRequest, type LocalServiceRequest } from "@nsealr/client";
import { type BrowserNativeMessageSender } from "@nsealr/browser-provider";
import { createBrowserExtensionBackgroundController } from "./background.js";
import { BROWSER_EXTENSION_MESSAGE_PROTOCOL } from "./handler.js";
import {
  browserExtensionSenderFromRuntimeSender,
  handleBrowserExtensionRuntimeMessage
} from "./runtime-message.js";

const publicKey = "4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa";
const routeRequest = {
  account_id: "esp32-usb-slot-0",
  method: "sign_event",
  route_type: "esp32_usb_nip46" as const
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

function getPublicKeyRequest(requestId: string): unknown {
  return {
    protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
    version: 1,
    request_id: requestId,
    method: "get_public_key"
  };
}

describe("browser extension runtime message boundary", () => {
  it("maps browser runtime sender metadata into the internal sender shape", () => {
    expect(browserExtensionSenderFromRuntimeSender({
      id: "extension@nsealr.dev",
      url: "https://example.com/app",
      tab: { id: 42 },
      frameId: 0
    })).toEqual({
      extension_id: "extension@nsealr.dev",
      page_url: "https://example.com/app"
    });
    expect(browserExtensionSenderFromRuntimeSender({
      origin: "https://example.com",
      url: "https://example.com/app"
    }, {
      extensionId: "extension@nsealr.dev",
      appName: "Reviewed Browser Runtime"
    })).toEqual({
      extension_id: "extension@nsealr.dev",
      page_origin: "https://example.com",
      page_url: "https://example.com/app",
      app_name: "Reviewed Browser Runtime"
    });
  });

  it("bridges runtime messages through the background controller without browser APIs", async () => {
    const nativeRequests: LocalServiceRequest[] = [];
    const controller = createBrowserExtensionBackgroundController({
      sendNativeMessage: nativeResponder(nativeRequests),
      routeRequest,
      nextServiceRequestId: () => "runtime-route"
    });

    await expect(handleBrowserExtensionRuntimeMessage(
      getPublicKeyRequest("runtime-get-public-key"),
      {
        id: "extension@nsealr.dev",
        url: "https://example.com/app"
      },
      { controller }
    )).resolves.toEqual({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "runtime-get-public-key",
      ok: true,
      result: {
        pubkey: publicKey
      }
    });
    expect(nativeRequests).toHaveLength(1);
    expect(nativeRequests[0]).toMatchObject({
      operation: "select_account_route",
      params: {
        client: {
          surface: "browser_extension",
          origin: "https://example.com",
          instance_id: "extension@nsealr.dev"
        }
      }
    });
  });

  it("returns deterministic invalid_sender responses before native messaging", async () => {
    let called = false;
    const controller = createBrowserExtensionBackgroundController({
      routeRequest,
      sendNativeMessage: () => {
        called = true;
        return {};
      }
    });

    await expect(handleBrowserExtensionRuntimeMessage(
      getPublicKeyRequest("runtime-invalid-sender"),
      {
        id: "extension@nsealr.dev",
        url: "https://example.com/app"
      },
      {
        controller,
        extensionId: "other-extension@nsealr.dev"
      }
    )).resolves.toEqual({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "runtime-invalid-sender",
      ok: false,
      error: {
        code: "invalid_sender",
        message: "browser runtime sender is invalid",
        retryable: false
      }
    });
    await expect(handleBrowserExtensionRuntimeMessage(
      getPublicKeyRequest("runtime-missing-page"),
      { id: "extension@nsealr.dev" },
      { controller }
    )).resolves.toMatchObject({
      request_id: "runtime-missing-page",
      ok: false,
      error: {
        code: "invalid_sender"
      }
    });
    await expect(handleBrowserExtensionRuntimeMessage(
      getPublicKeyRequest("runtime-origin-mismatch"),
      {
        id: "extension@nsealr.dev",
        origin: "https://example.com",
        url: "https://other.example/app"
      },
      { controller }
    )).resolves.toMatchObject({
      request_id: "runtime-origin-mismatch",
      ok: false,
      error: {
        code: "invalid_sender"
      }
    });
    expect(called).toBe(false);
  });

  it("forwards request-scoped cancellation to the background controller", async () => {
    const abortController = new AbortController();
    abortController.abort();
    let called = false;
    const controller = createBrowserExtensionBackgroundController({
      routeRequest,
      sendNativeMessage: () => {
        called = true;
        return {};
      }
    });

    await expect(handleBrowserExtensionRuntimeMessage(
      getPublicKeyRequest("runtime-cancelled"),
      {
        id: "extension@nsealr.dev",
        url: "https://example.com/app"
      },
      {
        controller,
        nativeMessageAbortSignal: abortController.signal
      }
    )).resolves.toEqual({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "runtime-cancelled",
      ok: false,
      error: {
        code: "provider_request_failed",
        message: "browser provider get_public_key failed",
        retryable: false
      }
    });
    expect(called).toBe(false);
  });
});
