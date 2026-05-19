import { describe, expect, it } from "vitest";
import { BROWSER_EXTENSION_MESSAGE_PROTOCOL } from "./handler.js";
import {
  BROWSER_EXTENSION_CONTROL_PROTOCOL,
  handleBrowserExtensionControlMessage,
  parseBrowserExtensionControlResponse,
  parseBrowserExtensionControlRequest
} from "./pending-control.js";
import {
  BROWSER_EXTENSION_PENDING_REQUEST_STATE_FORMAT,
  createBrowserExtensionPendingRequestLifecycle
} from "./pending-request.js";

function cancelRequest(requestId: string, pendingRequestId: string): unknown {
  return {
    protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
    version: 1,
    request_id: requestId,
    method: "cancel_pending_request",
    params: {
      pending_request_id: pendingRequestId
    }
  };
}

function listRequest(requestId: string): unknown {
  return {
    protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
    version: 1,
    request_id: requestId,
    method: "list_pending_requests"
  };
}

function originPermissionReviewRequest(requestId: string): unknown {
  return {
    protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
    version: 1,
    request_id: requestId,
    method: "request_origin_permission_review",
    params: {
      sender: {
        extension_id: "extension@nsealr.dev",
        page_url: "https://example.com/app"
      }
    }
  };
}

