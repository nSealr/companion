# NostrSeal Companion

Host-side software for NostrSeal signers.

The companion is not trusted with private keys. It constructs requests, moves
them over the selected transport, verifies device responses, and bridges Nostr
clients to hardware-backed signing.

## Current Capabilities

- `nseal fixture verify` validates shared signing, trusted-review,
  review-display-frame, QR review-transcript, and NIP-46 payload fixtures from
  `NostrSeal/specs`.
- `nseal request sign-event` creates a signing request from an event template.
- `nseal dev-sign` signs requests with an explicit test-only software key.
- `nseal review-request` renders deterministic review JSON from a signing
  request for untrusted host-side previews and test harnesses.
- `nseal smartcard-sim-sign` exercises the smartcard APDU signing boundary with
  a test-only simulator and requires `--review-acknowledged` before sending the
  event id to the display-less signer.
- `nseal verify-response` checks request ids, event template integrity, NIP-01
  event ids, and BIP-340 Schnorr signatures.
- CLI request, dev-sign, and verify-response commands can read/write JSON or
  v0 `nseal1:` QR envelopes.
- `packages/transport` provides the first signer transport contract plus
  development, file, JSON-lines stdio, and serial-frame adapters.
- `packages/qr` implements the v0 `nseal1:` QR envelope from
  `NostrSeal/specs`.
- `packages/framing` implements the first checksum-protected serial line frame
  draft for USB CDC and UART experiments.
- `packages/protocol` validates capability discovery responses, including the
  current ESP32-S3 scaffold's disabled-signing safety flags.
- `packages/review` mirrors the shared trusted-review vector semantics for
  companion previews. It is not a trusted approval surface.
- Serial transport tests cover both capability discovery and explicit
  signing-disabled scaffold responses.
- `packages/fixtures` loads shared event, trusted-review, review-display-frame,
  QR review-transcript, NIP-46, and smartcard vectors from `NostrSeal/specs`
  for companion, Raspberry QR vault, ESP32 firmware, and smartcard conformance
  tests.
- `packages/smartcard` implements the first APDU codec, simulator adapter, and
  `SmartcardSigner` boundary against shared smartcard vectors.
- `packages/nip46` implements the first decrypted NIP-46 payload bridge for
  `get_public_key`, `sign_event`, local `ping`, and NostrSeal response mapping.
  It also parses requested permission strings for future `connect` policy
  review. Relay transport, NIP-44 encryption, permission grants, and auth flows
  remain future work.

## Planned Capabilities

- Browser extension / NIP-07 bridge.
- Full NIP-46 / Nostr Connect relay session handling with NIP-44 encryption,
  permissions, and auth challenges.
- QR encoder and decoder for vault flows.
- USB, WebUSB, HID, CDC, and WebSerial transport experiments.
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

Run the CLI from the workspace with:

```sh
pnpm nseal --help
pnpm nseal fixture verify --specs ../specs
pnpm nseal request sign-event --event-template template.json --out request.qr --output-format qr
pnpm nseal review-request --request request.qr --request-format qr --out review.json
pnpm nseal smartcard-sim-sign --secret-key <test-only-hex> --request request.qr --request-format qr --review-acknowledged --out response.qr --output-format qr
```

## License

Companion software and tooling are released under the MIT License unless a file
says otherwise. Documentation content is intended to be reusable under the
NostrSeal documentation policy.
