# Changelog

All notable changes to `nSealr/companion` packages are tracked here before any
public npm release.

## Unreleased

### Added

- Package boundary freeze with explicit `@nsealr/*` manifests, built `dist`
  exports, package README boundary docs, source and packed consumer smokes, and
  test-only signer isolation.
- Manual package release rehearsal workflow and checked tarball artifact
  preparation without npm publication.
- Generated public API surface docs and a CI drift check for every public
  package entrypoint.
- npm-facing package manifest metadata and public provenance `publishConfig`
  checks for publishable packages.
- Executable SDK examples now import every publishable public package and cover
  fixture, policy, review, framing, smartcard, and serial-line transport
  boundaries without test-only signer imports.
- Executable README snippets for every publishable public package, checked
  against built package entrypoints in CI.
- Digest-bound public API review for every publishable package before npm alpha
  work.
- `@nsealr/sdk` platform-neutral facade over curated public namespaces for app,
  browser-extension, and companion integrations without importing private
  signing helpers, Node-only fixtures, or host transport adapters.
- `@nsealr/client` helper for converting a digest-bound pairing intent into an
  explicitly approved local client grant.
- `@nsealr/client` method-specific local-service response binding so callers
  reject valid-but-wrong result types before trusting native messaging.
- `@nsealr/client` deterministic pairing-review projection for future local
  service approval UX.
- `nsealr local review-pairing` for rendering deterministic pairing-review
  metadata from a digest-bound local-service pairing intent without approval or
  grant-store writes.
- `nsealr local approve-pairing` for creating a pairing approval artifact after
  explicit reviewed-digest confirmation, without mutating grant stores.
- `nsealr local grant-store append-approval` for writing a new explicit
  secretless grant-store artifact from a pairing approval, with no default
  path selection and no input-file mutation.
- `nsealr local grant-store revoke-client` for writing a new explicit
  grant-store artifact with a latest-client revocation appended, without
  deleting grant history or mutating input files.
- `@nsealr/browser-provider` browser native-messaging local-service client
  adapter over an explicit `sendNativeMessage` function and the shared native
  host name, with optional deterministic response timeouts and request
  cancellation.
- Private browser-extension native-messaging provider selector that binds a
  sanitized sender-derived client identity to the local-service provider path
  before browser packaging, content-script injection, or signer dispatch.
- Private browser-extension native-messaging pairing-intent helper that requests
  digest-bound local-service pairing for the sanitized sender-derived client
  identity without writing grants, extension storage, or native-host files.
- Private browser-extension pairing-review projection that turns the native
  pairing intent into deterministic review metadata without approving clients
  or writing extension storage.
- Private browser-extension browser-origin permission review projection that
  maps the digest-bound pairing intent to page-visible NIP-07 method effects
  without approving grants or injecting providers.
- Private browser-extension origin-permission approval artifacts that require
  explicit local pairing digest confirmation and still create no grants,
  extension storage, provider injection, or key material.
- Private browser-extension background-controller boundary that composes
  sender-aware request handling, pairing-intent requests, pairing review, and
  origin permission review over injected native messaging without using
  browser APIs, storage, or signer dispatch.
- Private browser-extension runtime-message adapter that maps raw browser
  sender metadata to the internal sender shape before background handling,
  returning deterministic invalid-sender responses without registering runtime
  listeners or calling browser APIs.
- Private browser-extension page-provider boundary that maps NIP-07
  `getPublicKey` and `signEvent` calls to validated background requests
  and installs on an explicit target without overwriting an existing provider,
  without content-script injection, browser storage, grants, or key custody.
- Private browser-extension page-bridge envelope that validates future
  page/content-script messages over an injected background requester without
  adding postMessage listeners, browser APIs, storage, grants, or key custody.
- Private browser-extension page-side bridge requester that wraps internal
  requests in the page/content bridge envelope, validates bridge responses,
  and forwards cancellation without adding browser listeners or runtime APIs.
- Private browser-extension content-script bridge handler that binds validated
  page bridge envelopes to an injected sender-aware background requester
  without adding browser listeners, runtime APIs, storage, or grants.
- Private browser-extension content-window event adapter that source/origin
  gates already-received page messages before forwarding nSealr page-bridge
  envelopes, without registering listeners or calling `postMessage`.
- Private browser-extension page-script provider bootstrap that composes the
  NIP-07 provider installer with the injected page bridge exchange without
  adding content-script registration, browser listeners, storage, or grants.
- Private browser-extension explicit-origin content-script manifest profile
  that keeps the minimal no-content-script manifest as the default and rejects
  broad URL access, host-permission fields, storage, and duplicate matches.
- Private `@nsealr/browser-extension` app scaffold with strict internal
  `get_public_key` and `sign_event` message parsing plus a provider-backed
  handler that validates returned pubkeys/events before extension packaging,
  browser injection, or signer dispatch.
- Minimal private browser-extension manifest builder that pins native messaging
  as the only permission and omits host permissions, content scripts, and
  extension storage until origin-permission UX is reviewed.
- Browser-safe `@nsealr/client/client-identity` parser and private
  browser-extension sender boundary so browser, SDK, CLI, service, and
  native-host code use one origin/app binding rule set.
- Private browser-extension sender-aware handler that validates both the
  internal request and sender-derived page origin before provider selection.
- `@nsealr/client` secretless JSON grant-store contract for persisting approved
  and revoked local client grants without production key material.
- Deterministic local-service grant-history selection so the latest matching
  in-memory grant controls revocation, expiry, and operation scope.
- Private native-messaging service scaffold now returns deterministic malformed
  frame errors and is tested with injected in-memory authorization context.
- Private native-messaging service app now processes multiple length-prefixed
  messages per host session and exposes a tested stdio loop for future browser
  native-host packaging.
- Private native-messaging service app now generates validated Chromium and
  Firefox native-host manifest JSON without installing files.
- Private native-messaging service app now loads explicit read-only secretless
  grant/account JSON context files for developer and integration harnesses
  without choosing storage defaults, approving clients, or writing files.
- `@nsealr/policy` pure route-selection helper and shared specs vectors for
  account-to-route metadata selection without signer dispatch.
- `@nsealr/client` local-service route-selection operation gated by in-memory
  pairing authorization and shared route-selection validators.
- `@nsealr/browser-provider` local-service backend adapter for authorized
  account public-key lookup and deterministic signer-unavailable responses.
- Secretless local companion service, client wrapper, and browser-provider
  boundaries for future SDK, browser extension, desktop, and CLI access
  surfaces.

### Release Status

- No `@nsealr/*` companion packages have been published to npm.
- Public package versions remain synchronized at `0.1.0` while APIs are alpha
  and unreleased.
