import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSpecsFixtures, resolveSpecsRoot } from "@nsealr/fixtures";
import {
  approvePairingIntent,
  clientIdForIdentity,
  handleLocalServiceRequest,
  LOCAL_SERVICE_OPERATIONS,
  LOCAL_SERVICE_PROTOCOL,
  parseLocalClientIdentity,
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
  allowed_operations: ["validate_signer_request", "verify_signer_response"],
  expires_at: 2_000_000_000
};
const routeGrant: LocalClientGrant = {
  ...grant,
  allowed_operations: ["select_account_route"]
};

describe("local service boundary", () => {
  it("parses local client identities through the shared origin boundary", () => {
    expect(parseLocalClientIdentity(client)).toEqual(client);
    expect(clientIdForIdentity(parseLocalClientIdentity(client))).toBe(clientIdForIdentity(client));
    expect(parseLocalClientIdentity({
      surface: "browser_extension",
      origin: "http://localhost",
      app_name: "Local Demo",
      instance_id: "local-demo-1"
    })).toEqual({
      surface: "browser_extension",
      origin: "http://localhost",
      app_name: "Local Demo",
      instance_id: "local-demo-1"
    });
  });

  it("rejects ambiguous local client identities before pairing or route checks", () => {
    expect(() => parseLocalClientIdentity({
      ...client,
      extra: "not allowed"
    })).toThrow(/unsupported fields/u);
    expect(() => parseLocalClientIdentity({
      ...client,
      origin: "https://example.com/path"
    })).toThrow(/origin scheme/u);
    expect(() => parseLocalClientIdentity({
      ...client,
      origin: "http://localhost.evil.example"
    })).toThrow(/origin scheme/u);
    expect(() => parseLocalClientIdentity({
      ...client,
      app_name: "x".repeat(81)
    })).toThrow(/app_name/u);
    expect(() => parseLocalClientIdentity({
      ...client,
      instance_id: "bad instance id"
    })).toThrow(/instance_id/u);
  });

  it("reports secretless service status and pairing requirement", () => {
    const result = handleLocalServiceRequest({
      version: 1,
      request_id: "svc-status-1",
      operation: "service_status"
    });

    expect(result).toEqual({
      version: 1,
      request_id: "svc-status-1",
      ok: true,
      result: {
        service: {
          protocol: LOCAL_SERVICE_PROTOCOL,
          name: "nsealr-companion-service",
          operations: [...LOCAL_SERVICE_OPERATIONS],
          requires_pairing: true,
          stores_production_secrets: false
        }
      }
    });
  });

  it("creates a deterministic pairing intent without approving the client", () => {
    const result = handleLocalServiceRequest({
      version: 1,
      request_id: "svc-pair-1",
      operation: "request_pairing",
      params: {
        client,
        requested_operations: ["validate_signer_request", "verify_signer_response"]
      }
    });

    expect(result).toMatchObject({
      version: 1,
      request_id: "svc-pair-1",
      ok: true,
      result: {
        pairing_intent: {
          format: "nsealr-local-pairing-intent-v0",
          client_id: clientIdForIdentity(client),
          client,
          requested_operations: ["validate_signer_request", "verify_signer_response"],
          requires_user_approval: true,
          stores_production_secrets: false
        }
      }
    });
    if (result.ok === true && "pairing_intent" in result.result) {
      expect(result.result.pairing_intent.pairing_digest).toMatch(/^[0-9a-f]{64}$/u);
      const repeatedResult = handleLocalServiceRequest({
        version: 1,
        request_id: "svc-pair-2",
        operation: "request_pairing",
        params: {
          client,
          requested_operations: ["validate_signer_request", "verify_signer_response"]
        }
      });
      expect(repeatedResult.ok).toBe(true);
      if (repeatedResult.ok === true && "pairing_intent" in repeatedResult.result) {
        expect(result.result.pairing_intent.pairing_digest).toBe(repeatedResult.result.pairing_intent.pairing_digest);
      }
    }
  });

  it("turns a manually approved pairing intent into an in-memory grant", () => {
    const pairing = handleLocalServiceRequest({
      version: 1,
      request_id: "svc-pair-approve",
      operation: "request_pairing",
      params: {
        client,
        requested_operations: ["validate_signer_request"]
      }
    });
    expect(pairing.ok).toBe(true);
    if (pairing.ok !== true || !("pairing_intent" in pairing.result)) {
      throw new Error("pairing intent was not returned");
    }

    const approval = approvePairingIntent(pairing.result.pairing_intent, {
      approvedAt: 1_900_000_000,
      expiresAt: 2_000_000_000
    });

    expect(approval).toMatchObject({
      format: "nsealr-local-pairing-approval-v0",
      pairing_digest: pairing.result.pairing_intent.pairing_digest,
      approved_at: 1_900_000_000,
      stores_production_secrets: false,
      grant: {
        client_id: clientIdForIdentity(client),
        origin: client.origin,
        surface: client.surface,
        allowed_operations: ["validate_signer_request"],
        expires_at: 2_000_000_000
      }
    });
    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-approved-validation",
      operation: "validate_signer_request",
      params: { client, request }
    }, { grants: [approval.grant], now: 1_900_000_000 })).toMatchObject({
      ok: true,
      result: { validation: { valid: true } }
    });
  });

  it("rejects tampered pairing intents and invalid approval expiry", () => {
    const pairing = handleLocalServiceRequest({
      version: 1,
      request_id: "svc-pair-tampered",
      operation: "request_pairing",
      params: {
        client,
        requested_operations: ["validate_signer_request"]
      }
    });
    if (pairing.ok !== true || !("pairing_intent" in pairing.result)) {
      throw new Error("pairing intent was not returned");
    }
    const intent = pairing.result.pairing_intent;
    expect(() => approvePairingIntent({
      ...intent,
      requested_operations: ["verify_signer_response"]
    }, { approvedAt: 1_900_000_000 })).toThrow(/digest mismatch/u);
    expect(() => approvePairingIntent({
      ...intent,
      client_id: "0".repeat(64)
    }, { approvedAt: 1_900_000_000 })).toThrow(/client_id mismatch/u);
    expect(() => approvePairingIntent({
      ...intent,
      requested_operations: ["service_status"]
    } as unknown as typeof intent, { approvedAt: 1_900_000_000 })).toThrow(/does not require pairing/u);
    expect(() => approvePairingIntent(intent, {
      approvedAt: 1_900_000_000,
      expiresAt: 1_900_000_000
    })).toThrow(/greater than approvedAt/u);
  });

  it("rejects validation requests from unpaired clients before parsing signer payloads", () => {
    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-validate-unpaired",
      operation: "validate_signer_request",
      params: {
        client,
        request
      }
    })).toEqual({
      version: 1,
      request_id: "svc-validate-unpaired",
      ok: false,
      error: {
        code: "unauthorized_client",
        message: "client is not paired",
        retryable: false
      }
    });
  });

  it("validates signer requests only after explicit in-memory authorization", () => {
    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-validate-1",
      operation: "validate_signer_request",
      params: { client, request }
    }, { grants: [grant], now: 1_900_000_000 })).toMatchObject({
      ok: true,
      result: { validation: { valid: true } }
    });

    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-validate-2",
      operation: "validate_signer_request",
      params: { client, request: { ...request, request_id: "bad request id" } }
    }, { grants: [grant], now: 1_900_000_000 })).toMatchObject({
      ok: true,
      result: { validation: { valid: false, error: "request_id is invalid" } }
    });
  });

  it("selects a secretless account route only after explicit in-memory authorization", () => {
    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-route-unpaired",
      operation: "select_account_route",
      params: {
        client,
        route_request: routeVector.request
      }
    }, { accounts: fixtures.accounts, now: 1_900_000_000 })).toMatchObject({
      ok: false,
      error: { code: "unauthorized_client", message: "client is not paired" }
    });

    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-route-1",
      operation: "select_account_route",
      params: {
        client,
        route_request: routeVector.request
      }
    }, { accounts: fixtures.accounts, grants: [routeGrant], now: 1_900_000_000 })).toEqual({
      version: 1,
      request_id: "svc-route-1",
      ok: true,
      result: {
        route_selection: routeVector.selection
      }
    });

    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-route-unknown",
      operation: "select_account_route",
      params: {
        client,
        route_request: {
          ...routeVector.request,
          account_id: "acct-missing"
        }
      }
    }, { accounts: fixtures.accounts, grants: [routeGrant], now: 1_900_000_000 })).toMatchObject({
      ok: false,
      error: {
        code: "route_selection_failed",
        message: "route selection account_id is unknown"
      }
    });
  });

  it("rejects revoked, expired, and operation-scoped pairings deterministically", () => {
    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-revoked",
      operation: "validate_signer_request",
      params: { client, request }
    }, { grants: [{ ...grant, revoked: true }], now: 1_900_000_000 })).toMatchObject({
      ok: false,
      error: { code: "unauthorized_client", message: "client pairing is revoked" }
    });
    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-expired",
      operation: "validate_signer_request",
      params: { client, request }
    }, { grants: [grant], now: 2_000_000_000 })).toMatchObject({
      ok: false,
      error: { code: "unauthorized_client", message: "client pairing is expired" }
    });
    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-scope",
      operation: "verify_signer_response",
      params: { client, request, response }
    }, {
      grants: [{ ...grant, allowed_operations: ["validate_signer_request"] }],
      now: 1_900_000_000
    })).toMatchObject({
      ok: false,
      error: { code: "unauthorized_client", message: "client is not authorized for operation" }
    });
  });

  it("uses the latest matching in-memory grant when grant history is supplied", () => {
    const oldValidationGrant: LocalClientGrant = {
      ...grant,
      allowed_operations: ["validate_signer_request"],
      approved_at: 100
    };
    const newerVerificationGrant: LocalClientGrant = {
      ...grant,
      allowed_operations: ["verify_signer_response"],
      approved_at: 200
    };

    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-latest-scope",
      operation: "validate_signer_request",
      params: { client, request }
    }, {
      grants: [oldValidationGrant, newerVerificationGrant],
      now: 1_900_000_000
    })).toMatchObject({
      ok: false,
      error: { code: "unauthorized_client", message: "client is not authorized for operation" }
    });

    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-latest-verify",
      operation: "verify_signer_response",
      params: { client, request, response }
    }, {
      grants: [oldValidationGrant, newerVerificationGrant],
      now: 1_900_000_000
    })).toMatchObject({
      ok: true,
      result: { validation: { valid: true } }
    });

    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-latest-revoked",
      operation: "validate_signer_request",
      params: { client, request }
    }, {
      grants: [
        oldValidationGrant,
        {
          ...grant,
          allowed_operations: ["validate_signer_request", "verify_signer_response"],
          approved_at: 300,
          revoked: true
        }
      ],
      now: 1_900_000_000
    })).toMatchObject({
      ok: false,
      error: { code: "unauthorized_client", message: "client pairing is revoked" }
    });
  });

  it("verifies signer responses against their original request", () => {
    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-verify-1",
      operation: "verify_signer_response",
      params: { client, request, response }
    }, { grants: [grant], now: 1_900_000_000 })).toMatchObject({
      ok: true,
      result: { validation: { valid: true } }
    });

    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-verify-2",
      operation: "verify_signer_response",
      params: { client, request, response: { ...response, request_id: "other-request" } }
    }, { grants: [grant], now: 1_900_000_000 })).toMatchObject({
      ok: true,
      result: { validation: { valid: false, error: "response request_id does not match request" } }
    });
  });

  it("rejects malformed local service requests deterministically", () => {
    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-bad-origin",
      operation: "request_pairing",
      params: {
        client: {
          ...client,
          origin: "http://localhost.evil.example"
        },
        requested_operations: ["validate_signer_request"]
      }
    })).toMatchObject({
      ok: false,
      error: {
        code: "invalid_service_request",
        message: "client origin scheme is unsupported"
      }
    });

    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "svc-url-with-path",
      operation: "request_pairing",
      params: {
        client: {
          ...client,
          origin: "https://example.com/path"
        },
        requested_operations: ["validate_signer_request"]
      }
    })).toMatchObject({
      ok: false,
      error: {
        code: "invalid_service_request",
        message: "client origin scheme is unsupported"
      }
    });

    expect(handleLocalServiceRequest({
      version: 1,
      request_id: "bad service id",
      operation: "service_status"
    })).toEqual({
      version: 1,
      request_id: "invalid-service-request",
      ok: false,
      error: {
        code: "invalid_service_request",
        message: "service request_id is invalid",
        retryable: false
      }
    });
  });
});
