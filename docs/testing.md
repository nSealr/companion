# Testing

## Current Baseline

```sh
make ci
```

The baseline check verifies repository structure, license policy, docs, CI,
TypeScript type safety, unit tests, integration tests, and dependency audit.

## Single-Repository CI

Tests prefer the sibling `NostrSeal/specs` repository when the full local
workspace is present. GitHub Actions checks out `NostrSeal/companion` by itself,
so tests fall back to fixture snapshots under `tests/fixtures/specs` in
single-repository CI. Cross-repository drift remains guarded by
`NostrSeal/lab` integration, which runs against the live sibling repositories.

## M2 Tests

- NIP-01 canonicalization tests in `packages/core`.
- BIP-340 verification tests in `packages/core`.
- Request and response shape validation tests in `packages/protocol`.
- Shared fixture loading tests in `packages/fixtures`.
- Trusted-review model tests in `packages/review` against every shared review
  vector from `NostrSeal/specs`.
- Development signer verification tests in `packages/dev-signer`.
- Negative response verification tests for request id mismatch, template
  mismatch, event id mismatch, and invalid signatures.
- End-to-end CLI tests for `request -> dev-sign -> verify-response`.
- End-to-end CLI tests for QR envelope `request -> dev-sign -> verify-response`.
- CLI failure-mode tests for malformed event-template JSON and unsupported
  request methods.
- CLI review-request test for rendering review JSON from a QR signing request.
- CLI fixture verification tests against `NostrSeal/specs`, covering both
  signed-event fixtures, trusted-review fixtures, review-display-frame
  fixtures, QR review-transcript fixtures, and NIP-46 payload fixtures.
- Transport contract tests for in-memory development signing, JSON file
  handoff, one-shot JSON-lines stdio exchange, and serial-frame exchange.
- CLI serial-frame tests covering validated request wrapping and response-frame
  unwrapping.
- QR envelope round-trip and rejection tests.
- Serial frame round-trip, unsupported type, and checksum mismatch tests.
- Shared `NostrSeal/specs` QR and serial transport vector conformance tests.
- Shared `NostrSeal/specs` capability response conformance tests.
- Shared `NostrSeal/specs` ESP32-S3 signing-disabled response conformance
  tests.
- Shared `NostrSeal/specs` smartcard APDU vector conformance tests.
- Smartcard signer tests covering mandatory review acknowledgement, APDU-backed
  public-key retrieval, event-id signing, Schnorr verification, and standard
  signed-event response verification.
- Smartcard PC/SC boundary tests covering fake reader exchange and clear
  no-reader errors without requiring native PC/SC dependencies or hardware.
- CLI smartcard simulator tests covering rejection without
  `--review-acknowledged` and `request -> smartcard-sim-sign ->
  verify-response`.
- NIP-46 payload bridge tests covering already-decrypted `sign_event` and
  `get_public_key` messages, local `ping`, NostrSeal response mapping, and
  rejection of unsafe or unsupported payloads. The same tests consume shared
  `NostrSeal/specs` NIP-46 payload vectors.
- NIP-46 requested-permission parser tests covering method-only permissions,
  `sign_event:<kind>` selectors, empty permission strings, and rejection of
  malformed or unsupported entries.
- NIP-46 `connect` intent parser tests covering remote-signer pubkey
  validation, optional secret capture, requested permissions, and rejection of
  signer-transport routing for `connect`. The shared specs fixture suite now
  includes a `connect` policy-review intent vector.
- NIP-46 permission matching tests covering derived `sign_event:<kind>`
  requirements, broad `sign_event` grants, method-only grants, denied requests,
  and `connect` exclusion from post-connect request permissions. The CLI fixture
  verifier also rejects drift in shared permission policy checks.
- NIP-46 bridge decision tests covering permitted signer routing, denied signer
  routing, local `ping`, denied `ping`, and `connect` review intent output. The
  CLI fixture verifier also rejects drift in shared bridge decision vectors.

## Next Test Additions

- Large QR payload strategy tests once chunking or compression is designed.
- Hardware serial smoke tests before adding WebUSB, HID, or CDC adapters.

## Rule

Production behavior changes require test-driven development.
