import { describe, expect, it } from "vitest";
import {
  BROWSER_EXTENSION_CONTROL_PROTOCOL
} from "./pending-control.js";
import {
  BROWSER_EXTENSION_PENDING_REQUEST_STATE_FORMAT
} from "./pending-request.js";
import {
  createBrowserExtensionPopupPendingRequestControls
} from "./popup-control.js";

const pendingState = Object.freeze({
  format: BROWSER_EXTENSION_PENDING_REQUEST_STATE_FORMAT,
  request_id: "pending-popup-visible",
  method: "get_public_key" as const,
  extension_id: "extension@nsealr.dev",
  page_origin: "https://example.com",
  status: "pending" as const,
  started_at: 1_900_000_300,
  updated_at: 1_900_000_300,
  stores_production_secrets: false as const,
  includes_event_template: false as const
});

describe("browser extension popup pending request controls", () => {
  it("lists pending requests through runtime.sendMessage without exposing hidden payloads", async () => {
    const sentMessages: unknown[] = [];
    const controls = createBrowserExtensionPopupPendingRequestControls({
      runtime: {
        sendMessage(message: unknown): unknown {
          sentMessages.push(message);
          return {
            protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
            version: 1,
            request_id: "popup-list-1",
            ok: true,
            result: {
              pending_requests: [pendingState],
              stores_production_secrets: false,
              contains_secret_material: false
            }
          };
        }
      },
      nextRequestId: () => "popup-list-1"
    });

    await expect(controls.listPendingRequests()).resolves.toEqual([pendingState]);
    expect(sentMessages).toEqual([{
      protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
      version: 1,
      request_id: "popup-list-1",
      method: "list_pending_requests"
    }]);
  });

  it("cancels pending requests through the internal control protocol", async () => {
    const sentMessages: unknown[] = [];
    const controls = createBrowserExtensionPopupPendingRequestControls({
      runtime: {
        sendMessage(message: unknown): unknown {
          sentMessages.push(message);
          return {
            protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
            version: 1,
            request_id: "popup-cancel-1",
            ok: true,
            result: {
              pending_request_id: "pending-popup-visible",
              cancelled: true,
              stores_production_secrets: false,
              contains_secret_material: false
            }
          };
        }
      },
      nextRequestId: () => "popup-cancel-1"
    });

    await expect(controls.cancelPendingRequest("pending-popup-visible")).resolves.toEqual({
      pending_request_id: "pending-popup-visible",
      cancelled: true,
      stores_production_secrets: false,
      contains_secret_material: false
    });
    expect(sentMessages).toEqual([{
      protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
      version: 1,
      request_id: "popup-cancel-1",
      method: "cancel_pending_request",
      params: {
        pending_request_id: "pending-popup-visible"
      }
    }]);
  });

  it("rejects invalid runtime dependencies and invalid response envelopes", async () => {
    expect(() => createBrowserExtensionPopupPendingRequestControls({
      runtime: {} as never
    })).toThrow(/runtime/u);

    const mismatched = createBrowserExtensionPopupPendingRequestControls({
      runtime: {
        sendMessage(): unknown {
          return {
            protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
            version: 1,
            request_id: "different-request-id",
            ok: true,
            result: {
              pending_requests: [],
              stores_production_secrets: false,
              contains_secret_material: false
            }
          };
        }
      },
      nextRequestId: () => "popup-list-expected"
    });
    await expect(mismatched.listPendingRequests()).rejects.toThrow(/mismatch/u);

    const unsafe = createBrowserExtensionPopupPendingRequestControls({
      runtime: {
        sendMessage(): unknown {
          return {
            protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
            version: 1,
            request_id: "popup-list-unsafe",
            ok: true,
            result: {
              pending_requests: [{
                ...pendingState,
                includes_event_template: true
              }],
              stores_production_secrets: false,
              contains_secret_material: false
            }
          };
        }
      },
      nextRequestId: () => "popup-list-unsafe"
    });
    await expect(unsafe.listPendingRequests()).rejects.toThrow(/event templates/u);
  });

  it("surfaces deterministic control errors and local cancellation", async () => {
    const denied = createBrowserExtensionPopupPendingRequestControls({
      runtime: {
        sendMessage(): unknown {
          return {
            protocol: BROWSER_EXTENSION_CONTROL_PROTOCOL,
            version: 1,
            request_id: "popup-denied",
            ok: false,
            error: {
              code: "invalid_sender",
              message: "browser extension control sender is invalid",
              retryable: false
            }
          };
        }
      },
      nextRequestId: () => "popup-denied"
    });
    await expect(denied.listPendingRequests()).rejects.toThrow(/invalid_sender/u);

    const abortController = new AbortController();
    abortController.abort();
    const cancelled = createBrowserExtensionPopupPendingRequestControls({
      runtime: {
        sendMessage(): unknown {
          throw new Error("aborted popup control must not send");
        }
      },
      nextRequestId: () => "popup-aborted",
      abortSignal: abortController.signal
    });
    await expect(cancelled.listPendingRequests()).rejects.toThrow(/cancelled/u);
  });
});
