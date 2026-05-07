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
- `packages/transport`: signer transport interface plus in-memory development,
  JSON file, and JSON-lines stdio adapters.
- `packages/qr`: v0 `nseal1:` QR envelope encoding and decoding.
- `packages/framing`: checksum-protected serial line framing draft.
- `packages/smartcard`: APDU codec, simulator adapter, and response
  verification for the display-less smartcard line.

## Current CLI Flow

The M2 CLI flow is:

1. Build a request from an unsigned Nostr event template.
2. Produce a development response with an explicit software test key.
3. Verify the response against the original request before any downstream use.

The same commands support JSON files and v0 `nseal1:` QR envelope files so the
desktop companion can drive the Pi Zero vault flow before camera/display
hardware is integrated.

The development signer exists only for local testing. Production signer lines
must replace it with a hardware, vault, or smartcard transport while preserving
the same request/response verification boundary.

## Transport Boundary

Every transport implements a single `exchange(request)` contract. Transport
adapters are responsible for moving JSON request and response envelopes only.
The companion remains responsible for validating request/response shape and
cryptographically verifying successful signed-event responses after transport
completion.

The current adapters cover three development paths:

- `DevSignerTransport`: in-memory test signer for deterministic harnesses.
- `JsonFileTransport`: file handoff for QR vault and offline workflow tests.
- `JsonLineStdioTransport`: one-shot process bridge for external signer
  adapters and future hardware simulators.

## Smartcard Boundary

The first smartcard package covers the display-less APDU contract from
`NostrSeal/specs`: `GET_PUBLIC_KEY` and `SIGN_EVENT_ID`. It can protect key
material in a card-like boundary, but trusted event review must still happen
before the companion sends a 32-byte event id to a card.

## QR Envelope

The companion follows the shared `NostrSeal/specs` QR v0 format:

```text
nseal1:<base64url-json>
```

The v0 envelope is deliberately uncompressed and single-part. Animated QR,
compression, fountain codes, and large payload chunking remain out of scope
until the Pi Zero vault flow proves where those features are necessary.

## Serial Frame Draft

The initial serial frame is one newline-terminated ASCII line:

```text
nseal1f:<type>:<base64url-json>:<checksum>\n
```

Supported frame types are `request`, `response`, and `error`. The checksum is
the first 16 lowercase hexadecimal characters of SHA-256 over
`<type>:<base64url-json>`. This is not an authentication mechanism; it only
catches accidental framing and transport corruption before the companion applies
schema and signature verification.
