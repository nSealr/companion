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
- Serial frame transport adapter.

Status: file, stdio, in-memory development signer transport, QR envelope,
serial framing, and serial-frame transport foundations are implemented. M3
remains open for CLI exposure, larger-payload strategy, and first physical USB
serial integration.

## Later

- Browser bridge.
- NIP-46/Nostr Connect integration.
- USB/WebUSB/HID/CDC transports.
- PC/SC smartcard adapter backed by the implemented APDU codec.
