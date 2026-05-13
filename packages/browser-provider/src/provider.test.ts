import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LocalServiceClient,
  clientIdForIdentity,
  handleLocalServiceRequest,
  type LocalClientGrant,
  type LocalClientIdentity
} from "@nsealr/client";
import { type EventTemplate } from "@nsealr/core";
import { loadSpecsFixtures, resolveSpecsRoot } from "@nsealr/fixtures";
import {
  NATIVE_HOST_NAME,
  createBrowserNativeMessagingLocalServiceClient,
  createLocalServiceBrowserProviderBackend,
  createNip07Provider,
  type BrowserProviderBackend
} from "./provider.js";

const specsRoot = resolveSpecsRoot();
const fixtures = loadSpecsFixtures(specsRoot);
const request = JSON.parse(readFileSync(resolve(specsRoot, "examples/request-kind-1-basic.json"), "utf8"));
const response = JSON.parse(readFileSync(resolve(specsRoot, "examples/response-kind-1-basic.json"), "utf8"));
const responseError = JSON.parse(readFileSync(resolve(specsRoot, "examples/response-error-rejected.json"), "utf8"));
const routeVector = fixtures.routeSelections.find((selection) => selection.name === "esp32-usb-sign-event-slot-0");
if (!routeVector) throw new Error("route selection fixture is missing");
const publicKey = response.result.event.pubkey as string;
const client: LocalClientIdentity = {
  surface: "browser_extension",
  origin: "https://example.com",
  app_name: "Example Nostr Client",
  instance_id: "extension-test-1"
};
const localServiceGrant: LocalClientGrant = {
  client_id: clientIdForIdentity(client),
  origin: client.origin,
  surface: client.surface,
  allowed_operations: ["select_account_route", "validate_signer_request"],
  approved_at: 1_900_000_000,
  expires_at: 2_000_000_000
};

function backend(overrides: Partial<BrowserProviderBackend> = {}): BrowserProviderBackend {
  return {
    getPublicKey: async (backendClient) => {
      expect(backendClient).toEqual(client);
      return publicKey;
    },
    signEventRequest: async (signerRequest, backendClient) => {
      expect(backendClient).toEqual(client);
      expect(signerRequest).toEqual(request);
      return response;
    },
    ...overrides
  };
}

