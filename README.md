# nSealr Companion

Host-side software for nSealr signers.

The companion is not trusted with private keys. It constructs requests, moves
them over the selected transport, verifies device responses, and bridges Nostr
clients to hardware-backed signing.

The product goal is a universal secretless CLI/app for all nSealr routes:
account labels, route selection, request construction, QR/USB/smartcard/
external transport helpers, policy proposal transport, signed-output
verification, and audit export. The companion is not the authoritative policy
store for persistent nSealr devices and must not store production signing
material.

Browser extension, npm SDK, CLI, local app, local service, and full NIP-46
relay work are access surfaces over the same companion platform. They must
reuse package-owned validation, policy scaffolding, transport, and response
verification logic instead of creating separate signer implementations.
The repository is intentionally a single TypeScript monorepo: one developer can
ship multiple artifacts without synchronizing separate SDK, extension, service,
or CLI repositories.

Feature availability per signer family is tracked in `nSealr/specs` at
`vectors/features/signer-feature-matrix-v0.json`. Companion packages should
consume those shared contracts instead of inventing solution-specific behavior:
when a feature is present on multiple signer implementations, the request,
review, approval, policy, transport, or response-verification behavior must
match the shared `contract_id`.

## Current Capabilities

- `nsealr fixture verify` validates shared signing, trusted-review,
  review-display-frame, review-detail-page, QR review-transcript, NIP-46
  payload, NIP-46 policy-file, account descriptor, policy profile, grant
  descriptor, policy-decision, and feature-matrix fixtures from
  `nSealr/specs`, including NIP-46 permission policy checks, bridge
  decisions, implementation limits, feature conformance contracts, and invalid
  hardening vectors.
- `nsealr request` creates signing requests from event templates and
  parameterless device requests for `get_capabilities`, `get_public_key`, and
  `get_signing_status`, with caller-supplied `--request-id` support for
  hardware traces.
- `nsealr dev-sign` signs requests with an explicit test-only software key.
- Each reusable `packages/*` module now has an explicit `@nsealr/*` package
  manifest and `src/index.ts` entrypoint. Internal imports use those package
  entrypoints instead of deep relative paths so SDK, extension, service, and
  CLI code share the same boundaries.
- `@nsealr/client` defines the first local companion service protocol and
  native-messaging frame codec. The implemented operations are intentionally
  secretless: service status, signer-request validation, and signer-response
  verification.
- `@nsealr/service` is the private one-shot native-messaging host scaffold over
  `@nsealr/client`. It does not open relays, store keys, select accounts, or
  contact signer transports.
- `nsealr review-request` renders deterministic review JSON, digest-bound
  screen-review pages, or complete constrained-display detail pages from a
  signing request for untrusted host-side previews and test harnesses.
- `nsealr smartcard-sim-sign` exercises the smartcard APDU signing boundary with
  a test-only simulator and requires `--review-acknowledged` before sending the
  event id to the display-less signer.
- `packages/smartcard` includes fake-reader PC/SC boundary tests that normalize
  malformed reader-list, setup, and APDU transmit failures without claiming
  real-card support.
- `nsealr verify-response` checks request ids, event template integrity, NIP-01
  event ids, and BIP-340 Schnorr signatures.
- Transport exchanges now apply the same successful `sign_event` verification
  before returning a signed event response, so serial/file/stdio adapters cannot
  hand invalid signatures to higher layers as accepted output.
- CLI request, dev-sign, and verify-response commands can read/write JSON or
  v0 `nsealr1:` QR envelopes.
- `packages/transport` provides the first signer transport contract plus file,
  JSON-lines stdio, and serial-frame adapters. The test-only development
  signer transport lives in private `@nsealr/dev-signer`, so production
  transport code does not depend on software signing helpers. The stdio
  adapter bounds response-line output and captured stderr before accepting or
  reporting external signer process results, and times out silent processes
  that do not emit a response.
