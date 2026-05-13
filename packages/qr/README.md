# @nsealr/qr

Static and animated QR envelope helpers for nSealr requests and responses.

## Purpose

- Encode and decode v0 `nsealr1:` static QR envelopes.
- Encode and decode v0 `nsealr1a:` animated QR frame sets.
- Enforce shared QR byte limits, frame digests, frame checksums, and malformed
  payload rejection before JSON parsing.

## Boundary

This package transports already-validated payloads. It does not store secrets,
perform signing, compress payloads, use fountain codes, or define signer policy.

