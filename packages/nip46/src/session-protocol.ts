// NIP-46 session wire protocol: build the client's signed + NIP-44-encrypted
// kind-24133 events and decrypt/verify the counterparty's events.
//
// The client transport keypair signs these kind-24133 events and performs the
// NIP-44 ECDH. It is NOT the user's signing key (which never leaves the device);
// it is an ephemeral transport key held in RAM by the caller and never persisted.

import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { computeEventId, nip44, verifySchnorrSignature } from "@nsealr/core";
import type { RelayEvent } from "./relay-transport.js";

const NIP46_EVENT_KIND = 24133;

function toSecretKeyBytes(secretKey: string | Uint8Array): Uint8Array {
  return typeof secretKey === "string" ? hexToBytes(secretKey) : secretKey;
}

// Build a signed, NIP-44-encrypted kind-24133 event addressed to `recipientPubkey`.
export function buildNip46RequestEvent(
  senderSecretKey: string | Uint8Array,
  recipientPubkey: string,
  message: string,
  createdAt: number
): RelayEvent {
  const secretKey = toSecretKeyBytes(senderSecretKey);
  const senderPubkey = bytesToHex(schnorr.getPublicKey(secretKey));
  const conversationKey = nip44.getConversationKey(secretKey, recipientPubkey);
  const content = nip44.encrypt(message, conversationKey);
  const template = {
    pubkey: senderPubkey,
    created_at: createdAt,
    kind: NIP46_EVENT_KIND,
    tags: [["p", recipientPubkey]],
    content
  };
  const id = computeEventId(template);
  const sig = bytesToHex(schnorr.sign(hexToBytes(id), secretKey));
  return { ...template, id, sig };
}

// Verify a kind-24133 event (id + BIP-340 signature) and NIP-44-decrypt its
// content using the recipient's secret key and the event sender's pubkey.
export function decryptNip46Event(recipientSecretKey: string | Uint8Array, event: RelayEvent): string {
  if (event.kind !== NIP46_EVENT_KIND) throw new Error(`NIP-46 event kind must be ${NIP46_EVENT_KIND}`);
  if (computeEventId(event) !== event.id) throw new Error("NIP-46 event id does not match its contents");
  if (!verifySchnorrSignature(event.pubkey, event.id, event.sig)) throw new Error("NIP-46 event signature is invalid");
  const secretKey = toSecretKeyBytes(recipientSecretKey);
  // Defense in depth: the wire layer must not rely solely on relay-side #p
  // filtering — require the event to be addressed to this recipient.
  const recipientPubkey = bytesToHex(schnorr.getPublicKey(secretKey));
  if (!event.tags.some((tag) => tag[0] === "p" && tag[1] === recipientPubkey)) {
    throw new Error("NIP-46 event is not addressed to this recipient");
  }
  const conversationKey = nip44.getConversationKey(secretKey, event.pubkey);
  return nip44.decrypt(event.content, conversationKey);
}
