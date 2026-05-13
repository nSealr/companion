# @nsealr/browser-provider

NIP-07 provider adapter for future nSealr browser-extension packaging.

## Purpose

- Expose `getPublicKey` and `signEvent` behavior over an injected companion
  backend.
- Bind every call to explicit client identity.
- Convert event templates into nSealr signer requests.
- Verify signed responses before returning them to `window.nostr` callers.

## Example

```ts nsealr-readme-example
import assert from "node:assert/strict";
import { createNip07Provider } from "@nsealr/browser-provider";

const publicKey = "3".repeat(64);
const provider = createNip07Provider({
  client: {
    surface: "browser_extension",
    origin: "https://example.com",
    app_name: "Example client"
  },
  backend: {
    getPublicKey: async () => publicKey,
    signEventRequest: async (request) => ({
      version: 1,
      request_id: request.request_id,
      ok: false,
      error: {
        code: "signing_disabled",
        message: "No signer connected",
        retryable: false
      }
    })
  },
  nextRequestId: () => "readme-provider-sign"
});

assert.equal(await provider.getPublicKey(), publicKey);
await assert.rejects(
  provider.signEvent({
    created_at: 1_710_000_000,
    kind: 1,
    tags: [],
    content: "provider request"
  }),
  /No signer connected/u
);
```

## Boundary

This package is not a browser extension by itself. It stores no browser-side
production keys, implements no local signing, persists no grants, and does not
implement NIP-04, NIP-44, relay sessions, or native-host installation.
