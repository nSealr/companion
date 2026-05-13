# Release Policy

The companion package set is pre-release. No `@nsealr/*` package should be
published until the package, policy, and access-surface gates are green.

## Versioning

- Public companion packages use one synchronized version.
- Current version: `0.1.0`.
- Breaking API changes are allowed before the first public release.
- After publication, SemVer applies to public package exports.
- Private `@nsealr/dev-signer` is not a production package and is never a public
  signing route.

## Public Package Set

- `@nsealr/browser-provider`
- `@nsealr/client`
- `@nsealr/core`
- `@nsealr/fixtures`
- `@nsealr/framing`
- `@nsealr/nip46`
- `@nsealr/policy`
- `@nsealr/protocol`
- `@nsealr/qr`
- `@nsealr/review`
- `@nsealr/smartcard`
- `@nsealr/transport`

## Release Gates

Before any npm publication:

- `make ci` must pass in `nSealr/companion`.
- `make integration` must pass in `nSealr/lab`.
- Package tarballs must contain only `dist`, README, and package metadata.
- Packed tarballs must install into a temporary consumer project and import by
  package name.
- Executable SDK examples must pass against built package entrypoints.
- The changelog must describe the release.
- No package may contain production private-key custody or depend on private
  `@nsealr/dev-signer` from production code.
- Public claims must remain pre-production unless real signer acceptance gates
  are complete.

## Provenance

Publication should happen only from a reviewed GitHub Actions release workflow
using npm trusted publishing or `npm publish --provenance`.

Local `npm publish` is not an accepted release path. A release workflow must be
added and reviewed before the first public package publication.
