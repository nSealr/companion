# @nsealr/policy

Secretless account, route, grant, and policy-decision descriptors.

## Purpose

- Parse account, route, policy-profile, and grant descriptors.
- Reject embedded production private-key material.
- Reject QR-vault automation, wildcard/decrypt/export grants, and invalid
  grant targets.
- Parse and select secretless account-route metadata for supported methods
  without dispatching signer I/O.
- Evaluate pure policy-decision vectors for conformance tests.

## Example

```ts nsealr-readme-example
import assert from "node:assert/strict";
import { decidePolicyRequest, parsePolicyProfile } from "@nsealr/policy";

const policy = parsePolicyProfile({
  format: "nsealr-policy-profile-v0",
  policy_id: "policy-readme-manual",
  label: "Manual review",
  route_types: ["raspberry_qr_vault"],
  mode: "manual_only",
  grants_allowed: false,
  manual_review_required: ["sign_event"],
  forbidden_permissions: ["wildcard", "export_secret"],
  risk_tiers: {
    sign_event: "manual"
  }
});

const decision = decidePolicyRequest({
  policy,
  grants: [],
  request: {
    account_id: "acct-readme",
    route_type: "raspberry_qr_vault",
    client_pubkey: "2".repeat(64),
    permission: { method: "sign_event", parameter: "1", event_kind: 1 },
    now: 1_710_000_000,
    grant_ids: [],
    revoked_grant_ids: []
  }
});

assert.equal(decision.decision, "manual_review");
```

## Boundary

Policy records are internal nSealr records, not Nostr events. This package does
not store persistent grants, approve device policy changes, or hold production
mnemonics, passphrases, `nsec` values, or decrypted signing material. Route
selection returns metadata from account descriptors; it does not open
transports, create grants, or sign events.
