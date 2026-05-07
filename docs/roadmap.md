# Roadmap

## M2: CLI MVP

- TypeScript pnpm workspace.
- CLI request generation.
- Fixture verification.
- Test-only dev signer.
- Response verification.

Status: implemented as the first companion foundation with JSON and QR envelope
CLI paths. Fixture verification now includes shared review-display-frame and
QR review-transcript vectors in addition to event and trusted-review vectors.
Malformed JSON and unsupported request-method CLI rejection tests are now
covered.

## M3: Transport Layer

- File transport.
- Stdio transport.
- Simulated signer.
- QR envelope package.
- Serial framing draft.
- Serial frame transport adapter.

Status: file, stdio, in-memory development signer transport, QR envelope,
serial framing, and serial-frame transport foundations are implemented. M3
remains open for CLI exposure, larger-payload strategy, and first physical USB
serial integration.

## Later

- Browser bridge.
- NIP-46/Nostr Connect integration.
- USB/WebUSB/HID/CDC transports.
- PC/SC smartcard adapter backed by the implemented APDU codec and
  `SmartcardSigner` boundary.

## Smartcard Line

- APDU codec and deterministic simulator: implemented.
- `SmartcardSigner` companion boundary: implemented for `GET_PUBLIC_KEY` plus
  `SIGN_EVENT_ID`.
- CLI simulator path: implemented as `nseal smartcard-sim-sign`, with mandatory
  `--review-acknowledged`.
- PC/SC/contact transport: not implemented.
- NFC/mobile transport: not implemented.
- Production smartcard support: blocked on real card testing and display-less
  review policy hardening.
