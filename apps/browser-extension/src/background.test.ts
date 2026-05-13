import { describe, expect, it } from "vitest";
import {
  BROWSER_EXTENSION_MESSAGE_PROTOCOL
} from "./handler.js";
import { createBrowserExtensionBackgroundController } from "./background.js";
import { handleLocalServiceRequest, type LocalServiceRequest } from "@nsealr/client";
import { type BrowserNativeMessageSender } from "@nsealr/browser-provider";

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
    if (message.operation === "request_pairing") return handleLocalServiceRequest(message);
    if (message.operation === "select_account_route") return routeSelectionResponse(message);
    throw new Error(`unexpected operation ${message.operation}`);
  };
}

describe("browser extension background controller boundary", () => {
  it("composes request handling and pairing intent over the same native-messaging boundary", async () => {
    const requests: LocalServiceRequest[] = [];
    const controller = createBrowserExtensionBackgroundController({
      sendNativeMessage: nativeResponder(requests),
      routeRequest,
      nextServiceRequestId: (() => {
        let next = 0;
        return () => {
          next += 1;
          return `background-service-${next}`;
        };
      })()
    });

    await expect(controller.requestPairing(sender)).resolves.toMatchObject({
      context: {
        client: {
          surface: "browser_extension",
          origin: "https://example.com",
          instance_id: "extension@nsealr.dev"
        }
      },
      response: {
        request_id: "background-service-1",
        ok: true,
        result: {
          pairing_intent: {
            requires_user_approval: true,
            stores_production_secrets: false
          }
        }
      }
    });

    await expect(controller.handleRequest({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "background-get-public-key",
      method: "get_public_key"
    }, sender)).resolves.toEqual({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "background-get-public-key",
      ok: true,
      result: {
        pubkey: publicKey
      }
    });

    expect(requests.map((request) => request.operation)).toEqual([
      "request_pairing",
      "select_account_route"
    ]);
    expect(requests.map((request) => request.request_id)).toEqual([
      "background-service-1",
      "background-service-2"
    ]);
    expect(requests[0]).toMatchObject({
      operation: "request_pairing",
      params: {
        client: {
          surface: "browser_extension",
          origin: "https://example.com",
          app_name: "nSealr Browser Extension",
          instance_id: "extension@nsealr.dev"
        },
        requested_operations: [
          "select_account_route",
          "validate_signer_request"
        ]
      }
    });
    expect(requests[1]).toMatchObject({
      operation: "select_account_route",
      params: {
        route_request: routeRequest
      }
    });
  });

  it("rejects malformed browser requests before native messaging", async () => {
    let called = false;
    const controller = createBrowserExtensionBackgroundController({
      routeRequest,
      sendNativeMessage: () => {
        called = true;
        return {};
      }
    });

    await expect(controller.handleRequest({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "bad request id",
      method: "get_public_key"
    }, sender)).resolves.toMatchObject({
      request_id: "invalid-browser-extension-request",
      ok: false,
      error: {
        code: "invalid_request"
      }
    });
    expect(called).toBe(false);
  });

  it("projects pairing review metadata without browser storage or grants", async () => {
    const requests: LocalServiceRequest[] = [];
    const controller = createBrowserExtensionBackgroundController({
      sendNativeMessage: nativeResponder(requests),
      routeRequest,
      nextServiceRequestId: () => "background-pairing-review"
    });

    await expect(controller.requestPairingReview(sender)).resolves.toMatchObject({
      response: {
        request_id: "background-pairing-review",
        ok: true
      },
      review: {
        format: "nsealr-local-pairing-review-v0",
        client: {
          surface: "browser_extension",
          origin: "https://example.com",
          instance_id: "extension@nsealr.dev"
        },
        requested_operations: [
          {
            operation: "select_account_route"
          },
          {
            operation: "validate_signer_request"
          }
        ],
        requires_user_approval: true,
        stores_production_secrets: false,
        contains_secret_material: false
      }
    });
    expect(requests.map((request) => request.operation)).toEqual(["request_pairing"]);
  });

  it("projects origin permission review metadata without injecting providers", async () => {
    const requests: LocalServiceRequest[] = [];
    const controller = createBrowserExtensionBackgroundController({
      sendNativeMessage: nativeResponder(requests),
      routeRequest,
      nextServiceRequestId: () => "background-origin-permission-review"
    });

    await expect(controller.requestOriginPermissionReview(sender)).resolves.toMatchObject({
      response: {
        request_id: "background-origin-permission-review",
        ok: true
      },
      originReview: {
        format: "nsealr-browser-origin-permission-review-v0",
        origin: "https://example.com",
        extension_id: "extension@nsealr.dev",
        requested_methods: [
          {
            method: "get_public_key"
          },
          {
            method: "sign_event"
          }
        ],
        requires_user_approval: true,
        stores_production_secrets: false,
        creates_grants: false,
        injects_provider: false
      }
    });
    expect(requests.map((request) => request.operation)).toEqual(["request_pairing"]);
  });

  it("keeps silent native messaging deterministic without approving grants", async () => {
    const controller = createBrowserExtensionBackgroundController({
      routeRequest,
      nativeMessageTimeoutMs: 1,
      sendNativeMessage: () => new Promise(() => undefined)
    });

    await expect(controller.requestPairingReview(sender)).rejects.toThrow(/response timed out/u);
    await expect(controller.handleRequest({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "background-timeout-get-public-key",
      method: "get_public_key"
    }, sender)).resolves.toEqual({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "background-timeout-get-public-key",
      ok: false,
      error: {
        code: "provider_request_failed",
        message: "browser provider get_public_key failed",
        retryable: false
      }
    });
  });

  it("honors request-scoped cancellation without approving grants or contacting native messaging", async () => {
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

    await expect(controller.requestPairingReview(sender, {
      nativeMessageAbortSignal: abortController.signal
    })).rejects.toThrow(/cancelled/u);
    await expect(controller.handleRequest({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "background-cancelled-get-public-key",
      method: "get_public_key"
    }, sender, {
      nativeMessageAbortSignal: abortController.signal
    })).resolves.toEqual({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "background-cancelled-get-public-key",
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
