# Roadmap

## M2: CLI MVP

- TypeScript pnpm workspace.
- CLI request generation.
- Fixture verification.
- Test-only dev signer.
- Response verification.

Status: implemented as the first companion foundation with JSON and QR envelope
CLI paths. Fixture verification now includes shared review-display-frame,
review-detail-page, QR review-transcript, NIP-46 payload, NIP-46 policy-file,
limit-profile, and invalid hardening vectors in addition to event and
trusted-review vectors. The
shared invalid-vector set now includes strict response-shape rejection for
ambiguous result payloads, error/result mixing, and unknown top-level response
fields. Malformed JSON and unsupported request-method CLI rejection tests are
now covered. `verify-response` now validates the original request before
accepting any response, so malformed request files cannot be certified by
pairing them with a validly shaped response. The request CLI now also emits
validated parameterless device requests for capability discovery, public-key
lookup, and signing-readiness diagnostics, including caller-supplied
`request_id` values for hardware traces. The review CLI can now render
constrained-display detail pages from shared review vectors for untrusted
preview and cross-repo conformance checks, with explicit display-limit
overrides for alternate constrained-screen profiles. Fixture verification also
checks the review detail-page style contract so wrapped tag/author continuation
lines remain distinguishable from new items.

## M3: Transport Layer

- File transport.
- Stdio transport.
- Simulated signer.
- QR envelope package.
- Serial framing draft.
- Serial frame transport adapter.
- Injected serial-line transport boundary for future native USB/WebSerial
  adapters.
- Stream-backed serial-line port adapter for dependency-free hardware adapter
  tests.
- CLI serial-frame wrapping and unwrapping helpers.

Status: file, stdio, in-memory development signer transport, QR envelope,
serial framing, serial-frame transport foundations, and offline CLI
serial-frame helpers are implemented. Transport adapters now validate outbound
request payloads and inbound response payloads at their boundary, including the
development signer, JSON file handoff, JSON-lines stdio, and serial-frame
adapters. Exchange adapters also reject otherwise valid responses whose
`request_id` does not match the outbound request, and they cryptographically
verify successful `sign_event` responses before returning them. Malformed
requests, malformed device responses, invalid signed-event output, or
stale/mismatched responses cannot bypass the standard protocol and verification
gates through these adapters. The JSON-lines stdio adapter now bounds
unterminated response output and captured stderr diagnostics from external
signer processes, and it times out silent signer processes that do not return
a JSON-line response. The injected serial-line boundary can drive a
newline-oriented port while ignoring device log lines and normalizing common
serial line endings. It now also rejects silent ports with a deterministic
response timeout and stalled writes with a deterministic write timeout,
preparing physical USB serial integration without adding a native dependency to
CI. A stream-backed line-port adapter is also in place so future native
USB/WebSerial bindings can be tested through Node streams before opening real
hardware, and that adapter now bounds buffered lines with the shared v0
serial-frame byte limit. Serial-frame encoding now also rejects frames that
would exceed the shared v0 serial-frame byte limit before a CLI or transport
can write an over-limit line. Serial-frame transport surfaces device
`nseal1f:error` payloads as deterministic transport diagnostics instead of
discarding the error code. The offline serial-frame unwrap helper can now take
the original request and reject mismatched captured responses before writing
output. `nseal serial-line exchange` now opens a local newline serial device
path for one validated request/response exchange, skips firmware log lines,
verifies the response before writing output, and closes the stream-backed port.
M3 remains open for larger-payload strategy beyond v0 frame refusal and a
production-grade browser/native USB/WebSerial binding.

## M4: NIP-46 Payload Bridge

- Decrypted JSON-RPC-like content mapping.
- `get_public_key` and `sign_event` request conversion to NostrSeal requests.
- Local `ping` handling.
- NostrSeal response conversion back to NIP-46 result/error strings.
- Requested permission string parsing for future `connect` review.
- `connect` request parsing into explicit policy-review intents.
- Deterministic `connect` review-page rendering without echoing secrets or
  creating grants.
- Request permission matching against explicit in-memory grant inputs.
- Bridge decisions for permitted signer routing, local `ping`, `connect`
  review, and denied permissions.
