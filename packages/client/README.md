# @nsealr/client

Local companion service protocol and client wrappers.

## Purpose

- Encode and decode native-messaging frames.
- Build validated Chromium and Firefox native-host manifest objects from
  explicit host path and extension-id inputs.
- Validate local service requests and responses.
- Provide a high-level client wrapper for future browser, SDK, desktop, and CLI
  callers.
- Enforce explicit client identity parsing, request-id correlation, and
  deterministic malformed-response rejection.
- Expose `@nsealr/client/client-identity` as the browser-safe subpath for
  access surfaces that need identity parsing without importing Node-only
  native-messaging or service helpers.

## Example

```ts nsealr-readme-example
import assert from "node:assert/strict";
import {
  LocalServiceClient,
  NATIVE_HOST_NAME,
  appendLocalGrantRevocation,
  approvePairingIntent,
  buildNativeHostManifest,
  createLocalGrantStore,
  handleLocalServiceRequest,
  parseLocalClientIdentity,
  reviewPairingIntent
} from "@nsealr/client";

const identity = parseLocalClientIdentity({
  surface: "sdk",
  origin: "sdk:readme",
  app_name: "README client"
});
const client = new LocalServiceClient({
  exchange: (message) => handleLocalServiceRequest(message, { now: 1_710_000_000 })
});

const status = await client.serviceStatus("readme-client-status");
const pairing = await client.requestPairing(identity, ["validate_signer_request"], "readme-client-pair");
const nativeHostManifest = buildNativeHostManifest({
  browser: "firefox",
  hostPath: "/Applications/nSealr/nsealr-service",
  extensionIds: ["extension@nsealr.dev"]
});

assert.equal(status.ok, true);
assert.equal(nativeHostManifest.name, NATIVE_HOST_NAME);
if (pairing.ok !== true || !("pairing_intent" in pairing.result)) {
  throw new Error("pairing intent missing");
}
const approval = approvePairingIntent(pairing.result.pairing_intent, {
  approvedAt: 1_710_000_000,
  expiresAt: 1_710_086_400
});
assert.equal(reviewPairingIntent(pairing.result.pairing_intent).requires_user_approval, true);
assert.equal(approval.stores_production_secrets, false);
const grantStore = createLocalGrantStore([approval.grant], {
  updatedAt: 1_710_000_000
});
assert.equal(grantStore.contains_secret_material, false);
assert.equal(appendLocalGrantRevocation(grantStore, {
  clientId: approval.grant.client_id,
  origin: approval.grant.origin,
  surface: approval.grant.surface
}, {
  revokedAt: 1_710_000_100
}).grants.at(-1)?.revoked, true);
```

## Boundary

The local service boundary is secretless. It currently supports status, pairing
intent generation, deterministic pairing-review projection, explicit manual
approval into a grant, request validation, secretless route selection, response
verification, and a strict JSON grant-store contract for persisting
approved/revoked local client grants without destructive history edits.
It does not store production keys, open relays, or dispatch to real signer
transports. A host app still has to own the actual file location, backup
policy, and user approval UX.
The package can build native-host manifest objects, but it does not install
them or choose a host file location.
