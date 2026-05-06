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
- Development signer verification tests in `packages/dev-signer`.
- Negative response verification tests for request id mismatch, template
  mismatch, event id mismatch, and invalid signatures.
- End-to-end CLI tests for `request -> dev-sign -> verify-response`.
- CLI fixture verification tests against `NostrSeal/specs`.
- Transport contract tests for in-memory development signing, JSON file
  handoff, and one-shot JSON-lines stdio exchange.
- QR envelope round-trip and rejection tests.
- Serial frame round-trip, unsupported type, and checksum mismatch tests.

## Next Test Additions

- CLI failure-mode tests for malformed JSON and unsupported methods.
- Large QR payload strategy tests once chunking or compression is designed.
- Serial simulator tests before adding USB, serial, HID, or CDC adapters.

## Rule

Production behavior changes require test-driven development.
