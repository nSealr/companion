# @nsealr/fixtures

Shared fixture loading and conformance helpers for nSealr repositories.

## Purpose

- Load shared vectors from `nSealr/specs`, including NIP-46 connection URI,
  route-selection, and access-surface conformance data.
- Validate feature matrices and QR review transcript fixtures.
- Keep companion tests aligned with Raspberry, ESP32, smartcard, and hardware
  contracts.

## Example

```ts nsealr-readme-example
import assert from "node:assert/strict";
import { loadSpecsFixtures, resolveSpecsRoot } from "@nsealr/fixtures";

const fixtures = loadSpecsFixtures(resolveSpecsRoot("../specs"));

assert(fixtures.events.length > 0);
assert(fixtures.invalidVectors.length > 0);
```

## Boundary

This package is for tests, fixture verification, and conformance tooling. It
does not define production signer behavior and must not become a private-key
store.
