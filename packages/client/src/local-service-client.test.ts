import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSpecsFixtures, resolveSpecsRoot } from "@nsealr/fixtures";
import {
  createNativeMessagingLocalServiceClient,
  LocalServiceClient,
  validateLocalServiceResponse
} from "./local-service-client.js";
import { decodeNativeMessage, encodeNativeMessage } from "./native-messaging.js";
import {
  clientIdForIdentity,
  handleLocalServiceRequest,
  LOCAL_SERVICE_OPERATIONS,
  type LocalClientGrant,
  type LocalClientIdentity
} from "./service.js";

const specsRoot = resolveSpecsRoot();
const fixtures = loadSpecsFixtures(specsRoot);
const request = JSON.parse(readFileSync(resolve(specsRoot, "examples/request-kind-1-basic.json"), "utf8"));
const response = JSON.parse(readFileSync(resolve(specsRoot, "examples/response-kind-1-basic.json"), "utf8"));
const routeVector = fixtures.routeSelections.find((selection) => selection.name === "esp32-usb-sign-event-slot-0");
if (!routeVector) throw new Error("route selection fixture is missing");
const client: LocalClientIdentity = {
  surface: "browser_extension",
  origin: "https://example.com",
  app_name: "Example Nostr Client",
  instance_id: "extension-test-1"
};
const grant: LocalClientGrant = {
  client_id: clientIdForIdentity(client),
  origin: client.origin,
  surface: client.surface,
  allowed_operations: ["select_account_route", "validate_signer_request", "verify_signer_response"],
  expires_at: 2_000_000_000
};

describe("local service client", () => {
  it("wraps service-status and pairing calls with generated request ids", async () => {
    const requestIds = ["client-status-1", "client-pair-1"];
    const service = new LocalServiceClient({
      nextRequestId: () => requestIds.shift() ?? "unexpected-request",
      exchange: (message) => handleLocalServiceRequest(message)
    });

    await expect(service.serviceStatus()).resolves.toMatchObject({
      request_id: "client-status-1",
      ok: true,
      result: {
        service: {
          requires_pairing: true,
          stores_production_secrets: false
        }
      }
    });

    await expect(service.requestPairing(client, ["validate_signer_request"])).resolves.toMatchObject({
      request_id: "client-pair-1",
      ok: true,
      result: {
        pairing_intent: {
          client_id: clientIdForIdentity(client),
          requested_operations: ["validate_signer_request"],
          requires_user_approval: true
        }
      }
    });
  });

  it("returns deterministic service errors without throwing", async () => {
    const service = new LocalServiceClient({
      exchange: (message) => handleLocalServiceRequest(message)
    });

    await expect(service.validateSignerRequest(client, request, "client-unpaired")).resolves.toEqual({
      version: 1,
      request_id: "client-unpaired",
      ok: false,
      error: {
        code: "unauthorized_client",
        message: "client is not paired",
        retryable: false
      }
    });
  });

  it("validates and verifies through authorized service exchanges", async () => {
    const service = new LocalServiceClient({
      exchange: (message) => handleLocalServiceRequest(message, {
        accounts: fixtures.accounts,
        grants: [grant],
        now: 1_900_000_000
      })
    });

    await expect(service.validateSignerRequest(client, request, "client-validate")).resolves.toMatchObject({
      request_id: "client-validate",
      ok: true,
      result: { validation: { valid: true } }
    });

    await expect(service.verifySignerResponse(client, request, response, "client-verify")).resolves.toMatchObject({
      request_id: "client-verify",
      ok: true,
      result: { validation: { valid: true } }
    });

    await expect(service.selectAccountRoute(client, routeVector.request, "client-route")).resolves.toEqual({
      version: 1,
      request_id: "client-route",
      ok: true,
      result: {
        route_selection: routeVector.selection
      }
    });
  });

  it("rejects malformed or mismatched service responses before callers trust them", async () => {
    const mismatchedResponseClient = new LocalServiceClient({
      exchange: (message) => ({
        ...handleLocalServiceRequest(message),
        request_id: "other-request"
      })
    });

    await expect(mismatchedResponseClient.serviceStatus("expected-request")).rejects.toThrow(/does not match/u);
    expect(() => validateLocalServiceResponse({
      version: 1,
      request_id: "expected-request",
      ok: true,
      result: { validation: { valid: "yes" } }
    }, "expected-request")).toThrow(/validation flag/u);
    expect(() => validateLocalServiceResponse({
      version: 1,
      request_id: "expected-request",
      ok: true,
      result: {
        validation: { valid: true },
        service: {
          protocol: "nsealr-local-service-v0"
        }
      }
    }, "expected-request")).toThrow(/result type/u);
    expect(() => validateLocalServiceResponse({
      version: 1,
      request_id: "expected-request",
      ok: true,
      result: {
        service: {
          protocol: "nsealr-local-service-v0",
          name: "nsealr-companion-service",
          operations: [...LOCAL_SERVICE_OPERATIONS],
          requires_pairing: true,
          stores_production_secrets: true
        }
      }
    }, "expected-request")).toThrow(/secret-storage flag/u);
    expect(() => validateLocalServiceResponse({
      version: 1,
      request_id: "expected-request",
      ok: true,
      result: {
        route_selection: {
          ...routeVector.selection,
          contains_secret_material: true
        }
      }
    }, "expected-request")).toThrow(/secret-material flag/u);
    expect(() => validateLocalServiceResponse({
      version: 1,
      request_id: "expected-request",
      ok: true,
      result: {
        route_selection: {
          ...routeVector.selection,
          repository: "raspberry"
        }
      }
    }, "expected-request")).toThrow(/repository does not match/u);
    expect(() => validateLocalServiceResponse({
      version: 1,
      request_id: "expected-request",
      ok: true,
      result: {
        pairing_intent: {
          format: "nsealr-local-pairing-intent-v0",
          client_id: clientIdForIdentity(client),
          client: {
            ...client,
            origin: "https://example.com/path"
          },
          requested_operations: ["validate_signer_request"],
          pairing_digest: "0".repeat(64),
          requires_user_approval: true,
          stores_production_secrets: false
        }
      }
    }, "expected-request")).toThrow(/pairing client/u);
    expect(() => validateLocalServiceResponse({
      version: 1,
      request_id: "expected-request",
      ok: true,
      result: {
        pairing_intent: {
          format: "nsealr-local-pairing-intent-v0",
          client_id: clientIdForIdentity(client),
          client,
          requested_operations: ["request_pairing"],
          pairing_digest: "0".repeat(64),
          requires_user_approval: true,
          stores_production_secrets: false
        }
      }
    }, "expected-request")).toThrow(/pairing operations/u);
    expect(() => validateLocalServiceResponse({
      version: 1,
      request_id: "expected-request",
      ok: true,
      result: {
        pairing_intent: {
          format: "nsealr-local-pairing-intent-v0",
          client_id: clientIdForIdentity(client),
          client,
          requested_operations: ["validate_signer_request"],
          pairing_digest: "0".repeat(64),
          requires_user_approval: true,
          stores_production_secrets: false
        }
      }
    }, "expected-request")).toThrow(/digest mismatch/u);
  });

  it("wraps native-messaging frame exchanges without exposing signer IO", async () => {
    const service = createNativeMessagingLocalServiceClient({
      exchange: (frame) => encodeNativeMessage(handleLocalServiceRequest(decodeNativeMessage(frame)))
    });

    await expect(service.serviceStatus("native-status")).resolves.toMatchObject({
      request_id: "native-status",
      ok: true,
      result: {
        service: {
          stores_production_secrets: false
        }
      }
    });
  });
});
