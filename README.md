# NostrSeal Companion

Host-side software for NostrSeal signers.

The companion is not trusted with private keys. It constructs requests, moves
them over the selected transport, verifies device responses, and bridges Nostr
clients to hardware-backed signing.

## Planned Capabilities

- CLI signer test harness.
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

## License Plan

The companion should use a strong copyleft software license such as AGPL-3.0 or
GPL-3.0, to keep derivative signer workflows open.

