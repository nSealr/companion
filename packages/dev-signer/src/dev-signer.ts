import { schnorr } from "@noble/curves/secp256k1.js";
import {
  bytesToHex,
  computeEventId,
  hexToBytes,
  type EventTemplate,
  type SignEventRequest,
  type SignEventResponse,
  type SignedEvent
} from "../../core/src/nostr.js";

export function publicKeyFromSecret(secretKeyHex: string): string {
  return bytesToHex(schnorr.getPublicKey(hexToBytes(secretKeyHex)));
}

export function signTemplate(template: EventTemplate, secretKeyHex: string): SignedEvent {
  const pubkey = publicKeyFromSecret(secretKeyHex);
  const eventWithoutId = {
    pubkey,
    created_at: template.created_at,
    kind: template.kind,
    tags: template.tags,
    content: template.content
  };
  const id = computeEventId(eventWithoutId);
  const aux = new Uint8Array(32);
  const sig = bytesToHex(schnorr.sign(hexToBytes(id), hexToBytes(secretKeyHex), aux));
  return { id, ...eventWithoutId, sig };
}

export function devSignRequest(request: SignEventRequest, secretKeyHex: string): SignEventResponse {
  if (request.version !== 1 || request.method !== "sign_event") {
    throw new Error("devSignRequest only supports v0 sign_event requests");
  }
  return {
    version: 1,
    request_id: request.request_id,
    ok: true,
    result: {
      event: signTemplate(request.params.event_template, secretKeyHex)
    }
  };
}

