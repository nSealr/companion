# Public API Review

This review records the current pre-alpha public package surface. It is a
release gate for npm publication, not a compatibility guarantee. Breaking
changes remain allowed before the first public package release.

API surface digest: `sha256:3baadd70c7bfc5eec4d57a41caef83f0a07a95ccf9bdb36cf2f19391c7bd9d77`

Source: `docs/api.md`

## Review Rules

- Public packages must import through package entrypoints, not deep source
  paths.
- Public package production source must pass the import-hygiene gate: relative
  imports stay inside the package `src` boundary, `@nsealr/*` imports use
  reviewed public entrypoints/subpaths, and private apps or test-only packages
  stay out of production code.
- Public packages must remain secretless. They must not generate, import,
  persist, export, or custody production private keys, mnemonics, passphrases,
  `nsec` values, or decrypted signing material.
- `@nsealr/dev-signer` must remain private and test-only.
- Companion APIs may prepare requests, validate payloads, verify responses,
  render untrusted review previews, and route to signers. Trusted review and
  approval remain signer-route responsibilities.
- NIP-46 APIs currently handle the already-decrypted payload bridge plus
  descriptor-only connection URI parsing. Relay sessions, NIP-44 encryption,
  `connect` acknowledgements, persistent grants, and browser extension
  packaging remain outside this reviewed surface.

## @nsealr/browser-provider

Status: reviewed for pre-alpha.

The surface is intentionally small: `createNip07Provider`, the local-service
backend adapter, the browser native-messaging local-service client adapter, and
provider/backend types. It stores no browser-side key material and delegates
signer access to an injected backend. The local-service adapter can read the
selected account public key through authorized route selection and routes
`signEvent` through the local-service dispatch operation, which returns
deterministic signer-unavailable responses until an explicit signer route
dispatcher is configured. Dispatch verifies successful signer responses against
the selected route public key before the provider can trust them. The
native-messaging adapter only wraps an explicit `sendNativeMessage` function,
validates the host name, and delegates silent or cancelled exchange bounds to
`@nsealr/client`; it does not install a native host or persist grants.
`signEvent` validates the generated nSealr request and verifies successful
responses before returning a Nostr event. Keep future extension storage,
native-host installation, origin grants, NIP-04, and NIP-44 outside this
package until those contracts are reviewed separately.

## @nsealr/client

Status: reviewed for pre-alpha.

The local-service surface is secretless and limited to service status, pairing
intent creation, deterministic pairing-review projection, manual pairing
approval into a grant, strict pairing-approval artifact parsing, strict JSON
grant-store serialization and output-only revocation appending for
approved/revoked local client grants, digest-bound storage-location review and
approval artifacts for explicit grant/account/route-driver paths, approval
coverage checks before grant-store output writes, secretless route selection,
signer-request validation, grant-gated dispatch through an explicitly injected
dispatcher, display-less external-review acknowledgement binding, and
signer-response verification. Browser runtime code uses the reviewed
`./browser` subpath, while identity-only callers may use the smaller
`./client-identity` subpath. Request-id correlation, native-message framing,
and malformed-response rejection are public helpers.
`LocalServiceClient` also owns optional deterministic response timeouts,
request cancellation, and `AbortSignal` forwarding into injected exchanges so
browser-provider, SDK, extension, and future desktop code do not fork stalled
local-service behavior.
The shared native host name, native-host manifest builder, digest-bound dry-run
install-plan builder/parser, install-approval artifact helpers, and explicit
approval-bound install execution builder/parser remain exported from the
Node-capable root so service manifest/plan/approval/execution generation and
packaging checks do not drift.
`SignerTransportError` is the public typed error host-owned dispatchers should
throw when a transport failure needs to cross the local-service boundary with a
deterministic code instead of a generic dispatch failure.
Route selection returns metadata only; dispatch is unavailable by default and
does not include real transport drivers. The route-aware dispatcher registry is
only a secretless host-wiring helper: it selects the most specific configured
account/route/transport handler, reports missing route handlers as unavailable,
and rejects ambiguous handler configuration without opening a signer transport.
Display-less `sign_event` routes require a
`nsealr-external-review-acknowledgement-v0` artifact with a matching
`approval_digest` before the injected dispatcher is called, and the same
artifact is rejected on routes with trusted device review.
The async local-service handler is only an awaitable form of the same reviewed
dispatch boundary for future host-owned I/O drivers; the synchronous handler
rejects async dispatchers deterministically. File-backed service loading is now
storage-approval gated. Native-host install approvals remain artifact-only with
`writes_files=false`; the separate execution helper requires the reviewed
install digest again, uses an injected writer, reports `writes_files=true`, and
writes only the reviewed manifest path with write-new semantics. Route-specific
signer transport wiring, production storage writes, and production installer UX
remain future work and must not be implied by this package.

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
deterministic local responses, parses connect review intents, parses
descriptor-only `bunker://` and `nostrconnect://` connection URI metadata,
parses read-only policy files, and enforces permission checks. The connection
URI parser records only secret presence, not the secret value. It deliberately
excludes relay sessions, NIP-44 encryption/decryption, persistent grants,
connect acknowledgement, browser storage, and signer I/O.

## @nsealr/policy

Status: reviewed for pre-alpha.

Policy descriptors are internal nSealr records rather than Nostr events. The
package rejects embedded secret fields, QR-vault automation, wildcard grants,
decrypt/export grants, and invalid route targets. It also exposes pure
secretless account-route request parsing and selection from parsed descriptors
and supported methods, runtime parsing for policy-decision requests, plus
deterministic expiry, revocation, and rate-limit decisions from explicit
grant-usage snapshots. It also exposes secretless policy-change proposal
parsing and deterministic review-page/approval-digest generation for device
approved `set_policy` changes. Persistent grant storage, usage history
storage, authoritative device policy mutation, signer dispatch, and account
custody remain outside this package.

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

## @nsealr/sdk

Status: reviewed for pre-alpha.

The SDK package is a platform-neutral facade over curated public namespaces for
browser, app, and companion integrations. It intentionally excludes the private
`@nsealr/dev-signer` package and does not import Node-only fixture loading or
host transport adapters. The `@nsealr/sdk/browser` subpath is the reviewed
browser-safe facade over the NIP-07 provider, `@nsealr/client/browser`, and
pure core/policy/protocol/QR/review helpers. Use `@nsealr/fixtures` and
`@nsealr/transport` directly when test/lab or Node host code needs those
specialized surfaces. The SDK must remain a secretless convenience layer: no
production key custody, browser-side signing material, grant database,
native-host installation, or signer dispatch.

## @nsealr/smartcard

Status: reviewed for pre-alpha.

The smartcard package exposes APDU codecs, PC/SC boundary normalization, and
display-less signer helpers. Test-only APDU simulation lives in the private
`@nsealr/dev-signer` package, so this publishable package does not expose
software signing helpers. Its signer path must remain bound to shared request
validation and external review acknowledgement. The public APDU constants include
the exact v0 profile status words, including incorrect P1/P2 rejection, but not
any production card compatibility claim. It must not claim trusted event review
because current smartcard routes have no display.

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