- The serial-line transport boundary can drive an injected newline-oriented
  port, normalize common serial line endings, ignore device log lines, and
  reuse the same serial-frame validation before a native USB/WebSerial binding
  exists.
- `SerialLineStreamPort` adapts Node readable/writable streams into that
  newline-oriented port interface for dependency-free serial integration tests,
  while enforcing the shared v0 serial-frame byte limit on buffered lines.
- `exchangeSerialLineRequest` owns one-shot serial-line validation/open/close
  sequencing inside `packages/transport`, so CLI and future native bindings do
  not duplicate the safety boundary.
- `nsealr serial-frame` exposes offline serial-frame request wrapping and
  response unwrapping helpers for ESP32 bring-up and lab captures. Response
  unwrapping can verify the original request before writing output, so
  captured frames cannot silently drift across request ids.
- `nsealr serial-line exchange` is the CLI wrapper for that package-owned
  one-shot exchange. It opens a newline serial device path only after request
  validation, verifies the response before writing output, skips firmware log
  lines, and closes the stream-backed port after the exchange. It is a local
  USB-serial bring-up helper, not a browser/WebUSB or persistent signer
  session.
- `nsealr nip46 decide` writes the bridge decision for an already-decrypted
  NIP-46 payload using explicit permission inputs or a read-only policy file.
  It does not open relays, decrypt NIP-44 payloads, persist grants, or contact
  signer transports.
- `nsealr nip46 review-connect` writes deterministic review pages for an
  already-decrypted NIP-46 `connect` request. It shows the remote signer
  pubkey, whether a secret was provided, and requested permissions without
  echoing the secret value or approving the client.
- `packages/qr` implements the v0 `nsealr1:` QR envelope from
  `nSealr/specs`, including malformed/padded/invalid-UTF-8/oversized
  rejection. Encoding applies the same static decoded-JSON byte limit as
  decoding, so the companion does not emit QR payloads that v0 receivers would
  immediately reject. It also implements the v0 `nsealr1a:` animated QR frame
  set for larger valid payloads, with digest, frame checksum, ordering, and
  frame-count checks before JSON parsing.
- `packages/framing` implements the first checksum-protected serial line frame
  draft for USB CDC and UART experiments, including shared frame-size limits on
  both decode and encode.
- `packages/protocol` validates request/response shape, centralizes the
  companion copy of the shared v0 implementation limits, and validates
  capability discovery and signing-status responses, including rejection of
  contradictory `signing_enabled: true` diagnostics that still report missing
  gates, disabled diagnostics that omit missing-gate reasons, and duplicated
  gate entries. Response request ids must use the same v0 profile as requests.
  Successful signed-event responses are also checked for shared integer-safety,
  content, and tag resource limits before they can be accepted.
- `packages/review` mirrors the shared trusted-review vector semantics for
  companion previews. It is not a trusted approval surface.
- Serial transport tests cover both capability discovery and explicit
  signing-disabled scaffold responses.
- `packages/fixtures` loads shared event, trusted-review, review-display-frame,
  review-detail-page, QR review-transcript, NIP-46 payload, NIP-46 policy-file,
  account-descriptor, policy-profile, grant-descriptor, policy-decision,
  feature-matrix, and smartcard vectors from `nSealr/specs` for companion,
  Raspberry QR vault, ESP32 firmware, and smartcard conformance tests.
- `packages/policy` parses secretless account descriptors, policy profiles, and
  grant descriptors, then evaluates policy-decision transcript vectors without
  a persistent grant store. It rejects embedded private-key material, QR-vault
  automation, wildcard/decrypt/export grants, and stateless QR-vault grant
  targets before CLI or fixture-verification code can treat those records as
  valid.
  These records describe resulting signing public keys and routes. Mnemonics,
  BIP-39 passphrase namespaces, standalone `nsec` keys, device slots, card
  slots, and external signers are key sources or routes, not production secrets
  kept by companion. Policy records are internal nSealr records, not Nostr
  events, and the current scoped-automation vectors are conformance fixtures,
  not the final policy UX.
