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

Before any production signer I/O, browser extension, full NIP-46 relay session,
or persistent grant layer is added, companion code must pass the M4.5
pre-signing hardening gate. Signing-request validation, NIP-46 bridge
conversion, QR/serial decoding, and policy-file parsing must share explicit
NostrSeal v0 limits and deterministic rejection behavior. CLI commands should
only adapt file/argument I/O around package-owned validation logic.

## Implemented Modules

- `apps/cli`: command-line entrypoint.
- `packages/core`: NIP-01 event id and BIP-340 verification.
- `packages/protocol`: schema validation, typed request/response models, and
  the central NostrSeal v0 implementation limit profile used by companion
  parsers.
- `packages/fixtures`: shared event, key, trusted-review,
  review-display-frame, review-detail-page, QR review-transcript, NIP-46
  payload, NIP-46 policy-file, limit-profile, and invalid hardening fixture
  loading.
- `packages/review`: deterministic event-template review summary generation
  for untrusted companion previews and conformance checks.
- `packages/dev-signer`: test-only signing implementation.
- `packages/transport`: signer transport interface plus in-memory development,
  JSON file, and JSON-lines stdio adapters.
- `packages/qr`: v0 `nseal1:` QR envelope encoding and decoding.
- `packages/framing`: checksum-protected serial line framing draft with the
  shared v0 serial-frame byte limit.
- `packages/smartcard`: APDU codec, simulator adapter, provider-based PC/SC
  APDU transport boundary, `SmartcardSigner` boundary, and response
  verification for the display-less smartcard line.
- `packages/nip46`: decrypted NIP-46 payload bridge for `get_public_key`,
  `sign_event`, local `ping`, and conversion from NostrSeal responses back to
  NIP-46 result/error strings. It also validates requested permission strings
  and policy files, and parses `connect` messages into review intents and
  deterministic review pages for later policy work.
  Permission matching is present as a pure boundary and is pinned by shared
  permission policy fixture checks. Bridge decision output is also present: a
  permitted request can become a signer request, `ping` can produce a local
  response, `connect` can produce a review intent, and missing permissions
  produce deterministic NIP-46 errors before signer transport. Permission
  storage and grant UX remain separate layers.

## Current CLI Flow

The M2 CLI flow is:

1. Build a request from an unsigned Nostr event template.
2. Produce a development response with an explicit software test key.
3. Verify the response against the original request before any downstream use.

The same commands support JSON files and v0 `nseal1:` QR envelope files so the
desktop companion can drive the Raspberry QR vault flow before camera/display
hardware is integrated.

`nseal review-request` can render the same deterministic review JSON from a
JSON or QR `sign_event` request. With `--screen-review` it emits the
digest-bound screen-page model; with `--detail-pages` it emits the complete
constrained-display detail-page model used by Raspberry and ESP32 review UI
tests. Detail-page rendering defaults to the T-Display S3 sized profile and
accepts explicit title/body/compact line limits so lab and device adapters can
compare the same display envelope. These modes are deliberately labeled as
untrusted previews: they help users and automated tests see what a conforming
signer should display, but approval authority still belongs to the vault,
firmware, or card line holding the key.

The development signer exists only for local testing. Production signer lines
must replace it with a hardware, vault, or smartcard transport while preserving
the same request/response verification boundary.

## Transport Boundary

Every transport implements a single `exchange(request)` contract. Transport
adapters are responsible for moving JSON request and response envelopes only.
The companion remains responsible for validating request/response shape and
cryptographically verifying successful signed-event responses after transport
completion.

The shared transport boundary now enforces that verification before returning
from `exchange`: request shape is checked before sending, response shape and
`request_id` are checked after receiving, and successful `sign_event` responses
must pass NIP-01 event-id and BIP-340 signature verification against the
original request. Error responses such as `signing_disabled` can still return
as valid refusals.

Trusted-review vectors are loaded from `NostrSeal/specs` so host tools and
device implementations can agree on what must be shown before approval. They do
not make the companion trusted; they are conformance data for signer UIs.

