# @nsealr/protocol

Shared nSealr request, response, capability, signing-status, and resource-limit
validation.

## Purpose

- Validate nSealr v0 request and response shapes.
- Centralize host-side copies of constrained-signer implementation limits.
- Reject unsafe `sign_event` templates before transport or signer routing.
- Validate capability and signing-status diagnostics.

## Boundary

These limits are nSealr v0 safety limits, not Nostr protocol limits. This
package does not perform signing and must be used before any companion access
surface contacts a signer route.

