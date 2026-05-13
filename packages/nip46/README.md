# @nsealr/nip46

Decrypted NIP-46 payload bridge for nSealr companion access surfaces.

## Purpose

- Convert already-decrypted `get_public_key` and `sign_event` payloads into
  nSealr requests or deterministic local responses.
- Parse `connect` messages into review intents and deterministic review pages.
- Parse read-only nSealr policy files used by the CLI and tests.
- Enforce permission checks before signer routing.

## Boundary

This package does not implement relay sessions, NIP-44 encryption/decryption,
persistent grants, browser extension storage, or signer I/O. Those layers remain
blocked on separate policy and session gates.

