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
- `@nsealr/client` helper for converting a digest-bound pairing intent into an
  explicitly approved local client grant.
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
  host name.
- Private `@nsealr/browser-extension` app scaffold with strict internal
  `get_public_key` and `sign_event` message parsing plus a provider-backed
  handler that validates returned pubkeys/events before extension packaging,
  browser injection, or signer dispatch.
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
