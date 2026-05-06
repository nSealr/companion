# Testing

## Current Baseline

```sh
make ci
```

The baseline check verifies repository structure, license policy, docs, and CI.

## Required M2 Tests

- NIP-01 canonicalization tests.
- BIP-340 verification tests.
- Request generation tests.
- Response verification tests.
- Negative tests for schema errors, event id mismatch, pubkey mismatch,
  request id mismatch, and invalid signatures.
- End-to-end test: `request -> dev-sign -> verify-response`.

## Rule

Production behavior changes require test-driven development.

