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
  or response-shape metadata without relay I/O, signer dispatch, grant
  creation, signature verification, or session persistence.
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
NIP-46 response messages and signed-event result payloads. They still do not
decrypt NIP-44 content, open relays, acknowledge `connect`, create grants,
dispatch a signer, verify signatures, or persist session state.
