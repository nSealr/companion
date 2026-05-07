# Roadmap

## M2: CLI MVP

- TypeScript pnpm workspace.
- CLI request generation.
- Fixture verification.
- Test-only dev signer.
- Response verification.

Status: implemented as the first companion foundation with JSON and QR envelope
CLI paths. Further hardening stays in M2 until malformed-input CLI tests are
added.

## M3: Transport Layer

- File transport.
- Stdio transport.
- Simulated signer.
- QR envelope package.
- Serial framing draft.

Status: file, stdio, in-memory development signer transport, QR envelope, and
serial framing foundations are implemented. M3 remains open for CLI exposure,
larger-payload strategy, and first firmware simulator integration.

## Later

- Browser bridge.
- NIP-46/Nostr Connect integration.
- USB/WebUSB/HID/CDC transports.
- PC/SC smartcard adapter backed by the implemented APDU codec.
