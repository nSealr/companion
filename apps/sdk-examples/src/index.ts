import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createNip07Provider } from "@nsealr/browser-provider";
import {
  clientIdForIdentity,
  handleLocalServiceRequest,
  LocalServiceClient,
  type LocalClientGrant,
  type LocalClientIdentity
} from "@nsealr/client";
import {
  computeEventId,
  verifySignedEventResponse,
  type EventTemplate,
  type SignEventRequest,
  type SignEventResponse
} from "@nsealr/core";
import { loadSpecsFixtures, resolveSpecsRoot } from "@nsealr/fixtures";
import { decodeSerialFrame, encodeSerialFrame } from "@nsealr/framing";
import { decideNip46BridgeAction } from "@nsealr/nip46";
import {
  decidePolicyRequest,
  parseAccountDescriptor,
  parseGrantDescriptor,
  parsePolicyProfile,
  selectAccountRoute
} from "@nsealr/policy";
import { validateRequest, validateResponse } from "@nsealr/protocol";
import { decodeQrEnvelope, encodeQrEnvelope } from "@nsealr/qr";
import {
  approvalDigestForRequest,
  renderReviewDetailPages,
  reviewEventTemplate
} from "@nsealr/review";
import {
  CommandApdu,
  GET_PUBLIC_KEY_INS,
  NSEALR_CLA,
  ResponseApdu,
  SW_NO_ERROR
} from "@nsealr/smartcard";
import { exchangeSerialLineRequest, type SerialLinePort } from "@nsealr/transport";

const request: SignEventRequest = {
  version: 1,
  request_id: "req-kind-1-basic",
  method: "sign_event",
  params: {
    event_template: {
      created_at: 1_710_000_000,
      kind: 1,
      tags: [],
      content: "nSealr fixture: basic kind 1 event."
    }
  }
};

const response: SignEventResponse = {
  version: 1,
  request_id: "req-kind-1-basic",
  ok: true,
  result: {
    event: {
      id: "2977f107ad2668dbd9f09b8594eff3b5276e21bfe098e60ae3e905e3c861e4d3",
      pubkey: "4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa",
      created_at: 1_710_000_000,
      kind: 1,
      tags: [],
      content: "nSealr fixture: basic kind 1 event.",
      sig: "2eec0351eb1d651140922d4b1f1bd8135f4474aabf42ec5bda7011087c1a072d71be863646dc162e4d96eacf14afeed2618a4acb0e1134a273a2b8e73039e654"
    }
  }
};
const publicKey = response.result.event.pubkey;
const companionRoot = fileURLToPath(new URL("../../..", import.meta.url));
const siblingSpecsRoot = join(dirname(companionRoot), "specs");

const sdkClient: LocalClientIdentity = {
  surface: "sdk",
  origin: "sdk:example",
  app_name: "nSealr SDK Example",
  instance_id: "sdk-example-1"
};

function assertValidSignerRequest(value: unknown): asserts value is SignEventRequest {
  const validation = validateRequest(value);
  assert.equal(validation.ok, true, validation.error);
}

async function requestAndQrExample(): Promise<void> {
  assertValidSignerRequest(request);

  const signedEvent = response.result.event;
  assert.equal(computeEventId({
    pubkey: signedEvent.pubkey,
    created_at: signedEvent.created_at,
    kind: signedEvent.kind,
    tags: signedEvent.tags,
    content: signedEvent.content
  }), signedEvent.id);
  assert.equal(validateResponse(response).ok, true);
  assert.equal(verifySignedEventResponse(request, response).ok, true);

  const envelope = encodeQrEnvelope(request);
  assert.deepEqual(decodeQrEnvelope(envelope), request);
}

