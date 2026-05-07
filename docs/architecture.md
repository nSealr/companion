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
- `packages/fixtures`: shared event, key, and trusted-review fixture loading.
- `packages/review`: deterministic event-template review summary generation
  for untrusted companion previews and conformance checks.
- `packages/dev-signer`: test-only signing implementation.
- `packages/transport`: signer transport interface plus in-memory development,
  JSON file, and JSON-lines stdio adapters.
- `packages/qr`: v0 `nseal1:` QR envelope encoding and decoding.
- `packages/framing`: checksum-protected serial line framing draft.
- `packages/smartcard`: APDU codec, simulator adapter, `SmartcardSigner`
  boundary, and response verification for the display-less smartcard line.

## Current CLI Flow

The M2 CLI flow is:

1. Build a request from an unsigned Nostr event template.
2. Produce a development response with an explicit software test key.
3. Verify the response against the original request before any downstream use.

The same commands support JSON files and v0 `nseal1:` QR envelope files so the
desktop companion can drive the Pi Zero vault flow before camera/display
hardware is integrated.

`nseal review-request` can render the same deterministic review JSON from a
JSON or QR `sign_event` request. This is deliberately labeled as an untrusted
preview: it helps users and automated tests see what a conforming signer should
display, but approval authority still belongs to the vault, firmware, or card
line holding the key.

The development signer exists only for local testing. Production signer lines
must replace it with a hardware, vault, or smartcard transport while preserving
the same request/response verification boundary.

## Transport Boundary

Every transport implements a single `exchange(request)` contract. Transport
adapters are responsible for moving JSON request and response envelopes only.
The companion remains responsible for validating request/response shape and
cryptographically verifying successful signed-event responses after transport
completion.

Trusted-review vectors are loaded from `NostrSeal/specs` so host tools and
device implementations can agree on what must be shown before approval. They do
not make the companion trusted; they are conformance data for signer UIs.

The current adapters cover three development paths:

- `DevSignerTransport`: in-memory test signer for deterministic harnesses.
- `JsonFileTransport`: file handoff for QR vault and offline workflow tests.
- `JsonLineStdioTransport`: one-shot process bridge for external signer
  adapters and future hardware simulators.
- `SerialFrameTransport`: one-shot `nseal1f:` request/response exchange for
  USB-serial, UART, and firmware smoke-test adapters.

## Smartcard Boundary

The first smartcard package covers the display-less APDU contract from
`NostrSeal/specs`: `GET_PUBLIC_KEY` and `SIGN_EVENT_ID`. It can protect key
material in a card-like boundary, but trusted event review must still happen
before the companion sends a 32-byte event id to a card.

`SmartcardSigner` models the companion side of that boundary. It retrieves the
card public key, computes the NIP-01 event id from the requested template, asks
the card to sign only that 32-byte id, verifies the returned Schnorr signature,
and emits the standard signed-event response. It refuses to sign unless the
caller supplies an explicit review acknowledgement. That acknowledgement is a
workflow guard for display-less smartcards, not proof that the untrusted host is
a trusted display.

`nseal smartcard-sim-sign` exposes the same flow through a test-only APDU
simulator for integration work. Real PC/SC and NFC transports must implement
the same APDU exchange interface without weakening the review acknowledgement
requirement.

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
