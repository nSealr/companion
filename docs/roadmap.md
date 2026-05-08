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
- Bridge decisions for permitted signer routing, local `ping`, `connect`
  review, and denied permissions.
- CLI decision harness for already-decrypted NIP-46 payloads.
- Read-only policy-file input for the CLI decision harness.

Status: the first decrypted-payload bridge is implemented in `packages/nip46`.
It consumes shared `NostrSeal/specs` NIP-46 payload vectors through unit tests
and `nseal fixture verify`, and it now parses NIP-46 requested permission
strings plus `connect` intents and can match later requests against explicit
permission inputs without granting or persisting them. The `connect` intent
path and non-`connect` permission policy checks are now pinned by shared specs
vectors. Bridge decisions are also pinned by shared specs vectors, including
permission-denied NIP-46 responses before a request reaches signer transport.
`nseal nip46 decide` exposes those decisions as a file-backed CLI harness for
integration tests. The command can read explicit permissions from the command
line or from a `nseal-nip46-policy-v0` policy file, but it does not create,
update, approve, or persist grants by itself. It also does not add relay,
encryption, or signer I/O.
Relay sessions, NIP-44 encryption/decryption, connection token responses,
permission storage, grant review, and auth challenge UX remain future work.

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
- PC/SC/contact transport boundary: implemented as a provider-injected APDU
  exchange adapter; native reader binding and real-card tests are pending.
- NFC/mobile transport: not implemented.
- Production smartcard support: blocked on real card testing and display-less
  review policy hardening.