- `packages/smartcard` implements the first APDU codec, simulator adapter,
  provider-based PC/SC APDU transport boundary, and `SmartcardSigner` boundary
  against shared smartcard vectors, including APDU rejection status words. The
  PC/SC boundary validates transmit-result shape, response status bytes,
  response data shape, and response data bytes before constructing response
  APDUs, and rejects malformed reader-provider
  output before reader connection.
- `packages/nip46` implements the first decrypted NIP-46 payload bridge for
  `get_public_key`, `sign_event`, local `ping`, and nSealr response mapping.
  It also parses `connect` requests into policy-review intents and deterministic
  review pages, validates requested permission strings, and owns the read-only
  policy-file parser used by the CLI. Shared specs vectors now pin the derived
  permission requirements, positive/negative permission checks, bridge
  decisions, `connect` review pages, and invalid payload rejection for signer
  routing, local response routing, `connect` review, and permission-denied
  responses. Relay transport, NIP-44 encryption, persistent permission grants,
  and auth flows remain future work.

## Planned Capabilities

- Complete the package-boundary freeze for future `@nsealr/*` npm SDK
  publication with package README files, third-party import tests, semver,
  provenance, and built JS/declaration artifacts. The source-level manifests,
  explicit entrypoints, deep-import audit, and test-only signer isolation are
  already in place.
- Expand the local companion service boundary with pairing, origin/app
  identity, route selection, cancellation, revocation, deterministic errors,
  and signer transport dispatch. Native messaging is the preferred first
  serious browser-extension transport; localhost APIs need a separate
  threat-model pass.
- Browser extension / NIP-07 bridge that forwards `getPublicKey` and
  `signEvent` through companion without storing production signing material.
- Public npm SDK alpha after package APIs, docs, semver, provenance, and
  third-party import tests are stable.
- Full NIP-46 / Nostr Connect relay session handling with NIP-44 encryption,
  permissions, and auth challenges.
- WebUSB, HID, CDC, WebSerial, and persistent transport experiments.
- Real PC/SC reader smoke tests and NFC smartcard adapter work.
- TROPIC01 USB DevKit research adapter for the custom persistent-secret
  hardware-wallet family.
- Relay publish and response verification tools.

## Initial Layout

- `apps/`: CLI, future local service/native-messaging host, browser extension,
  desktop shell, and developer tools.
- `packages/`: reusable `@nsealr/*` core/protocol/review/qr/framing/transport/
  NIP-46/policy/client/provider modules.
- `docs/`: implementation notes and usage guides.

## Quality Baseline

Run the repository verification loop with:

```sh
make ci
```

The Makefile pins `pnpm@10.33.4`; it uses a global `pnpm` when available and
falls back to `npm exec` when only Node/npm is installed.

Run the CLI from the workspace with:

```sh
pnpm nsealr --help
pnpm nsealr fixture verify --specs ../specs
pnpm nsealr request get-signing-status --request-id req-status-1 --out status-request.json
pnpm nsealr request sign-event --event-template template.json --out request.qr --output-format qr
pnpm nsealr review-request --request request.qr --request-format qr --out review.json
pnpm nsealr review-request --request request.qr --request-format qr --detail-pages --max-compact-line-chars 48 --out review-detail-pages.json
pnpm nsealr nip46 decide --message nip46-message.json --permissions sign_event:1 --out decision.json
pnpm nsealr nip46 decide --message nip46-message.json --policy-file policy.json --out decision.json
pnpm nsealr nip46 review-connect --message nip46-connect.json --out connect-review.json
pnpm nsealr smartcard-sim-sign --secret-key <test-only-hex> --request request.qr --request-format qr --review-acknowledged --approval-digest <approval-digest-hex> --out response.qr --output-format qr
```

## License

Companion software and tooling are released under the MIT License unless a file
says otherwise. Documentation content is intended to be reusable under the
nSealr documentation policy.
