# NostrSeal Companion

Host-side software for NostrSeal signers.

The companion is not trusted with private keys. It constructs requests, moves
them over the selected transport, verifies device responses, and bridges Nostr
clients to hardware-backed signing.

## Current Capabilities

- `nseal fixture verify` validates shared signing, trusted-review,
  review-display-frame, review-detail-page, QR review-transcript, NIP-46
  payload, and NIP-46 policy-file fixtures from `NostrSeal/specs`, including
  NIP-46 permission policy checks, bridge decisions, implementation limits, and
  invalid hardening vectors.
- `nseal request` creates signing requests from event templates and
  parameterless device requests for `get_capabilities`, `get_public_key`, and
  `get_signing_status`, with caller-supplied `--request-id` support for
  hardware traces.
- `nseal dev-sign` signs requests with an explicit test-only software key.
- `nseal review-request` renders deterministic review JSON, digest-bound
  screen-review pages, or complete constrained-display detail pages from a
  signing request for untrusted host-side previews and test harnesses.
- `nseal smartcard-sim-sign` exercises the smartcard APDU signing boundary with
  a test-only simulator and requires `--review-acknowledged` before sending the
  event id to the display-less signer.
- `packages/smartcard` includes fake-reader PC/SC boundary tests that normalize
  malformed reader-list, setup, and APDU transmit failures without claiming
  real-card support.
- `nseal verify-response` checks request ids, event template integrity, NIP-01
  event ids, and BIP-340 Schnorr signatures.
- Transport exchanges now apply the same successful `sign_event` verification
  before returning a signed event response, so serial/file/stdio adapters cannot
  hand invalid signatures to higher layers as accepted output.
- CLI request, dev-sign, and verify-response commands can read/write JSON or
  v0 `nseal1:` QR envelopes.
- `packages/transport` provides the first signer transport contract plus
  development, file, JSON-lines stdio, and serial-frame adapters. The stdio
  adapter bounds response-line output and captured stderr before accepting or
  reporting external signer process results, and times out silent processes
  that do not emit a response.
- The serial-line transport boundary can drive an injected newline-oriented
  port, normalize common serial line endings, ignore device log lines, and
  reuse the same serial-frame validation before a native USB/WebSerial binding
  exists.
- `SerialLineStreamPort` adapts Node readable/writable streams into that
  newline-oriented port interface for dependency-free serial integration tests,
  while enforcing the shared v0 serial-frame byte limit on buffered lines.
- `exchangeSerialLineRequest` owns one-shot serial-line validation/open/close
  sequencing inside `packages/transport`, so CLI and future native bindings do
  not duplicate the safety boundary.
- `nseal serial-frame` exposes offline serial-frame request wrapping and
  response unwrapping helpers for ESP32 bring-up and lab captures. Response
  unwrapping can verify the original request before writing output, so
  captured frames cannot silently drift across request ids.
- `nseal serial-line exchange` is the CLI wrapper for that package-owned
  one-shot exchange. It opens a newline serial device path only after request
  validation, verifies the response before writing output, skips firmware log
  lines, and closes the stream-backed port after the exchange. It is a local
  USB-serial bring-up helper, not a browser/WebUSB or persistent signer
  session.
- `nseal nip46 decide` writes the bridge decision for an already-decrypted
  NIP-46 payload using explicit permission inputs or a read-only policy file.
  It does not open relays, decrypt NIP-44 payloads, persist grants, or contact
  signer transports.
- `nseal nip46 review-connect` writes deterministic review pages for an
  already-decrypted NIP-46 `connect` request. It shows the remote signer
  pubkey, whether a secret was provided, and requested permissions without
  echoing the secret value or approving the client.
- `packages/qr` implements the v0 `nseal1:` QR envelope from
  `NostrSeal/specs`, including malformed/padded/invalid-UTF-8/oversized
  rejection. Encoding applies the same static decoded-JSON byte limit as
  decoding, so the companion does not emit QR payloads that v0 receivers would
  immediately reject. It also implements the v0 `nseal1a:` animated QR frame
  set for larger valid payloads, with digest, frame checksum, ordering, and
  frame-count checks before JSON parsing.
