// NIP-46 client session manager: orchestrates the relay transport, the session
// wire protocol (session-protocol.ts) and request/response correlation into a
// small state machine. The client transport key lives only in memory here; the
// user signing key never touches this host.

import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { verifySignedEventResponse, type EventTemplate, type SignedEvent } from "@nsealr/core";
import { requireResponseMessage, type Nip46ResponseMessage } from "./nip46.js";
import { buildNip46RequestEvent, decryptNip46Event } from "./session-protocol.js";
import type { RelayEvent, RelaySubscription, RelayTransport } from "./relay-transport.js";

const NIP46_EVENT_KIND = 24133;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

export type SessionPhase = "idle" | "session_active" | "session_closed";

export type Nip46SessionManagerOptions = {
  clientSecretKey: string | Uint8Array;
  remoteSignerPubkey: string;
  transport: RelayTransport;
  requestTimeoutMs?: number;
  now?: () => number;
  randomId?: () => string;
};

type PendingRequest = {
  resolve: (message: Nip46ResponseMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
};

function defaultRandomId(): string {
  return globalThis.crypto.randomUUID();
}

export class Nip46SessionManager {
  readonly clientPubkey: string;

  private phaseValue: SessionPhase = "idle";
  private connecting = false;
  private readonly secretKey: Uint8Array;
  private readonly remoteSignerPubkey: string;
  private readonly transport: RelayTransport;
  private readonly requestTimeoutMs: number;
  private readonly now: () => number;
  private readonly randomId: () => string;
  private readonly pending = new Map<string, PendingRequest>();
  private subscription: RelaySubscription | undefined;

  constructor(options: Nip46SessionManagerOptions) {
    this.secretKey = typeof options.clientSecretKey === "string" ? hexToBytes(options.clientSecretKey) : options.clientSecretKey;
    this.clientPubkey = bytesToHex(schnorr.getPublicKey(this.secretKey));
    this.remoteSignerPubkey = options.remoteSignerPubkey;
    this.transport = options.transport;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
    this.randomId = options.randomId ?? defaultRandomId;
  }

  get phase(): SessionPhase {
    return this.phaseValue;
  }

  async connect(): Promise<void> {
    if (this.phaseValue !== "idle") throw new Error(`cannot connect from phase ${this.phaseValue}`);
    if (this.connecting) throw new Error("NIP-46 connect already in progress");
    this.connecting = true;
    try {
      await this.ensureSubscribed();
      const response = await this.sendRequest("connect", [this.remoteSignerPubkey]);
      if (response.error !== undefined) throw new Error(`NIP-46 connect rejected: ${response.error}`);
      if (response.result !== "ack") throw new Error(`NIP-46 connect expected "ack", got ${String(response.result)}`);
      this.phaseValue = "session_active";
    } finally {
      this.connecting = false;
    }
  }

  async signEvent(template: EventTemplate): Promise<SignedEvent> {
    if (this.phaseValue !== "session_active") throw new Error(`cannot sign_event from phase ${this.phaseValue}`);
    const requestId = this.randomId();
    const response = await this.sendRequest("sign_event", [JSON.stringify(template)], requestId);
    if (response.error !== undefined) throw new Error(`NIP-46 sign_event rejected: ${response.error}`);
    if (response.result === undefined) throw new Error("NIP-46 sign_event response has no result");
    let event: SignedEvent;
    try {
      event = JSON.parse(response.result) as SignedEvent;
    } catch {
      throw new Error("NIP-46 sign_event result is not valid JSON");
    }
    const verification = verifySignedEventResponse(
      { version: 1, request_id: requestId, method: "sign_event", params: { event_template: template } },
      { version: 1, request_id: requestId, ok: true, result: { event } }
    );
    if (!verification.ok) throw new Error(`NIP-46 signed event failed verification: ${verification.error}`);
    return event;
  }

  async close(): Promise<void> {
    this.phaseValue = "session_closed";
    this.subscription?.close();
    this.subscription = undefined;
    for (const pending of this.pending.values()) {
      if (pending.timer !== undefined) clearTimeout(pending.timer);
      pending.reject(new Error("NIP-46 session closed"));
    }
    this.pending.clear();
    await this.transport.close();
  }

  private async ensureSubscribed(): Promise<void> {
    if (this.subscription) return;
    this.subscription = await this.transport.subscribe(
      { kinds: [NIP46_EVENT_KIND], "#p": [this.clientPubkey], authors: [this.remoteSignerPubkey] },
      (event) => this.handleEvent(event)
    );
  }

  private clearPending(id: string): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    if (pending.timer !== undefined) clearTimeout(pending.timer);
  }

  private async sendRequest(method: string, params: string[], id: string = this.randomId()): Promise<Nip46ResponseMessage> {
    if (this.phaseValue === "session_closed") throw new Error("NIP-46 session is closed");
    const message = JSON.stringify({ id, method, params });
    const event = buildNip46RequestEvent(this.secretKey, this.remoteSignerPubkey, message, this.now());
    const response = new Promise<Nip46ResponseMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`NIP-46 request "${method}" timed out`));
      }, this.requestTimeoutMs);
      (timer as { unref?: () => void }).unref?.();
      this.pending.set(id, { resolve, reject, timer });
    });
    try {
      await this.transport.publish(event);
    } catch (error) {
      this.clearPending(id);
      throw error;
    }
    return response;
  }

  private handleEvent(event: RelayEvent): void {
    let raw: unknown;
    try {
      raw = JSON.parse(decryptNip46Event(this.secretKey, event));
    } catch {
      return; // event we cannot decrypt/verify/parse is not ours — ignore
    }
    const id = typeof raw === "object" && raw !== null ? (raw as { id?: unknown }).id : undefined;
    if (typeof id !== "string") return;
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    if (pending.timer !== undefined) clearTimeout(pending.timer);
    // The event decrypted and correlates to a pending request: surface a
    // malformed-but-correlated response as a rejection instead of a silent hang.
    try {
      pending.resolve(requireResponseMessage(raw));
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
