# @nsealr/core

Core Nostr event helpers for nSealr host software.

## Purpose

- Compute NIP-01 event ids from canonical event serialization.
- Verify BIP-340 Schnorr signatures for signed Nostr events.
- Verify that a signer response matches the original nSealr signing request.

## Boundary

This package never creates, imports, stores, or exports production private keys.
It is safe to use in host-side verification code, browser-provider code, CLI
tools, and tests.

Test-only signing lives in private `@nsealr/dev-signer`, not here.

