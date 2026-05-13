# @nsealr/client

Local companion service protocol and client wrappers.

## Purpose

- Encode and decode native-messaging frames.
- Validate local service requests and responses.
- Provide a high-level client wrapper for future browser, SDK, desktop, and CLI
  callers.
- Enforce explicit client identity, request-id correlation, and deterministic
  malformed-response rejection.

## Boundary

The local service boundary is secretless. It currently supports status, pairing
intent generation, request validation, and response verification. It does not
store production keys, persist grants, select routes, open relays, or dispatch
to real signer transports.

