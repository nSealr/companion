import { describe, expect, it } from "vitest";
import { BROWSER_EXTENSION_MESSAGE_PROTOCOL } from "./handler.js";
import {
  BROWSER_EXTENSION_PENDING_REQUEST_STATE_FORMAT,
  createBrowserExtensionPendingRequestLifecycle
} from "./pending-request.js";

describe("browser extension pending request lifecycle", () => {
  it("emits secretless pending and resolved states for a reviewed sender", () => {
    const states: unknown[] = [];
    const timestamps = [1_900_000_000, 1_900_000_003];
    const lifecycle = createBrowserExtensionPendingRequestLifecycle({
      now: () => timestamps.shift() ?? 1_900_000_003,
      onState: (state) => {
        states.push(state);
      }
    });

    const started = lifecycle.start({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "pending-get-public-key",
      method: "get_public_key"
    }, {
      extension_id: "extension@nsealr.dev",
      page_origin: "https://example.com",
      app_name: "Reviewed Browser Extension"
    });

    expect(started).toEqual({
      format: BROWSER_EXTENSION_PENDING_REQUEST_STATE_FORMAT,
      request_id: "pending-get-public-key",
      method: "get_public_key",
      extension_id: "extension@nsealr.dev",
      page_origin: "https://example.com",
      app_name: "Reviewed Browser Extension",
      status: "pending",
      started_at: 1_900_000_000,
      updated_at: 1_900_000_000,
      stores_production_secrets: false,
      includes_event_template: false
    });
    expect(lifecycle.active()).toEqual([started]);

    const resolved = lifecycle.settle(started, "resolved");
    expect(resolved).toEqual({
      ...started,
      status: "resolved",
      updated_at: 1_900_000_003
    });
    expect(lifecycle.active()).toEqual([]);
    expect(states).toEqual([started, resolved]);
  });

  it("rejects invalid senders and timestamps before publishing state", () => {
    const states: unknown[] = [];
    const lifecycle = createBrowserExtensionPendingRequestLifecycle({
      now: () => -1,
      onState: (state) => {
        states.push(state);
      }
    });

    expect(() => lifecycle.start({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "pending-invalid-timestamp",
      method: "get_public_key"
    }, {
      extension_id: "extension@nsealr.dev",
      page_origin: "https://example.com"
    })).toThrow(/timestamp/u);

    expect(() => createBrowserExtensionPendingRequestLifecycle().start({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "pending-invalid-sender",
      method: "get_public_key"
    }, {
      extension_id: "extension@nsealr.dev",
      page_origin: "https://example.com",
      page_url: "https://other.example/app"
    })).toThrow(/sender|origin/u);

    expect(states).toEqual([]);
  });

  it("does not leak active requests when state publication fails", () => {
    const lifecycle = createBrowserExtensionPendingRequestLifecycle({
      onState: () => {
        throw new Error("pending UI sink failed");
      }
    });

    expect(() => lifecycle.start({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "pending-sink-failure",
      method: "get_public_key"
    }, {
      extension_id: "extension@nsealr.dev",
      page_origin: "https://example.com"
    })).toThrow(/sink failed/u);
    expect(lifecycle.active()).toEqual([]);
  });
});
