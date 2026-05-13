# @nsealr/dev-signer

Private test-only software signer for companion development.

## Purpose

- Produce deterministic signed responses in tests and local harnesses.
- Exercise transport and response-verification code without hardware.

## Boundary

This package is private and must never become a production signing route. Public
packages must not depend on it. Production private keys, mnemonics,
passphrases, and `nsec` values do not belong here.

