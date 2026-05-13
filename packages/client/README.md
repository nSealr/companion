# @nsealr/client

Local companion service protocol and client wrappers.

## Purpose

- Encode and decode native-messaging frames.
- Validate local service requests and responses.
- Provide a high-level client wrapper for future browser, SDK, desktop, and CLI
  callers.
- Enforce explicit client identity, request-id correlation, and deterministic
  malformed-response rejection.

## Example

```ts nsealr-readme-example
import assert from "node:assert/strict";
import { LocalServiceClient, approvePairingIntent, handleLocalServiceRequest } from "@nsealr/client";

const client = new LocalServiceClient({
  exchange: (message) => handleLocalServiceRequest(message, { now: 1_710_000_000 })
});

const status = await client.serviceStatus("readme-client-status");
const pairing = await client.requestPairing({
  surface: "sdk",
  origin: "sdk:readme",
  app_name: "README client"
}, ["validate_signer_request"], "readme-client-pair");

assert.equal(status.ok, true);
if (pairing.ok !== true || !("pairing_intent" in pairing.result)) {
  throw new Error("pairing intent missing");
}
assert.equal(approvePairingIntent(pairing.result.pairing_intent, {
  approvedAt: 1_710_000_000
}).stores_production_secrets, false);
```

## Boundary

The local service boundary is secretless. It currently supports status, pairing
intent generation, explicit manual approval into an in-memory grant, request
validation, secretless route selection, and response verification. It does not
store production keys, persist grants, open relays, or dispatch to real signer
transports.
