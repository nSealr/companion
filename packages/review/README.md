# @nsealr/review

Deterministic review projections for nSealr signing requests.

## Purpose

- Produce host-side review summaries from event templates.
- Produce digest-bound screen and detail-page data used by conformance tests.
- Keep review rendering behavior consistent across companion, Raspberry, ESP32,
  and smartcard-adjacent flows.

## Boundary

Companion review output is not a trusted approval surface. Trusted review must
happen on the signer hardware or on the appropriate external review surface for
display-less routes.

