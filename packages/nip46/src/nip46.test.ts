import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSpecsFixtures } from "../../fixtures/src/fixtures.js";
import { resolveSpecsRoot } from "../../fixtures/src/specs-root.js";
import { validateRequest } from "../../protocol/src/protocol.js";
import {
  isNip46RequestPermitted,
  nip46ResponseFromNostrSeal,
  nip46PermissionRequirementFromRequest,
  parseNip46ConnectIntent,
  nostrSealRequestFromNip46,
  parseNip46Permissions,
  respondToLocalNip46Request
} from "./nip46.js";

const specsRoot = resolveSpecsRoot();

function load(rel: string): unknown {
  return JSON.parse(readFileSync(resolve(specsRoot, rel), "utf8"));
}

describe("NIP-46 bridge payloads", () => {
  it("maps a decrypted sign_event request to a NostrSeal signing request", () => {
    const signEventRequest = load("examples/request-kind-1-basic.json") as {
      params: { event_template: unknown };
    };
    const message = {
      id: "nip46-req-1",
      method: "sign_event",
      params: [JSON.stringify(signEventRequest.params.event_template)]
    };

    const request = nostrSealRequestFromNip46(message);

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

  it("maps a decrypted get_public_key request to a NostrSeal public-key request", () => {
    expect(
      nostrSealRequestFromNip46({
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

  it("maps NostrSeal signed-event and public-key responses back to NIP-46 result strings", () => {
    const eventResponse = load("examples/response-kind-1-basic.json");
    const publicKeyResponse = load("examples/response-get-public-key.json");

    const eventMessage = nip46ResponseFromNostrSeal("nip46-req-1", eventResponse);
    const publicKeyMessage = nip46ResponseFromNostrSeal("nip46-key-1", publicKeyResponse);

    expect(eventMessage.id).toBe("nip46-req-1");
    expect(JSON.parse(eventMessage.result ?? "{}")).toEqual((eventResponse as { result: { event: unknown } }).result.event);
    expect(publicKeyMessage).toEqual({
      id: "nip46-key-1",
      result: "4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa"
    });
  });

  it("maps NostrSeal errors to NIP-46 error strings", () => {
    expect(nip46ResponseFromNostrSeal("nip46-req-1", load("examples/response-error-rejected.json"))).toEqual({
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
    expect(nostrSealRequestFromNip46(signEvent?.request_message)).toEqual(signEvent?.nostrseal_request);
    expect(nip46ResponseFromNostrSeal(signEvent?.request_message.id ?? "", signEvent?.nostrseal_response)).toEqual(
      signEvent?.response_message
    );
    expect(nostrSealRequestFromNip46(rejectedSignEvent?.request_message)).toEqual(rejectedSignEvent?.nostrseal_request);
    expect(
      nip46ResponseFromNostrSeal(
        rejectedSignEvent?.request_message.id ?? "",
        rejectedSignEvent?.nostrseal_response
      )
    ).toEqual(rejectedSignEvent?.response_message);
    expect(nostrSealRequestFromNip46(getPublicKey?.request_message)).toEqual(getPublicKey?.nostrseal_request);
    expect(nip46ResponseFromNostrSeal(getPublicKey?.request_message.id ?? "", getPublicKey?.nostrseal_response)).toEqual(
      getPublicKey?.response_message
    );
    expect(respondToLocalNip46Request(ping?.request_message)).toEqual(ping?.local_response_message);
    for (const vector of [signEvent, rejectedSignEvent, getPublicKey, ping]) {
      expect(nip46PermissionRequirementFromRequest(vector?.request_message)).toEqual(vector?.permission_requirement);
      for (const check of vector?.permission_checks ?? []) {
        expect(isNip46RequestPermitted(vector?.request_message, check.granted_permissions)).toBe(check.permitted);
      }
    }
  });

  it("rejects unsupported or unsafe NIP-46 request payloads", () => {
    expect(() => nostrSealRequestFromNip46({ id: "bad id", method: "get_public_key", params: [] })).toThrow(
      /id is invalid/u
    );
    expect(() => nostrSealRequestFromNip46({ id: "nip46-req-1", method: "ping", params: [] })).toThrow(
      /handled locally/u
    );
    expect(() =>
      nostrSealRequestFromNip46({
        id: "nip46-req-1",
        method: "sign_event",
        params: [JSON.stringify({ created_at: 1710000000, kind: 1, tags: [], content: "", sig: "00" })]
      })
    ).toThrow(/event_template must not contain sig/u);
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
      nostrSealRequestFromNip46({ id: "connect-1", method: "connect", params: [remoteSignerPubkey] })
    ).toThrow(/requires policy review/u);
    expect(() =>
      parseNip46ConnectIntent({ id: "connect-1", method: "connect", params: ["bad-pubkey"] })
    ).toThrow(/remote-signer pubkey/u);
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
});