describe("browser extension pending request control boundary", () => {
  it("parses only the internal pending request control shapes", () => {
    expect(parseBrowserExtensionControlRequest(cancelRequest(
      "control-cancel-1",
      "pending-request-1"
    ))).toEqual({
      protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
      version: 1,
      request_id: "control-cancel-1",
      method: "cancel_pending_request",
      params: {
        pending_request_id: "pending-request-1"
      }
    });
    expect(parseBrowserExtensionControlRequest(listRequest("control-list-1"))).toEqual({
      protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
      version: 1,
      request_id: "control-list-1",
      method: "list_pending_requests"
    });
    expect(parseBrowserExtensionControlRequest(originPermissionReviewRequest("control-origin-review-1"))).toEqual({
      protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
      version: 1,
      request_id: "control-origin-review-1",
      method: "request_origin_permission_review",
      params: {
        sender: {
          extension_id: "extension@nsealr.dev",
          page_origin: "https://example.com",
          app_name: "nSealr Browser Extension"
        }
      }
    });

    expect(() => parseBrowserExtensionControlRequest({
      protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
      version: 1,
      request_id: "control-extra-field",
      method: "cancel_pending_request",
      params: {
        pending_request_id: "pending-request-1",
        event_template: {}
      }
    })).toThrow(/unsupported fields/u);
    expect(() => parseBrowserExtensionControlRequest({
      protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
      version: 1,
      request_id: "control-unsupported-method",
      method: "approve_pending_request",
      params: {
        pending_request_id: "pending-request-1"
      }
    })).toThrow(/method/u);
    expect(() => parseBrowserExtensionControlRequest({
      protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
      version: 1,
      request_id: "control-list-with-params",
      method: "list_pending_requests",
      params: {}
    })).toThrow(/must not include params/u);
  });

  it("lists active pending requests without exposing hidden request payloads", async () => {
    const pendingRequests = createBrowserExtensionPendingRequestLifecycle();
    pendingRequests.start({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "pending-list-visible",
      method: "get_public_key"
    }, {
      extension_id: "extension@nsealr.dev",
      page_origin: "https://example.com"
    });

    await expect(handleBrowserExtensionControlMessage(
      listRequest("control-list-active"),
      {
        id: "extension@nsealr.dev",
        url: "chrome-extension://extension-id/popup.html"
      },
      {
        extensionId: "extension@nsealr.dev",
        pendingRequests
      }
    )).resolves.toMatchObject({
      protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
      version: 1,
      request_id: "control-list-active",
      ok: true,
      result: {
        pending_requests: [
          {
            request_id: "pending-list-visible",
            method: "get_public_key",
            page_origin: "https://example.com",
            status: "pending",
            stores_production_secrets: false,
            includes_event_template: false
          }
        ],
        stores_production_secrets: false,
        contains_secret_material: false
      }
    });
  });

  it("parses only secretless control responses", () => {
    const pendingState = {
      format: BROWSER_EXTENSION_PENDING_REQUEST_STATE_FORMAT,
      request_id: "pending-control-parse",
      method: "get_public_key",
      extension_id: "extension@nsealr.dev",
      page_origin: "https://example.com",
      status: "pending",
      started_at: 1_900_000_200,
      updated_at: 1_900_000_200,
      stores_production_secrets: false,
      includes_event_template: false
    };
    const listResponse = {
      protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
      version: 1,
      request_id: "control-list-parse",
      ok: true,
      result: {
        pending_requests: [pendingState],
        stores_production_secrets: false,
        contains_secret_material: false
      }
    };
    const cancelResponse = {
      protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
      version: 1,
      request_id: "control-cancel-parse",
      ok: true,
      result: {
        pending_request_id: "pending-control-parse",
        cancelled: true,
        stores_production_secrets: false,
        contains_secret_material: false
      }
    };
    const originPermissionReviewResponse = {
      protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
      version: 1,
      request_id: "control-origin-review-parse",
      ok: true,
      result: {
        origin_review: {
          format: "nsealr-browser-origin-permission-review-v0",
          origin: "https://example.com",
          app_name: "nSealr Browser Extension",
          extension_id: "extension@nsealr.dev",
          requested_methods: [
            {
              method: "get_public_key",
              label: "Read public key",
              effect: "The page can read the selected account public key through the browser provider."
            }
          ],
          local_pairing_digest: "a".repeat(64),
          requires_user_approval: true,
          stores_production_secrets: false,
          creates_grants: false,
          injects_provider: false
        },
        stores_production_secrets: false,
        contains_secret_material: false,
        creates_grants: false,
        injects_provider: false
      }
    };

    expect(parseBrowserExtensionControlResponse(listResponse)).toEqual(listResponse);
    expect(parseBrowserExtensionControlResponse(cancelResponse)).toEqual(cancelResponse);
    expect(parseBrowserExtensionControlResponse(originPermissionReviewResponse)).toEqual(originPermissionReviewResponse);
    expect(parseBrowserExtensionControlResponse({
      protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
      version: 1,
      request_id: "control-error-parse",
      ok: false,
      error: {
        code: "invalid_sender",
        message: "browser extension control sender is invalid",
        retryable: false
      }
    })).toMatchObject({
      request_id: "control-error-parse",
      ok: false,
      error: {
        code: "invalid_sender"
      }
    });
    expect(() => parseBrowserExtensionControlResponse({
      ...listResponse,
      result: {
        ...listResponse.result,
        pending_requests: [{
          ...pendingState,
          includes_event_template: true
        }]
      }
    })).toThrow(/event templates/u);
    expect(() => parseBrowserExtensionControlResponse({
      ...cancelResponse,
      result: {
        ...cancelResponse.result,
        contains_secret_material: true
      }
    })).toThrow(/secretless/u);
    expect(() => parseBrowserExtensionControlResponse({
      ...originPermissionReviewResponse,
      result: {
        ...originPermissionReviewResponse.result,
        creates_grants: true
      }
    })).toThrow(/non-authorizing/u);
  });

  it("cancels active pending requests only from extension-internal senders", async () => {
    const states: unknown[] = [];
    const pendingRequests = createBrowserExtensionPendingRequestLifecycle({
      now: (() => {
        let time = 1_900_000_100;
        return () => time++;
      })(),
      onState: (state) => {
        states.push(state);
      }
    });
    pendingRequests.start({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "pending-from-ui",
      method: "get_public_key"
    }, {
      extension_id: "extension@nsealr.dev",
      page_origin: "https://example.com"
    });

    await expect(handleBrowserExtensionControlMessage(
      cancelRequest("control-cancel-active", "pending-from-ui"),
      {
        id: "extension@nsealr.dev",
        url: "chrome-extension://extension-id/popup.html"
      },
      {
        extensionId: "extension@nsealr.dev",
        pendingRequests
      }
    )).resolves.toEqual({
      protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
      version: 1,
      request_id: "control-cancel-active",
      ok: true,
      result: {
        pending_request_id: "pending-from-ui",
        cancelled: true,
        stores_production_secrets: false,
        contains_secret_material: false
      }
    });
    expect(states).toMatchObject([
      {
        request_id: "pending-from-ui",
        status: "pending"
      },
      {
        request_id: "pending-from-ui",
        status: "cancelled"
      }
    ]);
    expect(pendingRequests.active()).toEqual([]);
  });

  it("requests origin permission reviews only from extension-internal senders", async () => {
    const requestedSenders: unknown[] = [];

    await expect(handleBrowserExtensionControlMessage(
      originPermissionReviewRequest("control-origin-review"),
      {
        id: "extension@nsealr.dev",
        url: "chrome-extension://extension-id/popup.html"
      },
      {
        extensionId: "extension@nsealr.dev",
        controller: {
          requestOriginPermissionReview(sender) {
            requestedSenders.push(sender);
            return {
              originReview: {
                format: "nsealr-browser-origin-permission-review-v0",
                origin: "https://example.com",
                app_name: "nSealr Browser Extension",
                extension_id: "extension@nsealr.dev",
                requested_methods: [
                  {
                    method: "get_public_key",
                    label: "Read public key",
                    effect: "The page can read the selected account public key through the browser provider."
                  }
                ],
                local_pairing_digest: "b".repeat(64),
                requires_user_approval: true,
                stores_production_secrets: false,
                creates_grants: false,
                injects_provider: false
              }
            };
          }
        }
      }
    )).resolves.toMatchObject({
      protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
      version: 1,
      request_id: "control-origin-review",
      ok: true,
      result: {
        origin_review: {
          origin: "https://example.com",
          extension_id: "extension@nsealr.dev",
          requested_methods: [
            {
              method: "get_public_key"
            }
          ]
        },
        stores_production_secrets: false,
        contains_secret_material: false,
        creates_grants: false,
        injects_provider: false
      }
    });
    expect(requestedSenders).toEqual([{
      extension_id: "extension@nsealr.dev",
      page_origin: "https://example.com",
      app_name: "nSealr Browser Extension"
    }]);

    await expect(handleBrowserExtensionControlMessage(
      originPermissionReviewRequest("control-origin-review-page-sender"),
      {
        id: "extension@nsealr.dev",
        url: "https://example.com/app"
      },
      {
        extensionId: "extension@nsealr.dev",
        controller: {
          requestOriginPermissionReview() {
            throw new Error("page sender must not reach controller");
          }
        }
      }
    )).resolves.toMatchObject({
      request_id: "control-origin-review-page-sender",
      ok: false,
      error: {
        code: "invalid_sender"
      }
    });
  });

  it("returns deterministic control errors before page-origin senders can cancel", async () => {
    const pendingRequests = createBrowserExtensionPendingRequestLifecycle();
    pendingRequests.start({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "pending-page-cannot-cancel",
      method: "get_public_key"
    }, {
      extension_id: "extension@nsealr.dev",
      page_origin: "https://example.com"
    });

    await expect(handleBrowserExtensionControlMessage(
      cancelRequest("control-page-sender", "pending-page-cannot-cancel"),
      {
        id: "extension@nsealr.dev",
        url: "https://example.com/app"
      },
      {
        extensionId: "extension@nsealr.dev",
        pendingRequests
      }
    )).resolves.toMatchObject({
      request_id: "control-page-sender",
      ok: false,
      error: {
        code: "invalid_sender"
      }
    });
    expect(pendingRequests.active()).toHaveLength(1);

    await expect(handleBrowserExtensionControlMessage(
      {
        protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
        version: 1,
        request_id: "bad control id",
        method: "cancel_pending_request"
      },
      {
        id: "extension@nsealr.dev"
      },
      {
        extensionId: "extension@nsealr.dev",
        pendingRequests
      }
    )).resolves.toMatchObject({
      request_id: "invalid-browser-extension-control-request",
      ok: false,
      error: {
        code: "invalid_request"
      }
    });
  });

  it("reports unavailable or missing pending request state without creating grants", async () => {
    await expect(handleBrowserExtensionControlMessage(
      cancelRequest("control-unavailable", "pending-missing"),
      {
        id: "extension@nsealr.dev",
        origin: "moz-extension://internal-popup"
      },
      {
        extensionId: "extension@nsealr.dev"
      }
    )).resolves.toMatchObject({
      request_id: "control-unavailable",
      ok: false,
      error: {
        code: "pending_requests_unavailable"
      }
    });

    await expect(handleBrowserExtensionControlMessage(
      cancelRequest("control-missing-pending", "pending-missing"),
      {
        id: "extension@nsealr.dev",
        url: "chrome-extension://extension-id/popup.html"
      },
      {
        extensionId: "extension@nsealr.dev",
        pendingRequests: createBrowserExtensionPendingRequestLifecycle()
      }
    )).resolves.toEqual({
      protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
      version: 1,
      request_id: "control-missing-pending",
      ok: true,
      result: {
        pending_request_id: "pending-missing",
        cancelled: false,
        stores_production_secrets: false,
        contains_secret_material: false
      }
    });
  });
});
