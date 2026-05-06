# Roadmap

## M2: CLI MVP

- TypeScript pnpm workspace.
- CLI request generation.
- Fixture verification.
- Test-only dev signer.
- Response verification.

Status: implemented as the first companion foundation. Further hardening stays
in M2 until negative verification cases and malformed-input CLI tests are added.

## M3: Transport Layer

- File transport.
- Stdio transport.
- Simulated signer.
- QR envelope package.
- Serial framing draft.

Status: file, stdio, and in-memory development signer transport foundations are
implemented. QR envelope code and serial framing remain in M3.

## Later

- Browser bridge.
- NIP-46/Nostr Connect integration.
- USB/WebUSB/HID/CDC transports.
- PC/SC smartcard adapter.
