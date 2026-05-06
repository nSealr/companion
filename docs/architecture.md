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

## Planned Modules

- `apps/cli`: command-line entrypoint.
- `packages/core`: NIP-01 event id and BIP-340 verification.
- `packages/protocol`: schema validation and typed request/response models.
- `packages/fixtures`: shared fixture loading.
- `packages/dev-signer`: test-only signing implementation.

