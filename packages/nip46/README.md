# @nsealr/nip46

Decrypted NIP-46 payload bridge for nSealr companion access surfaces.

## Purpose

- Convert already-decrypted `get_public_key` and `sign_event` payloads into
  nSealr requests or deterministic local responses.
- Parse `connect` messages into review intents and deterministic review pages.
- Parse `bunker://` and `nostrconnect://` connection URIs into descriptor-only
  metadata without echoing shared secrets.
- Parse read-only nSealr policy files used by the CLI and tests.
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

This package does not implement relay sessions, NIP-44 encryption/decryption,
persistent grants, browser extension storage, `connect` acknowledgements, or
signer I/O. Those layers remain blocked on separate policy and session gates.