- CLI decision harness for already-decrypted NIP-46 payloads.
- Read-only policy-file input for the CLI decision harness.

Status: the first decrypted-payload bridge is implemented in `packages/nip46`.
It consumes shared `NostrSeal/specs` NIP-46 payload vectors through unit tests
and `nseal fixture verify`, and it now parses NIP-46 requested permission
strings plus `connect` intents and can match later requests against explicit
permission inputs without granting or persisting them. The `connect` intent
path, deterministic `connect` review pages, and non-`connect` permission
policy checks are now pinned by shared specs vectors. Bridge decisions are also
pinned by shared specs vectors, including permission-denied NIP-46 responses
before a request reaches signer transport. `nseal nip46 decide` exposes those
decisions as a file-backed CLI harness for integration tests. `nseal nip46
review-connect` exposes only the deterministic review pages for a `connect`
message. The decision command can read explicit permissions from the command
line or from a `nseal-nip46-policy-v0` policy file pinned by shared specs
vectors, but neither command creates, updates, approves, or persists grants by
itself. Policy-file parsing is now package-owned in `packages/nip46`, leaving
the CLI as a file/argument adapter. These paths also do not add relay,
encryption, or signer I/O.
Relay sessions, NIP-44 encryption/decryption, connection token responses,
permission storage, grant review, and auth challenge UX remain future work.

## M4.5: Pre-Signing Contract Hardening

- Move NIP-46 policy-file parsing into package-owned logic so CLI commands stay
  thin wrappers.
- Add a central NostrSeal v0 limit profile in protocol code and enforce it in
  signing-request validation.
- Make NIP-46 bridge conversion reuse standard request validation so unsafe
  already-decrypted payloads cannot bypass the signing-request validator.
- Add tests for shared malicious vectors and deterministic rejection before any
  signer transport is contacted or output file is written.
- Add a `nostr-tools` test oracle for NIP-01 canonical event hash/signature
  conformance without coupling production code to that dependency.

Status: implemented for companion-owned boundaries. `packages/protocol`
enforces the shared v0 limits, QR/serial decoders reject malformed or oversized
frames, `packages/nip46` owns policy-file parsing and request conversion, CLI
decision commands fail before writing output, and test-only Nostr conformance
is cross-checked with `nostr-tools`. `NostrSeal/lab` now pins the cross-repo
behavior after Raspberry and ESP32 consumed the applicable vectors. The gate
still blocks full NIP-46 relay sessions, browser extension work, persistent
grants, and production signer I/O.

Status note, 2026-05-10: companion QR tooling now supports `qr-animated`
frame files for larger valid payloads. The implementation consumes the shared
`qr-animated-envelope-v0` vector, rejects missing or tampered frames
deterministically, and lets CLI request/response commands use one frame per
line without adding compression, fountain codes, relay sessions, or signer I/O.

## Later

- Browser bridge.
- Full NIP-46/Nostr Connect relay session integration.
- WebUSB/HID/CDC/WebSerial transports and persistent signer sessions.
- PC/SC smartcard adapter backed by the implemented APDU codec and
  `SmartcardSigner` boundary.

## Smartcard Line

- APDU codec and deterministic simulator: implemented.
- Shared APDU rejection status vectors: implemented for wrong `SIGN_EVENT_ID`
  length, unsupported CLA, and unsupported INS.
- `SmartcardSigner` companion boundary: implemented for `GET_PUBLIC_KEY` plus
  `SIGN_EVENT_ID`, with shared request validation and external-review-only
  acknowledgement before APDU exchange. External `approvalDigest` binding is
  required and checked against shared review-screen vectors before APDU
  exchange.
- CLI simulator path: implemented as `nseal smartcard-sim-sign`, with mandatory
  `--review-acknowledged` and `--approval-digest`.
- PC/SC/contact transport boundary: implemented as a provider-injected APDU
  exchange adapter with setup-error normalization, malformed reader-list
  rejection, APDU transmit-error normalization, transmit-result shape
  rejection, response data-shape rejection, and response byte validation; native
  reader binding and real-card tests are pending.
- NFC/mobile transport: not implemented.
- Production smartcard support: blocked on real card testing and display-less
  review policy hardening.
