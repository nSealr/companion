# @nsealr/fixtures

Shared fixture loading and conformance helpers for nSealr repositories.

## Purpose

- Load shared vectors from `nSealr/specs`.
- Validate feature matrices and QR review transcript fixtures.
- Keep companion tests aligned with Raspberry, ESP32, smartcard, and hardware
  contracts.

## Boundary

This package is for tests, fixture verification, and conformance tooling. It
does not define production signer behavior and must not become a private-key
store.

