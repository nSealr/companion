import { describe, expect, it } from "vitest";
import { handleLocalServiceRequest, type LocalServiceRequest } from "@nsealr/client";
import {
  NATIVE_HOST_NAME,
  type BrowserNativeMessageSender
} from "@nsealr/browser-provider";
import {
  BROWSER_EXTENSION_DEFAULT_PAIRING_OPERATIONS,
  requestBrowserExtensionNativeMessagingPairingIntent,
  requestBrowserExtensionNativeMessagingPairingReview
} from "./pairing.js";

const sender = {
  extension_id: "extension@nsealr.dev",
  page_url: "https://example.com/app"
};

describe("browser extension native-messaging pairing boundary", () => {
  it("requests a digest-bound pairing intent for the sender-derived client identity", async () => {
    const hosts: string[] = [];
    const requests: LocalServiceRequest[] = [];
    const sendNativeMessage: BrowserNativeMessageSender = (hostName, message) => {
      hosts.push(hostName);
      requests.push(message);
      return handleLocalServiceRequest(message);
    };

    const result = await requestBrowserExtensionNativeMessagingPairingIntent(sender, {
      sendNativeMessage,
      nextServiceRequestId: () => "browser-pairing-intent"
    });

    expect(result.context.client).toEqual({
      surface: "browser_extension",
      origin: "https://example.com",
      app_name: "nSealr Browser Extension",
      instance_id: "extension@nsealr.dev"
    });
    expect(result.response).toMatchObject({
      request_id: "browser-pairing-intent",
      ok: true,
      result: {
        pairing_intent: {
          client: result.context.client,
          requested_operations: BROWSER_EXTENSION_DEFAULT_PAIRING_OPERATIONS,
          requires_user_approval: true,
          stores_production_secrets: false
        }
      }
    });
    expect(hosts).toEqual([NATIVE_HOST_NAME]);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      operation: "request_pairing",
      params: {
        client: result.context.client,
        requested_operations: BROWSER_EXTENSION_DEFAULT_PAIRING_OPERATIONS
      }
    });
  });

  it("allows explicit operation scope without adding grants or storage", async () => {
    const requests: LocalServiceRequest[] = [];
    const sendNativeMessage: BrowserNativeMessageSender = (_hostName, message) => {
      requests.push(message);
      return handleLocalServiceRequest(message);
    };

    const result = await requestBrowserExtensionNativeMessagingPairingIntent(sender, {
      sendNativeMessage,
      requestedOperations: ["select_account_route"],
      nextServiceRequestId: () => "browser-pairing-route-only"
    });

    expect(result.response).toMatchObject({
      ok: true,
      result: {
        pairing_intent: {
          requested_operations: ["select_account_route"]
        }
      }
    });
    expect(requests[0]).toMatchObject({
      params: {
        requested_operations: ["select_account_route"]
      }
    });
  });

  it("projects native pairing intents into deterministic review metadata", async () => {
    const result = await requestBrowserExtensionNativeMessagingPairingReview(sender, {
      sendNativeMessage: (_hostName, message) => handleLocalServiceRequest(message),
      nextServiceRequestId: () => "browser-pairing-review"
    });

    expect(result.response).toMatchObject({
      request_id: "browser-pairing-review",
      ok: true
    });
    expect(result.review).toMatchObject({
      format: "nsealr-local-pairing-review-v0",
      client: result.context.client,
      requested_operations: [
        {
          operation: "select_account_route",
          label: "Read selected account route"
        },
        {
          operation: "validate_signer_request",
          label: "Validate signer requests"
        }
      ],
      requires_user_approval: true,
      stores_production_secrets: false,
      contains_secret_material: false
    });
    if (result.response.ok !== true || !("pairing_intent" in result.response.result)) {
      throw new Error("pairing intent was not returned");
    }
    expect(result.review.pairing_digest).toBe(result.response.result.pairing_intent.pairing_digest);
  });

  it("rejects operation-mismatched native pairing responses before review", async () => {
    await expect(requestBrowserExtensionNativeMessagingPairingReview(sender, {
      sendNativeMessage: (_hostName, message) => handleLocalServiceRequest({
        version: 1,
        request_id: message.request_id,
        operation: "service_status"
      })
    })).rejects.toThrow(/request_pairing returned unexpected local service result/u);
  });

  it("rejects invalid senders or native host names before contacting native messaging", async () => {
    let called = false;
    const sendNativeMessage: BrowserNativeMessageSender = () => {
      called = true;
      return {};
    };

    await expect(requestBrowserExtensionNativeMessagingPairingIntent({
      extension_id: "extension@nsealr.dev",
      page_url: "http://localhost.evil.example/app"
    }, { sendNativeMessage })).rejects.toThrow(/sender|localhost|origin/u);
    expect(called).toBe(false);

    await expect(requestBrowserExtensionNativeMessagingPairingIntent(sender, {
      hostName: "bad host name",
      sendNativeMessage
    })).rejects.toThrow(/native host name/u);
    expect(called).toBe(false);
  });
});
