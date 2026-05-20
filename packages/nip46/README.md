# @nsealr/nip46

Decrypted NIP-46 payload bridge for nSealr companion access surfaces.

## Purpose

- Convert already-decrypted `get_public_key` and `sign_event` payloads into
  nSealr requests or deterministic local responses.
- Parse `connect` messages into review intents, deterministic review pages, and
  digest-bound local approval artifacts.
- Parse `bunker://` and `nostrconnect://` connection URIs into descriptor-only
  metadata without echoing shared secrets.
- Parse NIP-46 `kind:24133` relay event envelopes into sender/recipient/content
  metadata without decrypting NIP-44 content or opening relay connections.
- Evaluate metadata-only relay request and response steps after a future
  NIP-44 layer has supplied plaintext, returning deterministic bridge decisions
  or response-shape metadata. Public-key and signed-event response results are
  bound to the relay event sender before later session code can accept them,
  and auth challenge responses expose only safe http(s) URL metadata without
  credentials or fragments for later UI, without relay I/O, signer dispatch,
  grant creation, signature verification, URL opening, or session persistence.
- Render auth challenge URL metadata into deterministic review pages and
  digest-bound approval artifacts without opening the URL, acknowledging
  `connect`, creating grants, opening relays, dispatching signers, storing
  secrets, or persisting session state.
- Parse reviewed-but-not-active NIP-46 session lifecycle checkpoints that bind
  client/signer pubkeys, relays, connect digest, approval time, expiry, and an
  approved permission subset while keeping NIP-44 derivation, `connect`
  acknowledgement, relay I/O, grant creation, signer dispatch, secret storage,
  and session persistence disabled.
- Create the same reviewed-but-not-active checkpoint from a canonical connect
  review, matching connect approval artifact, explicit client pubkey, relay
  list, expiry, and approved permission subset without acknowledging `connect`
  or starting a relay session.
- Evaluate pending-session request gates for `approved_pending_ack` checkpoints,
  binding relay sender/recipient metadata and decrypted request permissions
  while returning deterministic `connect_ack_pending` errors instead of signer
  dispatch.
- Parse read-only nSealr policy files used by the CLI and tests.
- Keep requested-permission parsing separate from approved-permission parsing
  so broad `sign_event` can be reviewed as metadata but cannot authorize a
  signer route.
- Enforce permission checks before signer routing.

## Example

```ts nsealr-readme-example
import assert from "node:assert/strict";
import { decideNip46BridgeAction } from "@nsealr/nip46";

const eventTemplate = {
  created_at: 1_710_000_000,
  kind: 1,
  tags: [],
  content: "NIP-46 bridge input"
};
const decision = decideNip46BridgeAction({
  id: "readme-nip46",
  method: "sign_event",
  params: [JSON.stringify(eventTemplate)]
}, [{
  method: "sign_event",
  parameter: "1",
  event_kind: 1
}]);

assert.equal(decision.type, "signer_request");
```

## Boundary

Connection URI parsing is intentionally non-committal: it validates official
NIP-46 token shape, relays, client metadata, and requested permissions, but it
returns only `secret_present` instead of the secret value.

Connect approval is also non-committal. The approval artifact proves that a
specific connect review digest was manually confirmed, but it still records
`acknowledges_connect: false`, `creates_grants: false`, `opens_relay: false`,
and `persists_session_state: false`.

Relay event envelope parsing is also non-committal. It validates the event kind,
sender pubkey, exactly one recipient `p` tag, opaque encrypted content, and
optional signed-event field shapes. It does not verify signatures, decrypt
NIP-44 content, open relays, persist grants, acknowledge `connect`, or reach
signer I/O. Those layers remain blocked on separate policy and session gates.

Relay step evaluation starts from an envelope and an already decrypted message.
Request steps reuse the same request validation, permission checks, and bridge
decision logic as local decrypted payload handling. Response steps shape-check
NIP-46 response messages and signed-event result payloads, and bind
public-key/signed-event result pubkeys to the relay event sender. Auth
challenge responses are accepted only as `result: "auth_url"` plus a safe
http(s) URL without credentials or fragments in `error`; the package returns
that URL as metadata and does not open it. Relay steps still do not decrypt
NIP-44 content, open relays, acknowledge `connect`, create grants, dispatch a
signer, verify signatures, or persist session state.

Auth challenge review is the next manual boundary after response-step
normalization. The package renders the remote signer pubkey, client pubkey, and
auth URL into deterministic pages, computes `auth_challenge_digest`, and writes
approval artifacts only when that digest is supplied back. The approval still
records no URL opening, relay I/O, `connect` acknowledgement, grant creation,
signer dispatch, secret storage, or session persistence.

Session lifecycle parsing is a checkpoint contract, not a session engine. It
accepts only the `approved_pending_ack` phase and rejects embedded secret
material, NIP-44 key derivation, relay opening, `connect` acknowledgement,
grant creation, signer dispatch, production secret storage, or persisted
session state. Checkpoint creation validates the review/approval digest pair
and approved-permission subset before returning the same secretless object.

Session request gate evaluation is still non-enabling. It checks that the relay
event sender matches the reviewed client pubkey, that the recipient `p` tag
matches the remote-signer pubkey, that the session has not expired, and that the
decrypted request has a valid permission requirement. The result is a
`connect_ack_pending` NIP-46 error with no session-permission use, relay I/O,
grant creation, signer dispatch, or persistence.
