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
- `packages/fixtures`: shared event, key, trusted-review,
  review-display-frame, QR review-transcript, and NIP-46 payload fixture
  loading.
- `packages/review`: deterministic event-template review summary generation
  for untrusted companion previews and conformance checks.
- `packages/dev-signer`: test-only signing implementation.
- `packages/transport`: signer transport interface plus in-memory development,
  JSON file, and JSON-lines stdio adapters.
- `packages/qr`: v0 `nseal1:` QR envelope encoding and decoding.
- `packages/framing`: checksum-protected serial line framing draft.
- `packages/smartcard`: APDU codec, simulator adapter, `SmartcardSigner`
  boundary, and response verification for the display-less smartcard line.
- `packages/nip46`: decrypted NIP-46 payload bridge for `get_public_key`,
  `sign_event`, local `ping`, and conversion from NostrSeal responses back to
  NIP-46 result/error strings. It also validates requested permission strings
  and parses `connect` messages into review intents for later policy work.
  Permission matching is present as a pure boundary; permission storage and
  grant UX remain separate layers.

## Current CLI Flow

The M2 CLI flow is:

1. Build a request from an unsigned Nostr event template.
2. Produce a development response with an explicit software test key.
3. Verify the response against the original request before any downstream use.

The same commands support JSON files and v0 `nseal1:` QR envelope files so the
desktop companion can drive the Raspberry QR vault flow before camera/display
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

Review-display-frame vectors are loaded and shape-checked as bounded rendering
contracts for small trusted screens. The companion treats them as conformance
data for Raspberry and ESP32 adapters, not as host-side approval authority.

QR review-transcript vectors are also loaded and shape-checked by
`nseal fixture verify`. They bind raw QR input to frame/button/decision
sequences for Raspberry and ESP32 adapter tests; the companion treats them as
conformance data, not as trusted approval authority.

NIP-46 payload vectors are loaded and verified by `nseal fixture verify` so the
host bridge and shared specs agree on decrypted `get_public_key`, `sign_event`,
local `ping`, and response mapping behavior before relay and encryption work
begins.

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

## NIP-46 Bridge Boundary

The first NIP-46 module handles only already-decrypted JSON-RPC-like payloads
from NIP-46 kind `24133` content. It does not implement relay subscriptions,
NIP-44 encryption/decryption, connection tokens, permission persistence, or auth
challenge UX.

The bridge maps `get_public_key` and `sign_event` messages into standard
NostrSeal v1 requests so any signer transport can handle them behind the same
verification boundary. `ping` is answered locally with `pong` because it does
not require a key-holding device. Signed-event responses are returned as
NIP-46 result strings containing JSON-stringified Nostr events; public-key
responses return the hex key string; NostrSeal error responses become NIP-46
error strings.

This keeps NIP-46 as a host transport/bridge layer. Trusted event review and
approval remain with the Raspberry, ESP32, smartcard-assisted, or future
hardware-wallet signer boundary.

Permission parsing is intentionally separate from permission grants. The parser
accepts the NIP-46 `method[:params]` string form, validates numeric
`sign_event:<kind>` selectors, and rejects `connect` as a requested permission.
The matching helper derives a required permission from a later request and
checks it against an already-approved permission set. A broad `sign_event`
permission matches every event kind; `sign_event:<kind>` matches only that
kind. Actual grant storage, revocation, auth challenges, and user approval UX
remain future policy layers.

`connect` parsing is also intentionally non-committal. The bridge can extract
the remote-signer pubkey, optional secret, and requested permissions into a
review intent, but it does not return `ack`, echo secrets, persist grants, or
authorize a client. A later policy layer must review and explicitly approve
that intent.

## QR Envelope

The companion follows the shared `NostrSeal/specs` QR v0 format:

```text
nseal1:<base64url-json>
```

The v0 envelope is deliberately uncompressed and single-part. Animated QR,
compression, fountain codes, and large payload chunking remain out of scope
until a Raspberry or ESP32 QR vault flow proves where those features are
necessary.

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
