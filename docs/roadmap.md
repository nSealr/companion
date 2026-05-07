# Roadmap

## M2: CLI MVP

- TypeScript pnpm workspace.
- CLI request generation.
- Fixture verification.
- Test-only dev signer.
- Response verification.

Status: implemented as the first companion foundation with JSON and QR envelope
CLI paths. Fixture verification now includes shared review-display-frame and
QR review-transcript vectors plus NIP-46 payload vectors in addition to event
and trusted-review vectors. Malformed JSON and unsupported request-method CLI
rejection tests are now covered.

## M3: Transport Layer

- File transport.
- Stdio transport.
- Simulated signer.
- QR envelope package.
- Serial framing draft.
- Serial frame transport adapter.
- CLI serial-frame wrapping and unwrapping helpers.

Status: file, stdio, in-memory development signer transport, QR envelope,
serial framing, serial-frame transport foundations, and offline CLI
serial-frame helpers are implemented. M3 remains open for larger-payload
strategy and first physical USB serial integration.

## M4: NIP-46 Payload Bridge

- Decrypted JSON-RPC-like content mapping.
- `get_public_key` and `sign_event` request conversion to NostrSeal requests.
- Local `ping` handling.
- NostrSeal response conversion back to NIP-46 result/error strings.
- Requested permission string parsing for future `connect` review.
- `connect` request parsing into explicit policy-review intents.
- Request permission matching against explicit in-memory grant inputs.

Status: the first decrypted-payload bridge is implemented in `packages/nip46`.
It consumes shared `NostrSeal/specs` NIP-46 payload vectors through unit tests
and `nseal fixture verify`, and it now parses NIP-46 requested permission
strings plus `connect` intents and can match later requests against explicit
permission inputs without granting or persisting them. The `connect` intent
path is now pinned by a shared specs vector. Relay sessions, NIP-44
encryption/decryption, connection token responses, permission storage, grant
review, and auth challenge UX remain future work.

## Later

- Browser bridge.
- Full NIP-46/Nostr Connect relay session integration.
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