describe("NIP-07 browser provider boundary", () => {
  it("returns a validated public key from an injected companion backend", async () => {
    const provider = createNip07Provider({ backend: backend(), client });

    await expect(provider.getPublicKey()).resolves.toBe(publicKey);
  });

  it("converts signEvent templates into nSealr signer requests", async () => {
    const provider = createNip07Provider({
      backend: backend(),
      client,
      nextRequestId: () => "req-kind-1-basic"
    });

    await expect(provider.signEvent(request.params.event_template)).resolves.toEqual(response.result.event);
  });

  it("rejects unsafe event templates before contacting the backend", async () => {
    let called = false;
    const provider = createNip07Provider({
      backend: backend({
        signEventRequest: async () => {
          called = true;
          return response;
        }
      }),
      client,
      nextRequestId: () => "req-kind-1-basic"
    });

    await expect(provider.signEvent({
      ...request.params.event_template,
      pubkey: publicKey
    } as unknown as EventTemplate)).rejects.toThrow(/forbidden fields/u);
    expect(called).toBe(false);
  });

  it("rejects malformed backend outputs and explicit signer refusals", async () => {
    const invalidPublicKeyProvider = createNip07Provider({
      backend: backend({ getPublicKey: async () => "not-a-pubkey" }),
      client
    });
    await expect(invalidPublicKeyProvider.getPublicKey()).rejects.toThrow(/public key/u);

    const mismatchedResponseProvider = createNip07Provider({
      backend: backend({
        signEventRequest: async () => ({
          ...response,
          request_id: "other-request"
        })
      }),
      client,
      nextRequestId: () => "req-kind-1-basic"
    });
    await expect(mismatchedResponseProvider.signEvent(request.params.event_template)).rejects.toThrow(/request_id/u);

    const refusedProvider = createNip07Provider({
      backend: backend({
        signEventRequest: async () => ({
          ...responseError,
          request_id: "req-kind-1-basic"
        })
      }),
      client,
      nextRequestId: () => "req-kind-1-basic"
    });
    await expect(refusedProvider.signEvent(request.params.event_template)).rejects.toThrow(/rejected/u);
  });

  it("can back NIP-07 getPublicKey with authorized local-service route selection", async () => {
    const service = new LocalServiceClient({
      exchange: (message) => handleLocalServiceRequest(message, {
        accounts: fixtures.accounts,
        grants: [localServiceGrant],
        now: 1_900_000_000
      })
    });
    const provider = createNip07Provider({
      backend: createLocalServiceBrowserProviderBackend({
        service,
        routeRequest: routeVector.request
      }),
      client,
      nextRequestId: () => "req-kind-1-basic"
    });

    await expect(provider.getPublicKey()).resolves.toBe(routeVector.selection.public_key);
    await expect(provider.signEvent(request.params.event_template)).rejects.toThrow(/Signer dispatch is not configured/u);
  });

  it("creates browser native-messaging local-service clients over explicit senders", async () => {
    const sentHostNames: string[] = [];
    const service = createBrowserNativeMessagingLocalServiceClient({
      nextRequestId: () => "browser-native-status",
      sendNativeMessage: (hostName, message) => {
        sentHostNames.push(hostName);
        return handleLocalServiceRequest(message);
      }
    });

    await expect(service.serviceStatus()).resolves.toMatchObject({
      request_id: "browser-native-status",
      ok: true,
      result: {
        service: {
          name: "nsealr-companion-service",
          stores_production_secrets: false
        }
      }
    });
    expect(sentHostNames).toEqual([NATIVE_HOST_NAME]);
  });

  it("rejects invalid browser native-messaging host names before sending", async () => {
    let called = false;

    expect(() => createBrowserNativeMessagingLocalServiceClient({
      hostName: "bad host name",
      sendNativeMessage: () => {
        called = true;
        return {};
      }
    })).toThrow(/native host name/u);
    expect(called).toBe(false);
  });

  it("rejects invalid or silent browser native-messaging exchanges deterministically", async () => {
    expect(() => createBrowserNativeMessagingLocalServiceClient({
      timeoutMs: 0,
      sendNativeMessage: () => handleLocalServiceRequest({
        version: 1,
        request_id: "unused",
        operation: "service_status"
      })
    })).toThrow(/timeout/u);

    const service = createBrowserNativeMessagingLocalServiceClient({
      timeoutMs: 1,
      sendNativeMessage: () => new Promise(() => undefined)
    });

    await expect(service.serviceStatus("browser-native-timeout")).rejects.toThrow(/response timed out/u);
  });

  it("cancels browser native-messaging exchanges without contacting an already-aborted sender", async () => {
    const abortController = new AbortController();
    abortController.abort();
    let called = false;
    const alreadyAbortedService = createBrowserNativeMessagingLocalServiceClient({
      abortSignal: abortController.signal,
      sendNativeMessage: () => {
        called = true;
        return {};
      }
    });

    await expect(alreadyAbortedService.serviceStatus("browser-native-already-cancelled")).rejects.toThrow(/cancelled/u);
    expect(called).toBe(false);

    const inFlightAbortController = new AbortController();
    const service = createBrowserNativeMessagingLocalServiceClient({
      abortSignal: inFlightAbortController.signal,
      sendNativeMessage: (_hostName, _message, options) => {
        expect(options.abortSignal).toBe(inFlightAbortController.signal);
        return new Promise(() => undefined);
      }
    });

    const request = service.serviceStatus("browser-native-cancelled");
    inFlightAbortController.abort();

    await expect(request).rejects.toThrow(/cancelled/u);
  });

  it("surfaces local-service authorization failure before browser callers trust a key", async () => {
    const service = new LocalServiceClient({
      exchange: (message) => handleLocalServiceRequest(message, {
        accounts: fixtures.accounts,
        now: 1_900_000_000
      })
    });
    const provider = createNip07Provider({
      backend: createLocalServiceBrowserProviderBackend({
        service,
        routeRequest: routeVector.request
      }),
      client
    });

    await expect(provider.getPublicKey()).rejects.toThrow(/client is not paired/u);
  });
});
