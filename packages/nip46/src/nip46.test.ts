import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSpecsFixtures } from "../../fixtures/src/fixtures.js";
import { resolveSpecsRoot } from "../../fixtures/src/specs-root.js";
import { validateRequest } from "../../protocol/src/protocol.js";
import {
  decideNip46BridgeAction,
  isNip46RequestPermitted,
  nip46ResponseFromNSealr,
  nip46PermissionRequirementFromRequest,
  parseNip46ConnectIntent,
  parseNip46PolicyFile,
  nsealrRequestFromNip46,
  parseNip46Permissions,
  reviewNip46ConnectMessage,
  respondToLocalNip46Request
} from "./nip46.js";

const specsRoot = resolveSpecsRoot();

function load(rel: string): unknown {
  return JSON.parse(readFileSync(resolve(specsRoot, rel), "utf8"));
}

describe("NIP-46 bridge payloads", () => {
  it("maps a decrypted sign_event request to a nSealr signing request", () => {
    const signEventRequest = load("examples/request-kind-1-basic.json") as {
      params: { event_template: unknown };
    };
    const message = {
      id: "nip46-req-1",
      method: "sign_event",
      params: [JSON.stringify(signEventRequest.params.event_template)]
    };

    const request = nsealrRequestFromNip46(message);

    expect(request).toEqual({
      version: 1,
      request_id: "nip46-req-1",
      method: "sign_event",
      params: {
        event_template: signEventRequest.params.event_template
      }
    });
    expect(validateRequest(request).ok).toBe(true);
  });

  it("maps a decrypted get_public_key request to a nSealr public-key request", () => {
    expect(
      nsealrRequestFromNip46({
        id: "nip46-key-1",
        method: "get_public_key",
        params: []
      })
    ).toEqual({
      version: 1,
      request_id: "nip46-key-1",
      method: "get_public_key"
    });
  });

  it("maps nSealr signed-event and public-key responses back to NIP-46 result strings", () => {
    const eventResponse = load("examples/response-kind-1-basic.json");
    const publicKeyResponse = load("examples/response-get-public-key.json");

    const eventMessage = nip46ResponseFromNSealr("nip46-req-1", eventResponse);
    const publicKeyMessage = nip46ResponseFromNSealr("nip46-key-1", publicKeyResponse);

    expect(eventMessage.id).toBe("nip46-req-1");
    expect(JSON.parse(eventMessage.result ?? "{}")).toEqual((eventResponse as { result: { event: unknown } }).result.event);
    expect(publicKeyMessage).toEqual({
      id: "nip46-key-1",
      result: "4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa"
    });
  });

  it("maps nSealr errors to NIP-46 error strings", () => {
    expect(nip46ResponseFromNSealr("nip46-req-1", load("examples/response-error-rejected.json"))).toEqual({
      id: "nip46-req-1",
      error: "user_rejected: User rejected the signing request."
    });
  });

  it("handles ping locally without reaching a signer transport", () => {
    expect(respondToLocalNip46Request({ id: "ping-1", method: "ping", params: [] })).toEqual({
      id: "ping-1",
      result: "pong"
    });
  });

  it("matches shared NIP-46 bridge vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(specsRoot);
    const signEvent = fixtures.nip46Payloads.find((vector) => vector.name === "sign-event-kind-1-basic");
    const rejectedSignEvent = fixtures.nip46Payloads.find((vector) => vector.name === "sign-event-user-rejected");
    const connect = fixtures.nip46Payloads.find((vector) => vector.name === "connect-policy-review");
    const getPublicKey = fixtures.nip46Payloads.find((vector) => vector.name === "get-public-key");
    const ping = fixtures.nip46Payloads.find((vector) => vector.name === "ping");

    expect(parseNip46ConnectIntent(connect?.request_message)).toEqual(connect?.connect_intent);
    expect(reviewNip46ConnectMessage(connect?.request_message)).toEqual(
      (connect as { connect_review?: unknown } | undefined)?.connect_review
    );
    expect(nsealrRequestFromNip46(signEvent?.request_message)).toEqual(signEvent?.nsealr_request);
    expect(nip46ResponseFromNSealr(signEvent?.request_message.id ?? "", signEvent?.nsealr_response)).toEqual(
      signEvent?.response_message
    );
    expect(nsealrRequestFromNip46(rejectedSignEvent?.request_message)).toEqual(rejectedSignEvent?.nsealr_request);
    expect(
      nip46ResponseFromNSealr(
        rejectedSignEvent?.request_message.id ?? "",
        rejectedSignEvent?.nsealr_response
      )
    ).toEqual(rejectedSignEvent?.response_message);
    expect(nsealrRequestFromNip46(getPublicKey?.request_message)).toEqual(getPublicKey?.nsealr_request);
    expect(nip46ResponseFromNSealr(getPublicKey?.request_message.id ?? "", getPublicKey?.nsealr_response)).toEqual(
      getPublicKey?.response_message
    );
    expect(respondToLocalNip46Request(ping?.request_message)).toEqual(ping?.local_response_message);
    for (const vector of [signEvent, rejectedSignEvent, getPublicKey, ping]) {
      expect(nip46PermissionRequirementFromRequest(vector?.request_message)).toEqual(vector?.permission_requirement);
      for (const check of vector?.permission_checks ?? []) {
        expect(isNip46RequestPermitted(vector?.request_message, check.granted_permissions)).toBe(check.permitted);
      }
    }
    for (const vector of fixtures.nip46Payloads) {
      expect(vector.bridge_decisions?.length).toBeGreaterThan(0);
      for (const check of vector.bridge_decisions ?? []) {
        expect(decideNip46BridgeAction(vector.request_message, check.granted_permissions)).toEqual(check.decision);
      }
    }
  });

  it("rejects unsupported or unsafe NIP-46 request payloads", () => {
    expect(() => nsealrRequestFromNip46({ id: "bad id", method: "get_public_key", params: [] })).toThrow(
      /id is invalid/u
    );
    expect(() => nsealrRequestFromNip46({ id: "nip46-req-1", method: "ping", params: [] })).toThrow(
      /handled locally/u
    );
    expect(() =>
      nsealrRequestFromNip46({
        id: "nip46-req-1",
        method: "sign_event",
        params: [JSON.stringify({ created_at: 1710000000, kind: 1, tags: [], content: "", sig: "00" })]
      })
    ).toThrow(/event_template contains forbidden fields/u);
  });

  it("parses NIP-46 permission strings without granting permissions", () => {
    expect(parseNip46Permissions("nip44_encrypt,sign_event:4,sign_event:30023")).toEqual([
      { method: "nip44_encrypt" },
      { method: "sign_event", parameter: "4", event_kind: 4 },
      { method: "sign_event", parameter: "30023", event_kind: 30023 }
    ]);
    expect(parseNip46Permissions("")).toEqual([]);
    expect(() => parseNip46Permissions("sign_event:not-a-kind")).toThrow(/sign_event permission kind/u);
    expect(() => parseNip46Permissions("connect")).toThrow(/must not request connect/u);
    expect(() => parseNip46Permissions("unknown_method")).toThrow(/unsupported permission method/u);
  });

  it("parses policy files in package code instead of CLI code", () => {
    const policy = load("vectors/nip46-policy-files/sign-event-kind-1-approved.json");

    expect(parseNip46PolicyFile(policy)).toEqual([{ method: "sign_event", parameter: "1", event_kind: 1 }]);
  });

  it("rejects shared invalid NIP-46 hardening vectors deterministically", () => {
    const fixtures = loadSpecsFixtures(specsRoot);
    const vectors = fixtures.invalidVectors.filter((vector) => vector.category === "nip46" || vector.category === "nip46-policy-file");

    expect(vectors.length).toBeGreaterThan(0);
    for (const vector of vectors) {
      const action = () => {
        if (vector.category === "nip46-policy-file") {
          parseNip46PolicyFile(vector.policy_file);
          return;
        }
        decideNip46BridgeAction(vector.request_message, []);
      };
      expect(action, vector.name).toThrow(vector.expected_error);
    }
  });

  it("parses connect requests as policy-review intents without acknowledging them", () => {
    const remoteSignerPubkey = "4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa";

    expect(
      parseNip46ConnectIntent({
        id: "connect-1",
        method: "connect",
        params: [remoteSignerPubkey, "secret-1", "sign_event:1,nip44_encrypt"]
      })
    ).toEqual({
      id: "connect-1",
      remote_signer_pubkey: remoteSignerPubkey,
      secret: "secret-1",
      requested_permissions: [{ method: "sign_event", parameter: "1", event_kind: 1 }, { method: "nip44_encrypt" }]
    });
    expect(() =>
      nsealrRequestFromNip46({ id: "connect-1", method: "connect", params: [remoteSignerPubkey] })
    ).toThrow(/requires policy review/u);
    expect(() =>
      parseNip46ConnectIntent({ id: "connect-1", method: "connect", params: ["bad-pubkey"] })
    ).toThrow(/remote-signer pubkey/u);
  });

  it("renders connect review pages without echoing the secret value", () => {
    const remoteSignerPubkey = "4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa";

    const review = reviewNip46ConnectMessage({
      id: "connect-1",
      method: "connect",
      params: [remoteSignerPubkey, "secret-1", "sign_event:1,nip44_encrypt"]
    });

    expect(review).toEqual({
      format: "nsealr-nip46-connect-review-v0",
      id: "connect-1",
      remote_signer_pubkey: remoteSignerPubkey,
      secret_present: true,
      requested_permissions: [{ method: "sign_event", parameter: "1", event_kind: 1 }, { method: "nip44_encrypt" }],
      pages: [
        {
          title: "Connect",
          page_indicator: "Page 1/2",
          body_lines: ["Remote signer", remoteSignerPubkey, "Secret: provided"]
        },
        {
          title: "Permissions",
          page_indicator: "Page 2/2",
          body_lines: ["sign_event:1", "nip44_encrypt"]
        }
      ]
    });
    expect(JSON.stringify(review)).not.toContain("secret-1");
  });

  it("matches request permissions without granting policy", () => {
    const signEventRequest = load("examples/request-kind-1-basic.json") as {
      params: { event_template: unknown };
    };
    const signEventMessage = {
      id: "nip46-req-1",
      method: "sign_event",
      params: [JSON.stringify(signEventRequest.params.event_template)]
    };

    expect(nip46PermissionRequirementFromRequest(signEventMessage)).toEqual({
      method: "sign_event",
      parameter: "1",
      event_kind: 1
    });
    expect(isNip46RequestPermitted(signEventMessage, parseNip46Permissions("sign_event:1"))).toBe(true);
    expect(isNip46RequestPermitted(signEventMessage, parseNip46Permissions("sign_event:4"))).toBe(false);
    expect(isNip46RequestPermitted(signEventMessage, parseNip46Permissions("sign_event"))).toBe(true);
    expect(
      isNip46RequestPermitted(
        {
          id: "nip46-key-1",
          method: "get_public_key",
          params: []
        },
        parseNip46Permissions("get_public_key")
      )
    ).toBe(true);
    expect(
      isNip46RequestPermitted(
        {
          id: "nip46-key-1",
          method: "get_public_key",
          params: []
        },
        []
      )
    ).toBe(false);
    expect(() =>
      nip46PermissionRequirementFromRequest({
        id: "connect-1",
        method: "connect",
        params: ["4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa"]
      })
    ).toThrow(/connect requires policy review/u);
  });

  it("decides whether a NIP-46 request may reach signer transport", () => {
    const signEventRequest = load("examples/request-kind-1-basic.json") as {
      params: { event_template: unknown };
    };
    const signEventMessage = {
      id: "nip46-req-1",
      method: "sign_event",
      params: [JSON.stringify(signEventRequest.params.event_template)]
    };

    expect(decideNip46BridgeAction(signEventMessage, parseNip46Permissions("sign_event:1"))).toEqual({
      type: "signer_request",
      permission_requirement: {
        method: "sign_event",
        parameter: "1",
        event_kind: 1
      },
      nsealr_request: {
        version: 1,
        request_id: "nip46-req-1",
        method: "sign_event",
        params: {
          event_template: signEventRequest.params.event_template
        }
      }
    });

    expect(decideNip46BridgeAction(signEventMessage, parseNip46Permissions("sign_event:4"))).toEqual({
      type: "permission_denied",
      permission_requirement: {
        method: "sign_event",
        parameter: "1",
        event_kind: 1
      },
      response_message: {
        id: "nip46-req-1",
        error: "permission_denied: request requires approved permission sign_event:1"
      }
    });
  });

  it("keeps local ping and connect inside the NIP-46 policy boundary", () => {
    const remoteSignerPubkey = "4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa";

    expect(
      decideNip46BridgeAction(
        {
          id: "ping-1",
          method: "ping",
          params: []
        },
        parseNip46Permissions("ping")
      )
    ).toEqual({
      type: "local_response",
      permission_requirement: {
        method: "ping"
      },
      response_message: {
        id: "ping-1",
        result: "pong"
      }
    });

    expect(decideNip46BridgeAction({ id: "ping-1", method: "ping", params: [] }, [])).toEqual({
      type: "permission_denied",
      permission_requirement: {
        method: "ping"
      },
      response_message: {
        id: "ping-1",
        error: "permission_denied: request requires approved permission ping"
      }
    });

    expect(
      decideNip46BridgeAction(
        {
          id: "connect-1",
          method: "connect",
          params: [remoteSignerPubkey, "secret-1", "sign_event:1"]
        },
        []
      )
    ).toEqual({
      type: "connect_review",
      connect_intent: {
        id: "connect-1",
        remote_signer_pubkey: remoteSignerPubkey,
        secret: "secret-1",
        requested_permissions: [{ method: "sign_event", parameter: "1", event_kind: 1 }]
      }
    });
  });
});
