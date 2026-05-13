# @nsealr/smartcard

Smartcard APDU codec, simulator, PC/SC boundary, and display-less signer helper.

## Purpose

- Encode and decode nSealr smartcard APDUs.
- Simulate `GET_PUBLIC_KEY` and `SIGN_EVENT_ID` for conformance tests.
- Normalize PC/SC reader and APDU transmit failures.
- Bind display-less signing to an externally acknowledged review digest.

## Boundary

Smartcards are display-less in the current model. This package must not claim
trusted event review by itself. It does not store keys in companion and does not
bypass shared request validation or response verification.