- `packages/framing` implements the first checksum-protected serial line frame
  draft for USB CDC and UART experiments, including shared frame-size limits on
  both decode and encode.
- `packages/protocol` validates request/response shape, centralizes the
  companion copy of the shared v0 implementation limits, and validates
  capability discovery and signing-status responses, including rejection of
  contradictory `signing_enabled: true` diagnostics that still report missing
  gates, disabled diagnostics that omit missing-gate reasons, and duplicated
  gate entries.
- `packages/review` mirrors the shared trusted-review vector semantics for
  companion previews. It is not a trusted approval surface.
- Serial transport tests cover both capability discovery and explicit
  signing-disabled scaffold responses.
- `packages/fixtures` loads shared event, trusted-review, review-display-frame,
  review-detail-page, QR review-transcript, NIP-46 payload, NIP-46 policy-file,
  and smartcard vectors from `NostrSeal/specs` for companion, Raspberry QR
  vault, ESP32 firmware, and smartcard conformance tests.
- `packages/smartcard` implements the first APDU codec, simulator adapter,
  provider-based PC/SC APDU transport boundary, and `SmartcardSigner` boundary
  against shared smartcard vectors, including APDU rejection status words. The
  PC/SC boundary validates transmit-result shape, response status bytes,
  response data shape, and response data bytes before constructing response
  APDUs, and rejects malformed reader-provider
  output before reader connection.
- `packages/nip46` implements the first decrypted NIP-46 payload bridge for
  `get_public_key`, `sign_event`, local `ping`, and NostrSeal response mapping.
  It also parses `connect` requests into policy-review intents and deterministic
  review pages, validates requested permission strings, and owns the read-only
  policy-file parser used by the CLI. Shared specs vectors now pin the derived
  permission requirements, positive/negative permission checks, bridge
  decisions, `connect` review pages, and invalid payload rejection for signer
  routing, local response routing, `connect` review, and permission-denied
  responses. Relay transport, NIP-44 encryption, persistent permission grants,
  and auth flows remain future work.

## Planned Capabilities

- Browser extension / NIP-07 bridge.
- Full NIP-46 / Nostr Connect relay session handling with NIP-44 encryption,
  permissions, and auth challenges.
- QR encoder and decoder for vault flows.
- WebUSB, HID, CDC, WebSerial, and persistent transport experiments.
- PC/SC and NFC smartcard adapter.
- TROPIC01 USB DevKit research adapter for the custom persistent-secret
  hardware-wallet family.
- Relay publish and response verification tools.

## Initial Layout

- `apps/`: CLI, browser extension, and developer tools.
- `packages/`: reusable core/protocol/transport modules.
- `docs/`: implementation notes and usage guides.

## Quality Baseline

Run the repository verification loop with:

```sh
make ci
```

The Makefile pins `pnpm@10.33.4`; it uses a global `pnpm` when available and
falls back to `npm exec` when only Node/npm is installed.

Run the CLI from the workspace with:

```sh
pnpm nseal --help
pnpm nseal fixture verify --specs ../specs
pnpm nseal request get-signing-status --request-id req-status-1 --out status-request.json
pnpm nseal request sign-event --event-template template.json --out request.qr --output-format qr
pnpm nseal review-request --request request.qr --request-format qr --out review.json
pnpm nseal review-request --request request.qr --request-format qr --detail-pages --max-compact-line-chars 48 --out review-detail-pages.json
pnpm nseal nip46 decide --message nip46-message.json --permissions sign_event:1 --out decision.json
pnpm nseal nip46 decide --message nip46-message.json --policy-file policy.json --out decision.json
pnpm nseal nip46 review-connect --message nip46-connect.json --out connect-review.json
pnpm nseal smartcard-sim-sign --secret-key <test-only-hex> --request request.qr --request-format qr --review-acknowledged --approval-digest <approval-digest-hex> --out response.qr --output-format qr
```

## License

Companion software and tooling are released under the MIT License unless a file
says otherwise. Documentation content is intended to be reusable under the
NostrSeal documentation policy.
