import { describe, expect, it } from "vitest";
import {
  BROWSER_EXTENSION_MESSAGE_PROTOCOL,
  handleBrowserExtensionRequest,
  type BrowserExtensionHandlerOptions
} from "./handler.js";

const eventTemplate = {
  kind: 1,
  created_at: 1_710_000_000,
  tags: [],
  content: "nSealr fixture: basic kind 1 event."
};

const signedEvent = {
  id: "2977f107ad2668dbd9f09b8594eff3b5276e21bfe098e60ae3e905e3c861e4d3",
  pubkey: "4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa",
  created_at: 1_710_000_000,
  kind: 1,
  tags: [],
  content: "nSealr fixture: basic kind 1 event.",
  sig: "2eec0351eb1d651140922d4b1f1bd8135f4474aabf42ec5bda7011087c1a072d71be863646dc162e4d96eacf14afeed2618a4acb0e1134a273a2b8e73039e654"
};

const provider: BrowserExtensionHandlerOptions["provider"] = {
  getPublicKey: async () => signedEvent.pubkey,
  signEvent: async () => signedEvent
};

describe("browser extension request handler", () => {
  it("returns validated get_public_key responses from the injected provider", async () => {
    await expect(handleBrowserExtensionRequest({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "browser-get-pubkey-handler",
      method: "get_public_key"
    }, { provider })).resolves.toEqual({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "browser-get-pubkey-handler",
      ok: true,
      result: {
        pubkey: signedEvent.pubkey
      }
    });
  });

  it("returns verified sign_event responses from the injected provider", async () => {
    await expect(handleBrowserExtensionRequest({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "browser-sign-handler",
      method: "sign_event",
      params: {
        event_template: eventTemplate
      }
    }, { provider })).resolves.toEqual({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "browser-sign-handler",
      ok: true,
      result: {
        event: signedEvent
      }
    });
  });

  it("rejects malformed requests before contacting the provider", async () => {
    let called = false;
    const response = await handleBrowserExtensionRequest({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "bad request id",
      method: "get_public_key"
    }, {
      provider: {
        getPublicKey: async () => {
          called = true;
          return signedEvent.pubkey;
        },
        signEvent: async () => {
          called = true;
          return signedEvent;
        }
      }
    });

    expect(called).toBe(false);
    expect(response).toEqual({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "invalid-browser-extension-request",
      ok: false,
      error: {
        code: "invalid_request",
        message: "browser extension request is invalid",
        retryable: false
      }
    });
  });

  it("rejects malformed provider outputs without returning them to browser callers", async () => {
    await expect(handleBrowserExtensionRequest({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "browser-bad-pubkey",
      method: "get_public_key"
    }, {
      provider: {
        getPublicKey: async () => "not-a-pubkey",
        signEvent: async () => signedEvent
      }
    })).resolves.toMatchObject({
      request_id: "browser-bad-pubkey",
      ok: false,
      error: { code: "provider_request_failed" }
    });

    await expect(handleBrowserExtensionRequest({
      protocol: BROWSER_EXTENSION_MESSAGE_PROTOCOL,
      version: 1,
      request_id: "browser-bad-event",
      method: "sign_event",
      params: {
        event_template: eventTemplate
      }
    }, {
      provider: {
        getPublicKey: async () => signedEvent.pubkey,
        signEvent: async () => ({
          ...signedEvent,
          content: "tampered"
        })
      }
    })).resolves.toMatchObject({
      request_id: "browser-bad-event",
      ok: false,
      error: { code: "provider_request_failed" }
    });
  });
});