async function fixturesPolicyReviewAndFramingExample(): Promise<void> {
  const fixtures = loadSpecsFixtures(specsRootForExamples());
  assert(fixtures.events.length > 0);
  assert(fixtures.reviewDetailPages.length > 0);
  assert(fixtures.policyDecisions.length > 0);
  assert(fixtures.routeSelections.length > 0);

  const policyVector = fixtures.policyDecisions.find((candidate) => candidate.decision.decision === "allow");
  if (!policyVector) throw new Error("SDK example could not find an allowed policy-decision vector");
  const sourceAccount = fixtures.accounts.find((candidate) => candidate.account_id === policyVector.request.account_id);
  if (!sourceAccount) throw new Error("SDK example policy vector references an unknown account");
  const sourcePolicy = fixtures.policyProfiles.find((candidate) => candidate.policy_id === policyVector.policy_profile_id);
  if (!sourcePolicy) throw new Error("SDK example policy vector references an unknown policy profile");
  const sourceGrant = fixtures.grants.find((candidate) => policyVector.request.grant_ids.includes(candidate.grant_id));
  if (!sourceGrant) throw new Error("SDK example policy vector references an unknown grant");
  const account = parseAccountDescriptor(JSON.parse(JSON.stringify(sourceAccount)));
  const policy = parsePolicyProfile(JSON.parse(JSON.stringify(sourcePolicy)));
  const grant = parseGrantDescriptor(JSON.parse(JSON.stringify(sourceGrant)));
  assert.deepEqual(decidePolicyRequest({
    policy,
    grants: [grant],
    request: policyVector.request
  }), policyVector.decision);
  assert.equal(account.account_id, policyVector.request.account_id);
  assert.equal(account.policy_profile_id, policyVector.policy_profile_id);
  assert.equal(grant.account_id, account.account_id);
  assert.equal(policy.route_types.includes(policyVector.request.route_type), true);

  const routeVector = fixtures.routeSelections.find((candidate) => candidate.request.account_id === account.account_id);
  if (!routeVector) throw new Error("SDK example could not find a matching route-selection vector");
  assert.deepEqual(selectAccountRoute(fixtures.accounts, routeVector.request), routeVector.selection);
  assert.equal(routeVector.selection.contains_secret_material, false);

  const review = reviewEventTemplate(request.params.event_template, publicKey);
  const detailPages = renderReviewDetailPages(review, {
    max_title_chars: 18,
    max_body_lines: 5,
    max_line_chars: 26,
    max_compact_body_lines: 9,
    max_compact_line_chars: 48
  });
  assert(detailPages.length > 0);
  assert.equal(approvalDigestForRequest(request, publicKey).length, 64);

  const frame = encodeSerialFrame({ type: "request", payload: request });
  assert.deepEqual(decodeSerialFrame(frame), { type: "request", payload: request });
}

async function localServiceExample(): Promise<void> {
  const service = new LocalServiceClient({
    exchange: (message) => handleLocalServiceRequest(message, {
      grants: [exampleGrant()],
      now: 1_900_000_000
    }),
    nextRequestId: sequence("sdk-service")
  });

  const status = await service.serviceStatus();
  if (status.ok !== true) throw new Error(status.error.message);
  if (!("service" in status.result)) throw new Error("service status example returned wrong result type");
  assert.equal(status.result.service.stores_production_secrets, false);

  const pairing = await service.requestPairing(sdkClient, ["validate_signer_request", "verify_signer_response"]);
  if (pairing.ok !== true) throw new Error(pairing.error.message);
  if (!("pairing_intent" in pairing.result)) throw new Error("pairing example returned wrong result type");
  assert.equal(pairing.result.pairing_intent.requires_user_approval, true);
  assert.equal(pairing.result.pairing_intent.stores_production_secrets, false);

  const validation = await service.validateSignerRequest(sdkClient, request);
  if (validation.ok !== true) throw new Error(validation.error.message);
  if (!("validation" in validation.result)) throw new Error("validation example returned wrong result type");
  assert.equal(validation.result.validation.valid, true);

  const verification = await service.verifySignerResponse(sdkClient, request, response);
  if (verification.ok !== true) throw new Error(verification.error.message);
  if (!("validation" in verification.result)) throw new Error("verification example returned wrong result type");
  assert.equal(verification.result.validation.valid, true);
}

