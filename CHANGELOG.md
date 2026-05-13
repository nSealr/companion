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
  explicitly approved in-memory grant without persistent storage.
- Deterministic local-service grant-history selection so the latest matching
  in-memory grant controls revocation, expiry, and operation scope.
- Private native-messaging service scaffold now returns deterministic malformed
  frame errors and is tested with injected in-memory authorization context.
- `@nsealr/policy` pure route-selection helper and shared specs vectors for
  account-to-route metadata selection without signer dispatch.
- Secretless local companion service, client wrapper, and browser-provider
  boundaries for future SDK, browser extension, desktop, and CLI access
  surfaces.

### Release Status

- No `@nsealr/*` companion packages have been published to npm.
- Public package versions remain synchronized at `0.1.0` while APIs are alpha
  and unreleased.
