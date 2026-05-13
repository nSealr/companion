# Public API Review

This review records the current pre-alpha public package surface. It is a
release gate for npm publication, not a compatibility guarantee. Breaking
changes remain allowed before the first public package release.

API surface digest: `sha256:031dd5674a372e36eb639cb15046262d640d10451af3520d53d73fac31d39a56`

Source: `docs/api.md`

## Review Rules

- Public packages must import through package entrypoints, not deep source
  paths.
- Public packages must remain secretless. They must not generate, import,
  persist, export, or custody production private keys, mnemonics, passphrases,
  `nsec` values, or decrypted signing material.
- `@nsealr/dev-signer` must remain private and test-only.
- Companion APIs may prepare requests, validate payloads, verify responses,
  render untrusted review previews, and route to signers. Trusted review and
  approval remain signer-route responsibilities.
- NIP-46 APIs currently handle already-decrypted payloads only. Relay sessions,
  NIP-44 encryption, persistent grants, and browser extension packaging remain
  outside this reviewed surface.

## @nsealr/browser-provider

Status: reviewed for pre-alpha.

The surface is intentionally small: `createNip07Provider` plus provider/backend
types. It stores no browser-side key material and delegates signer access to an
injected backend. `signEvent` validates the generated nSealr request and
verifies successful responses before returning a Nostr event. Keep future
extension storage, native-host installation, origin grants, NIP-04, and NIP-44
outside this package until those contracts are reviewed separately.

## @nsealr/client

Status: reviewed for pre-alpha.

The local-service surface is secretless and limited to service status, pairing
intent creation, signer-request validation, and signer-response verification.
Client identity, request-id correlation, native-message framing, and
malformed-response rejection are public helpers. Route selection, persistent
grants, signer dispatch, cancellation, and native-host packaging remain future
work and must not be implied by this package.

## @nsealr/core

Status: reviewed for pre-alpha.

The core package owns Nostr event serialization, event-id computation, Schnorr
verification, and request/response matching. It must remain verification-only
for production code. Signing stays outside public packages except for the
private test-only development signer.

## @nsealr/fixtures

Status: reviewed for pre-alpha.

Fixtures are conformance tooling for tests, repository integration, and example
verification. This package can parse and load shared vector sets, but it does
not define production signer behavior. It is acceptable as a public developer
package only because it contains no production secret custody path.

## @nsealr/framing

Status: reviewed for pre-alpha.

The framing package only encodes and decodes checksum-protected serial frames.
It has no device-opening, route-selection, policy, storage, or signing
responsibility. This boundary is suitable for USB CDC/UART experiments and
future host transports.

## @nsealr/nip46

Status: reviewed for pre-alpha.

The NIP-46 package converts already-decrypted messages into nSealr decisions or
deterministic local responses, parses connect review intents, parses read-only
policy files, and enforces permission checks. It deliberately excludes relay
sessions, NIP-44 encryption/decryption, persistent grants, connect
acknowledgement, browser storage, and signer I/O.

## @nsealr/policy

Status: reviewed for pre-alpha.

Policy descriptors are internal nSealr records rather than Nostr events. The
package rejects embedded secret fields, QR-vault automation, wildcard grants,
decrypt/export grants, and invalid route targets. Persistent grant storage,
device policy-change approval UX, and account custody remain outside this
package.

## @nsealr/protocol

Status: reviewed for pre-alpha.

The protocol package owns nSealr v0 request, response, capability,
signing-status, and implementation-limit validation. Its limits are nSealr
safety limits for constrained signers, not Nostr protocol limits. All access
surfaces should validate through this package before contacting signer routes.

## @nsealr/qr

Status: reviewed for pre-alpha.

The QR package transports already-validated request/response payloads through
static and animated envelopes. It owns envelope parsing, frame ordering,
checksums, digest checks, and byte limits. It must not grow signing, storage,
policy, compression, or fountain-code behavior without a separate review.

## @nsealr/review

Status: reviewed for pre-alpha.

The review package produces deterministic summaries, screen pages, detail
pages, and approval digests for conformance and host-side previews. Companion
review output remains untrusted. Hardware routes and display-less external
review routes own trusted approval.

## @nsealr/smartcard

Status: reviewed for pre-alpha.

The smartcard package exposes APDU codecs, simulator helpers, PC/SC boundary
normalization, and display-less signer helpers. Its signer path must remain
bound to shared request validation and external review acknowledgement. It must
not claim trusted event review because current smartcard routes have no
display.

## @nsealr/transport

Status: reviewed for pre-alpha.

The transport package owns secretless host-side transport interfaces and
adapters for JSON files, JSON-lines stdio, serial frames, and serial-line
ports. It validates requests and responses and verifies successful `sign_event`
responses before returning them. Production transport code must not depend on
software signing helpers.

## Open Before npm Alpha

- npm trusted publishing/provenance setup must be configured outside the local
  repository.
- If an intentional API-surface change updates `docs/api.md`, repeat this
  review and record the new digest before publication.