Review-display-frame vectors are loaded and shape-checked as bounded rendering
contracts for small trusted screens. The companion treats them as conformance
data for Raspberry and ESP32 adapters, not as host-side approval authority.

Review-detail-page vectors are also loaded and shape-checked as complete
physical review-page contracts for constrained signer displays. They preserve
the shared `approval_digest` but pin scroll windows, line styles, continuation
indentation, and explicit codepoint fallback separately from the digest-bound
`screen-pages` model. The companion can render these pages for previews and
cross-repo comparison, but still treats them as conformance data, not as a
trusted approval surface.

QR review-transcript vectors are also loaded and shape-checked by
`nseal fixture verify`. They bind raw QR input to frame/button/decision
sequences for Raspberry and ESP32 adapter tests; the companion treats them as
conformance data, not as trusted approval authority.

NIP-46 payload vectors are loaded and verified by `nseal fixture verify` so the
host bridge and shared specs agree on decrypted `get_public_key`, `sign_event`,
local `ping`, response mapping, and permission policy behavior before relay and
encryption work begins.

NIP-46 policy-file vectors are loaded and verified by `nseal fixture verify` so
explicit approved-permission inputs stay normalized across specs, companion,
and lab integration. Package code owns the parser; the CLI only reads files and
passes parsed policies into bridge decisions. They are read-only conformance
files, not a grant store.

Pre-signing hardening vectors are the companion's rejection oracle for unsafe
input. They must be evaluated before signer transport, dev signing,
smartcard-sim signing, or NIP-46 routing can proceed, and failures must not
write output artifacts.

The current adapters cover three development paths:

- `DevSignerTransport`: in-memory test signer for deterministic harnesses.
- `JsonFileTransport`: file handoff for QR vault and offline workflow tests.
- `JsonLineStdioTransport`: one-shot process bridge for external signer
  adapters and future hardware simulators. It bounds the pre-newline response
  buffer and captured stderr before returning or reporting process output, and
  terminates silent signer processes after a bounded response timeout.
- `SerialFrameTransport`: one-shot `nseal1f:` request/response exchange for
  USB-serial, UART, and firmware smoke-test adapters. It treats
  `nseal1f:error` as a transport diagnostic and includes the device error code
  in the thrown error instead of returning it as a signer response.
- `SerialLineTransport`: newline-oriented serial transport boundary with an
  injected port. It writes a validated `nseal1f:` request frame, skips
  non-protocol device log lines, normalizes `LF`/`CRLF` line endings, rejects
  stalled writes and silent ports with deterministic timeouts, then returns
  through the same response shape, request-id, and signed-output verification
  gate as `SerialFrameTransport`.
- `SerialLineStreamPort`: dependency-free Node stream adapter for the
  serial-line boundary. It buffers chunked readable-stream output into complete
  lines, rejects any buffered line that exceeds the shared v0 serial-frame byte
  limit, writes newline-terminated request frames to a writable stream, and can
  close its underlying streams after failed exchanges.
- `exchangeSerialLineRequest`: package-owned one-shot serial-line exchange
  helper. It validates the request before opening a port, delegates exchange to
  `SerialLineTransport`, and closes the opened port in a `finally` block. CLI
  and future native bindings should use this boundary instead of duplicating
  validation/open/close sequencing.
- `nseal serial-frame wrap-request` and `nseal serial-frame unwrap-response`:
  offline CLI helpers for producing validated serial request frames and
  decoding validated serial response frames during ESP32 bring-up. With
  `--request`, response unwrapping also verifies the original request id and
  signed-output binding before writing output. These commands do not open a
  physical USB, CDC, HID, WebUSB, or WebSerial connection.
- `nseal serial-line exchange`: one-shot local USB-serial CLI helper over
  `exchangeSerialLineRequest`. It opens a newline-oriented device path only
  after request validation, writes the chosen output format only after response
  verification, and is not a browser transport, relay session, persistent
  signer connection, or permission grant mechanism.
