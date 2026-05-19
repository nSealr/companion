import { describe, expect, it } from "vitest";
import { BROWSER_EXTENSION_MESSAGE_PROTOCOL } from "./handler.js";
import {
  BROWSER_EXTENSION_CONTROL_PROTOCOL,
  handleBrowserExtensionControlMessage,
  parseBrowserExtensionControlRequest
} from "./pending-control.js";
import { createBrowserExtensionPendingRequestLifecycle } from "./pending-request.js";

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

describe("browser extension pending request control boundary", () => {
  it("parses only the internal cancel_pending_request control shape", () => {
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
  });

  it("cancels active pending requests only from extension-internal senders", () => {
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

    expect(handleBrowserExtensionControlMessage(
      cancelRequest("control-cancel-active", "pending-from-ui"),
      {
        id: "extension@nsealr.dev",
        url: "chrome-extension://extension-id/popup.html"
      },
      {
        extensionId: "extension@nsealr.dev",
        pendingRequests
      }
    )).toEqual({
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

  it("returns deterministic control errors before page-origin senders can cancel", () => {
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

    expect(handleBrowserExtensionControlMessage(
      cancelRequest("control-page-sender", "pending-page-cannot-cancel"),
      {
        id: "extension@nsealr.dev",
        url: "https://example.com/app"
      },
      {
        extensionId: "extension@nsealr.dev",
        pendingRequests
      }
    )).toMatchObject({
      request_id: "control-page-sender",
      ok: false,
      error: {
        code: "invalid_sender"
      }
    });
    expect(pendingRequests.active()).toHaveLength(1);

    expect(handleBrowserExtensionControlMessage(
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
    )).toMatchObject({
      request_id: "invalid-browser-extension-control-request",
      ok: false,
      error: {
        code: "invalid_request"
      }
    });
  });

  it("reports unavailable or missing pending request state without creating grants", () => {
    expect(handleBrowserExtensionControlMessage(
      cancelRequest("control-unavailable", "pending-missing"),
      {
        id: "extension@nsealr.dev",
        origin: "moz-extension://internal-popup"
      },
      {
        extensionId: "extension@nsealr.dev"
      }
    )).toMatchObject({
      request_id: "control-unavailable",
      ok: false,
      error: {
        code: "pending_requests_unavailable"
      }
    });

    expect(handleBrowserExtensionControlMessage(
      cancelRequest("control-missing-pending", "pending-missing"),
      {
        id: "extension@nsealr.dev",
        url: "chrome-extension://extension-id/popup.html"
      },
      {
        extensionId: "extension@nsealr.dev",
        pendingRequests: createBrowserExtensionPendingRequestLifecycle()
      }
    )).toEqual({
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
