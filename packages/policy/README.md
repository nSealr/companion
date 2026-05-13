# @nsealr/policy

Secretless account, route, grant, and policy-decision descriptors.

## Purpose

- Parse account, route, policy-profile, and grant descriptors.
- Reject embedded production private-key material.
- Reject QR-vault automation, wildcard/decrypt/export grants, and invalid
  grant targets.
- Evaluate pure policy-decision vectors for conformance tests.

## Boundary

Policy records are internal nSealr records, not Nostr events. This package does
not store persistent grants, approve device policy changes, or hold production
mnemonics, passphrases, `nsec` values, or decrypted signing material.

