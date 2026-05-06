# NostrSeal Companion

Host-side software for NostrSeal signers.

The companion is not trusted with private keys. It constructs requests, moves
them over the selected transport, verifies device responses, and bridges Nostr
clients to hardware-backed signing.

## Current Capabilities

- `nseal fixture verify` validates shared signing fixtures from `NostrSeal/specs`.
- `nseal request sign-event` creates a signing request from an event template.
- `nseal dev-sign` signs requests with an explicit test-only software key.
- `nseal verify-response` checks request ids, event template integrity, NIP-01
  event ids, and BIP-340 Schnorr signatures.
- `packages/transport` provides the first signer transport contract plus
  development, file, and JSON-lines stdio adapters.
- `packages/qr` implements the v0 `nseal1:` QR envelope from
  `NostrSeal/specs`.
- `packages/framing` implements the first checksum-protected serial line frame
  draft for USB CDC and UART experiments.

## Planned Capabilities

- Browser extension / NIP-07 bridge.
- NIP-46 / Nostr Connect request handling.
- QR encoder and decoder for vault flows.
- USB, WebUSB, HID, CDC, and WebSerial transport experiments.
- PC/SC and NFC smartcard adapter.
- TROPIC01 USB DevKit research adapter.
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
```

## License

Companion software and tooling are released under the MIT License unless a file
says otherwise. Documentation content is intended to be reusable under the
NostrSeal documentation policy.