async function browserProviderExample(): Promise<void> {
  let signerRequest: SignEventRequest | undefined;
  const provider = createNip07Provider({
    client: {
      surface: "browser_extension",
      origin: "https://example.com",
      app_name: "Example Nostr Client",
      instance_id: "sdk-provider-1"
    },
    backend: {
      getPublicKey: async () => publicKey,
      signEventRequest: async (incomingRequest) => {
        signerRequest = incomingRequest;
        return {
          version: 1,
          request_id: incomingRequest.request_id,
          ok: false,
          error: {
            code: "signing_disabled",
            message: "example backend has no signer transport",
            retryable: false
          }
        };
      }
    },
    nextRequestId: () => "sdk-provider-sign-event"
  });

  assert.equal(await provider.getPublicKey(), publicKey);
  await assert.rejects(
    provider.signEvent(request.params.event_template as EventTemplate),
    /example backend has no signer transport/u
  );
  assertValidSignerRequest(signerRequest);
}

async function nip46BridgeExample(): Promise<void> {
  const eventTemplate = request.params.event_template;
  const decision = decideNip46BridgeAction({
    id: "sdk-nip46-sign-event",
    method: "sign_event",
    params: [JSON.stringify(eventTemplate)]
  }, [{
    method: "sign_event",
    parameter: String(eventTemplate.kind),
    event_kind: eventTemplate.kind
  }]);

  assert.equal(decision.type, "signer_request");
  if (decision.type === "signer_request") {
    assert.equal(validateRequest(decision.nsealr_request).ok, true);
    if (decision.nsealr_request.method !== "sign_event") {
      throw new Error("NIP-46 example returned non-sign_event signer request");
    }
    assert.deepEqual(decision.nsealr_request.params.event_template, eventTemplate);
  }

  const denied = decideNip46BridgeAction({
    id: "sdk-nip46-get-public-key",
    method: "get_public_key",
    params: []
  }, []);
  assert.equal(denied.type, "permission_denied");
}

async function smartcardAndTransportExample(): Promise<void> {
  const command = new CommandApdu(NSEALR_CLA, GET_PUBLIC_KEY_INS);
  assert.equal(CommandApdu.fromHex(command.toHex()).toHex(), command.toHex());

  const apduResponse = new ResponseApdu(Uint8Array.of(1, 2, 3), SW_NO_ERROR);
  assert.equal(ResponseApdu.fromHex(apduResponse.toHex()).statusWord, SW_NO_ERROR);

  let writtenLine: string | undefined;
  let closed = false;
  const port: SerialLinePort = {
    async writeLine(line: string): Promise<void> {
      writtenLine = line;
    },
    async readLine(): Promise<string | null> {
      assert(writtenLine);
      return encodeSerialFrame({
        type: "response",
        payload: {
          version: 1,
          request_id: request.request_id,
          ok: false,
          error: {
            code: "signing_disabled",
            message: "SDK example has no signer transport",
            retryable: false
          }
        }
      });
    },
    close(): void {
      closed = true;
    }
  };

  const transportResponse = await exchangeSerialLineRequest({
    path: "memory",
    request,
    openPort: () => port,
    responseTimeoutMs: 10
  });
  assert.equal(validateResponse(transportResponse).ok, true);
  assert.equal((transportResponse as { error?: { code?: string } }).error?.code, "signing_disabled");
  assert.equal(closed, true);
}

function exampleGrant(): LocalClientGrant {
  return {
    client_id: clientIdForIdentity(sdkClient),
    origin: sdkClient.origin,
    surface: sdkClient.surface,
    allowed_operations: ["validate_signer_request", "verify_signer_response"],
    expires_at: 2_000_000_000
  };
}

function sequence(prefix: string): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}-${next}`;
  };
}

function specsRootForExamples(): string {
  if (existsSync(join(siblingSpecsRoot, "vectors")) && existsSync(join(siblingSpecsRoot, "examples"))) {
    return resolveSpecsRoot(siblingSpecsRoot);
  }
  return resolveSpecsRoot(join(companionRoot, "tests", "fixtures", "specs"));
}

await requestAndQrExample();
await fixturesPolicyReviewAndFramingExample();
await localServiceExample();
await browserProviderExample();
await nip46BridgeExample();
await smartcardAndTransportExample();

console.log("nSealr SDK examples passed");