- `nseal request get-capabilities`, `nseal request get-public-key`, and
  `nseal request get-signing-status`: host-side generators for non-sensitive
  parameterless device requests. They validate caller-supplied request ids
  before writing output and are useful for serial-frame hardware captures
  without involving signing.

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
a trusted display. The display-less signer boundary therefore accepts only
`external-review` acknowledgement; any future trusted-display smartcard product
must be modeled as a separate trusted-review surface. External
`approvalDigest` input is mandatory, and the signer recomputes the shared
screen-review digest and rejects missing or mismatched values before APDU
exchange. It also reuses the shared request validator before APDU exchange, so
package callers cannot bypass CLI validation with host-supplied `id`, `pubkey`,
`sig`, malformed tags, oversized content, or other unsafe `sign_event` shapes.

`nseal review-request --screen-review` renders the same deterministic screen
pages and `approval_digest` used by the shared vectors. `nseal
smartcard-sim-sign` exposes the APDU flow through a test-only simulator and
requires `--approval-digest` whenever `--review-acknowledged` is used. Real
PC/SC and NFC transports must implement the same APDU exchange interface
without weakening the review acknowledgement requirement.

The PC/SC boundary is provider-based: tests can inject fake readers and future
desktop adapters can inject a real PC/SC provider without making a native card
driver a required companion dependency. It normalizes provider enumeration
failures, malformed reader-list results, and reader connection failures into
`PcscUnavailableError` before any APDU exchange, and normalizes APDU transmit
failures into the same error family after a connection is opened. It also
validates transmit-result shape, response status bytes, response data shape, and
numeric response data bytes before constructing response APDUs, so a malformed
provider response cannot be silently truncated or surfaced as a generic runtime
type error. It is not a real-card compatibility claim.

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
kind. Shared specs fixtures now include the derived requirement and
positive/negative permission checks for conformance. The bridge decision helper
uses the same matching result to produce signer routing, local `ping`, `connect`
review, or permission-denied responses. Actual grant storage, revocation, auth
challenges, and user approval UX remain future policy layers.

`nseal nip46 decide` exposes that boundary as a file-backed test harness for
already-decrypted payloads. It writes the same deterministic decision JSON used
by shared vectors. The command accepts either an explicit permission string or
a read-only `nseal-nip46-policy-v0` policy file pinned by shared specs
vectors. It does not create or update policy files, open relay sessions,
decrypt NIP-44 payloads, persist grants, or contact signer transports.

`nseal nip46 review-connect` exposes only the review projection for an
already-decrypted `connect` request. It writes deterministic pages with the
remote signer pubkey, secret presence, and requested permission labels. It does
not echo the secret value, return `ack`, persist a grant, or authorize the
client.

`connect` parsing is also intentionally non-committal. The bridge can extract
the remote-signer pubkey, optional secret, and requested permissions into a
review intent and deterministic review pages, but it does not return `ack`,
echo secrets, persist grants, or authorize a client. A later policy layer must
review and explicitly approve that intent. The same boundary is now covered by
a shared `NostrSeal/specs` NIP-46 vector and `nseal fixture verify`.

## QR Envelope

The companion follows the shared `NostrSeal/specs` QR v0 format:

```text
nseal1:<base64url-json>
nseal1a:<payload-sha256-hex>:<index>/<total>:<base64url-json-chunk>:<frame-checksum-hex16>
```

The static v0 envelope is deliberately uncompressed and single-part. The
animated v0 frame set keeps the same uncompressed JSON payload but splits the
base64url text across bounded `nseal1a:` frames. Each frame carries the full
decoded JSON SHA-256 digest, a one-based index/total pair, and a short frame
checksum so receivers can reject missing, duplicated, reordered, or tampered
frames before parsing JSON. Compression and fountain codes remain out of scope.
The decoder enforces the shared static QR decoded JSON byte limit and rejects
padded base64url, invalid UTF-8, malformed JSON, and malformed prefixes before
any review or signing flow can consume the payload.
Animated decoding enforces separate decoded-JSON, frame-payload, and frame-count
limits from `NostrSeal/specs`, then still relies on request/response validation
to decide whether the reassembled payload is acceptable for the caller.

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
The decoder enforces the shared complete-frame byte limit and rejects malformed
payloads before JSON parsing.
