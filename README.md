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

## Quality Baseline

Run the repository verification loop with:

```sh
make ci
```

## License

Companion software and tooling are released under the MIT License unless a file
says otherwise. Documentation content is intended to be reusable under the
NostrSeal documentation policy.
