# @nsealr/transport

Secretless signer transport contracts and adapters.

## Purpose

- Define host-side signer transport interfaces.
- Provide JSON file, JSON-lines stdio, serial-frame, and serial-line helpers.
- Verify successful `sign_event` responses before returning them to callers.

## Boundary

Production transport code must not depend on software signing helpers and must
not store production signing material. Test-only signing transport lives in
private `@nsealr/dev-signer`.

