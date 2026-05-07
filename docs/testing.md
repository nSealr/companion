# Testing

## Current Baseline

```sh
make ci
```

The baseline check verifies repository structure, license policy, docs, CI,
TypeScript type safety, unit tests, integration tests, and dependency audit.

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
- CLI review-request test for rendering review JSON from a QR signing request.
- CLI fixture verification tests against `NostrSeal/specs`, covering both
  signed-event fixtures and trusted-review fixtures.
- Transport contract tests for in-memory development signing, JSON file
  handoff, one-shot JSON-lines stdio exchange, and serial-frame exchange.
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
- CLI smartcard simulator tests covering rejection without
  `--review-acknowledged` and `request -> smartcard-sim-sign ->
  verify-response`.

## Next Test Additions

- CLI failure-mode tests for malformed JSON and unsupported methods.
- Large QR payload strategy tests once chunking or compression is designed.
- Hardware serial smoke tests before adding WebUSB, HID, or CDC adapters.

## Rule

Production behavior changes require test-driven development.
