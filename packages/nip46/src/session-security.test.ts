import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { useWebSocketImplementation } from "nostr-tools/pool";
import { evaluateNip46RelayResponseStep } from "./nip46.js";
import { Nip46SessionManager } from "./session-manager.js";
import { buildNip46RequestEvent, decryptNip46Event } from "./session-protocol.js";
import { NostrToolsRelay } from "./relay-pool-adapter.js";
import type { RelayEvent, RelayEventHandler, RelayTransport } from "./relay-transport.js";

// Public fixture scalars, never production material. The expected public keys
// and signed event oracle come from nostr-tools, independently of the manager.
const key = (n: number): Uint8Array => Uint8Array.from({ length: 32 }, (_, i) => i === 31 ? n : 0);
const client = key(1), remote = key(2), user = key(3), foreign = key(4);
const remotePubkey = getPublicKey(remote), userPubkey = getPublicKey(user);
const template = { created_at: 1700000000, kind: 1, tags: [] as string[][], content: "S01 public fixture" };
type Message = { id: string; method: string; params: string[] };
const sessions: Nip46SessionManager[] = [];
afterEach(async () => { await Promise.all(sessions.splice(0).map(s => s.close())); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function harness(reply?: (message: Message, deliver: (text: string, author?: Uint8Array) => void) => void,
  options: Partial<ConstructorParameters<typeof Nip46SessionManager>[0]> = {}) {
  let handler: RelayEventHandler = () => undefined;
  const messages: Message[] = [];
  const subscriptions: Array<{ closed: boolean }> = [];
  const deliver = (text: string, author = remote) => handler(buildNip46RequestEvent(author, getPublicKey(client), text, 1700000000));
  const transport: RelayTransport = {
    async subscribe(_filter, onEvent) { handler = onEvent; const sub = { closed: false }; subscriptions.push(sub); return { close: () => { sub.closed = true; } }; },
    async publish(event) {
      const message = JSON.parse(decryptNip46Event(remote, event)) as Message;
      messages.push(message);
      if (reply) reply(message, deliver);
      else deliver(JSON.stringify({ id: message.id, result: message.method === "get_public_key" ? userPubkey : message.method === "sign_event" ? JSON.stringify(finalizeEvent(JSON.parse(message.params[0]), user)) : "ack" }));
    },
    async close() {}
  };
  const session = new Nip46SessionManager({ clientSecretKey: client, remoteSignerPubkey: remotePubkey, transport, requestTimeoutMs: 50, ...options });
  sessions.push(session);
  return { session, transport, messages, subscriptions, deliver };
}

function ordinaryReply(message: Message, deliver: (text: string, author?: Uint8Array) => void) {
  deliver(JSON.stringify({ id: message.id, result: message.method === "get_public_key" ? userPubkey : message.method === "sign_event" ? JSON.stringify(finalizeEvent(JSON.parse(message.params[0]), user)) : "ack" }));
}

describe("S01 authenticated session boundary", () => {
  it("discovers the user separately from transport before activation", async () => {
    const { session, messages } = harness();
    await session.connect();
    expect(messages.map(m => m.method)).toEqual(["connect", "get_public_key"]);
    expect((session as unknown as { userPubkey?: string }).userPubkey).toBe(userPubkey);
    expect((await session.signEvent(template)).pubkey).toBe(userPubkey);
    expect(userPubkey).not.toBe(remotePubkey);
  });

  it("rejects a changed user key with a valid event signature", async () => {
    let selected = user;
    const { session } = harness((message, deliver) => {
      if (message.method !== "sign_event") return ordinaryReply(message, deliver);
      deliver(JSON.stringify({ id: message.id, result: JSON.stringify(finalizeEvent(JSON.parse(message.params[0]), selected)) }));
    });
    await session.connect();
    expect((await session.signEvent(template)).pubkey).toBe(userPubkey);
    selected = foreign;
    await expect(session.signEvent(template)).rejects.toThrow(/user|identity|pubkey/i);
  });

  it("ignores foreign signed transport authors delivered past adapter filters", async () => {
    const { session } = harness((message, deliver) => {
      if (message.method !== "sign_event") return ordinaryReply(message, deliver);
      deliver(JSON.stringify({ id: message.id, result: JSON.stringify(finalizeEvent(JSON.parse(message.params[0]), user)) }), foreign);
      deliver(JSON.stringify({ id: message.id, error: "expected author control" }));
    });
    await session.connect();
    await expect(session.signEvent(template)).rejects.toThrow("expected author control");
  });

  it.each(["duplicate", "escaped duplicate", "trailing"])("rejects %s wire JSON without consuming the request", async (variant) => {
    const { session } = harness((message, deliver) => {
      if (message.method !== "sign_event") return ordinaryReply(message, deliver);
      const result = JSON.stringify(JSON.stringify(finalizeEvent(JSON.parse(message.params[0]), user)));
      const extra = variant === "escaped duplicate" ? '"\\u0069d"' : '"id"';
      deliver(variant === "trailing" ? JSON.stringify({ id: message.id, result: JSON.parse(result) }) + "{}" : `{${extra}:"ignored","id":${JSON.stringify(message.id)},"result":${result}}`);
      deliver(JSON.stringify({ id: message.id, error: "strict parse control" }));
    });
    await session.connect();
    await expect(session.signEvent(template)).rejects.toThrow("strict parse control");
  });

  it("rejects nested signed-event duplicate members", async () => {
    const { session } = harness((message, deliver) => {
      if (message.method !== "sign_event") return ordinaryReply(message, deliver);
      const event = JSON.stringify(finalizeEvent(JSON.parse(message.params[0]), user));
      deliver(JSON.stringify({ id: message.id, result: '{"pubkey":"ignored",' + event.slice(1) }));
    });
    await session.connect();
    await expect(session.signEvent(template)).rejects.toThrow(/duplicate|JSON/i);
  });

  it("cannot reactivate after close races a response", async () => {
    const { session, transport } = harness();
    const original = transport.publish;
    transport.publish = async event => { await original(event); await session.close(); };
    await expect(session.connect()).rejects.toThrow(/clos/i);
    expect(session.phase).toBe("session_closed");
  });

  it("does not reuse IDs when the caller RNG repeats", async () => {
    const { session, messages } = harness(undefined, { randomId: () => "repeat" });
    await session.connect();
    await session.signEvent(template);
    await session.signEvent(template);
    expect(new Set(messages.map(m => m.id)).size).toBe(messages.length);
  });
});

describe("S01 default adapter control", () => {
  it("locked SimplePool filters foreign authors even if the relay sends them", async () => {
    let socket: FakeSocket | undefined;
    const sent: string[] = [];
    class FakeSocket {
      readyState = 1;
      onopen?: () => void;
      onclose?: (event: { message: string }) => void;
      onmessage?: (event: { data: string }) => void;
      constructor() { socket = this; queueMicrotask(() => this.onopen?.()); }
      send(data: string) { sent.push(data); }
      close() { this.readyState = 3; this.onclose?.({ message: "closed" }); }
    }
    useWebSocketImplementation(FakeSocket);
    const adapter = new NostrToolsRelay(["wss://s01.invalid"]);
    const received: RelayEvent[] = [];
    const sub = await adapter.subscribe({ kinds: [24133], authors: [remotePubkey] }, e => received.push(e));
    try {
      await vi.waitFor(() => expect(sent.some(s => JSON.parse(s)[0] === "REQ")).toBe(true));
      const id = JSON.parse(sent.find(s => JSON.parse(s)[0] === "REQ")!)[1];
      const bad = buildNip46RequestEvent(foreign, getPublicKey(client), '{"id":"probe","result":"ack"}', 1700000000);
      const good = buildNip46RequestEvent(remote, getPublicKey(client), '{"id":"probe","result":"ack"}', 1700000000);
      socket!.onmessage!({ data: JSON.stringify(["EVENT", id, bad]) });
      socket!.onmessage!({ data: JSON.stringify(["EVENT", id, good]) });
      expect(received.map(e => e.pubkey)).toEqual([remotePubkey]);
    } finally { sub.close(); await adapter.close(); useWebSocketImplementation(WebSocket); }
  });
});


describe("S01 distinct metadata identities and envelope", () => {
  it("permits a signed user result distinct from transport author", () => {
    const result = JSON.stringify(finalizeEvent(template, user));
    const step = { direction: "remote_signer_to_client", event: buildNip46RequestEvent(remote, getPublicKey(client), "opaque", 1700000000), decrypted_message: { id: "metadata", result }, expected_user_pubkey: userPubkey };
    expect(evaluateNip46RelayResponseStep(step)).toMatchObject({ format: "nsealr-nip46-relay-response-step-v1", result_pubkey: userPubkey, result_pubkey_bound_to_expected_user: true });
  });
  it("rejects signed ambiguous recipient tags", () => {
    const original = buildNip46RequestEvent(remote, getPublicKey(client), "hello", 1700000000);
    const event = finalizeEvent({ ...original, tags: [...original.tags, ["p", getPublicKey(foreign)]] }, remote);
    expect(() => decryptNip46Event(client, event)).toThrow(/recipient|address/i);
  });
});
