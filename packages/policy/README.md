# @nsealr/policy

Secretless account, route, grant, policy-change, and policy-decision
descriptors.

## Purpose

- Parse account, route, policy-profile, and grant descriptors.
- Reject embedded production private-key material.
- Reject QR-vault automation, wildcard/decrypt/export grants, and invalid
  grant targets.
- Parse policy-change proposals and render deterministic review pages plus an
  approval digest for device-approved `set_policy` changes.
- Parse route-selection requests, select secretless account-route metadata for
  supported methods, and parse `nsealr-route-selection-v0` responses without
  dispatching signer I/O.
- Evaluate pure policy-decision vectors for conformance tests.

## Example

```ts nsealr-readme-example
import assert from "node:assert/strict";
import {
  decidePolicyRequest,
  parsePolicyDecisionRequest,
  parsePolicyProfile,
  reviewPolicyChangeProposal
} from "@nsealr/policy";

const policy = parsePolicyProfile({
  format: "nsealr-policy-profile-v0",
  policy_id: "policy-readme-manual",
  label: "Manual review",
  route_types: ["external_nip46"],
  mode: "manual_only",
  grants_allowed: false,
  manual_review_required: ["sign_event"],
  forbidden_permissions: ["wildcard", "export_secret"],
  risk_tiers: {
    sign_event: "manual"
  }
});

const request = parsePolicyDecisionRequest({
  account_id: "acct-readme",
  route_type: "external_nip46",
  client_pubkey: "2".repeat(64),
  permission: { method: "sign_event", parameter: "1", event_kind: 1 },
  now: 1_710_000_000,
  grant_ids: [],
  grant_usage: {},
  revoked_grant_ids: []
});

const decision = decidePolicyRequest({
  policy,
  grants: [],
  request
});

assert.equal(decision.decision, "manual_review");

const policyChangeReview = reviewPolicyChangeProposal({
  format: "nsealr-policy-change-proposal-v0",
  proposal_id: "proposal-readme-set-policy",
  account_id: "acct-readme",
  route_type: "esp32_usb_nip46",
  action: "set_policy",
  current_policy_id: "policy-manual-only-persistent-device",
  proposed_policy_id: "policy-scoped-automation-daily-use",
  proposed_grant_ids: [],
  requested_by: {
    surface: "desktop_app",
    client_pubkey: "2".repeat(64)
  },
  created_at: 1_710_000_000,
  device_review_required: true,
  physical_approval_required: true,
  companion_authoritative: false,
  contains_secret_material: false
});

assert.equal(policyChangeReview.pages.at(-1)?.action, "approve_or_reject");
```

## Boundary

Policy records are internal nSealr records, not Nostr events. Grant decisions
consume explicit per-grant usage snapshots for rate-limit checks; this package
does not store the usage history itself. Policy-change helpers create
secretless review material only; they do not approve or persist device policy.
The package does not store persistent grants or hold production mnemonics,
passphrases, `nsec` values, or decrypted signing material. Route selection
returns and validates metadata from account descriptors; it does not open
transports, create grants, or sign events.
