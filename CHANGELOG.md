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
- Secretless local companion service, client wrapper, and browser-provider
  boundaries for future SDK, browser extension, desktop, and CLI access
  surfaces.

### Release Status

- No `@nsealr/*` companion packages have been published to npm.
- Public package versions remain synchronized at `0.1.0` while APIs are alpha
  and unreleased.
