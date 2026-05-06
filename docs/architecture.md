# Architecture

`NostrSeal/companion` is the untrusted host-side software shared by all signer
lines.

## Responsibilities

- Construct signing requests from Nostr event templates.
- Move requests over selected transports.
- Verify signer responses against `NostrSeal/specs`.
- Provide CLI and automated harnesses before browser or GUI workflows.
- Reject mismatched event ids, pubkeys, signatures, and request ids.

## Trust Boundary

The companion must not be trusted with production private keys. A development
signer may exist only as an explicit test harness.

## Implemented Modules

- `apps/cli`: command-line entrypoint.
- `packages/core`: NIP-01 event id and BIP-340 verification.
- `packages/protocol`: schema validation and typed request/response models.
- `packages/fixtures`: shared fixture loading.
- `packages/dev-signer`: test-only signing implementation.

## Current CLI Flow

The M2 CLI flow is:

1. Build a request from an unsigned Nostr event template.
2. Produce a development response with an explicit software test key.
3. Verify the response against the original request before any downstream use.

The development signer exists only for local testing. Production signer lines
must replace it with a hardware, vault, or smartcard transport while preserving
the same request/response verification boundary.
