# @nsealr/sdk

Platform-neutral facade over the browser-safe and host-neutral nSealr companion
packages.

## Boundary

- Export curated package namespaces for app, browser-extension, and companion
  integrations.
- Keep `@nsealr/dev-signer` out of the public SDK surface.
- Keep Node-only fixture loading and host transport adapters in their own
  packages instead of importing them through this facade.
- Store no production keys, mnemonics, passphrases, grants, or browser-side
  signing material.

```ts nsealr-readme-example
import assert from "node:assert/strict";
import { browserProvider, client, protocol } from "@nsealr/sdk";

const identity = client.parseLocalClientIdentity({
  surface: "browser_extension",
  origin: "https://example.com",
  app_name: "README SDK Example",
  instance_id: "readme-sdk"
});

const provider = browserProvider.createNip07Provider({
  client: identity,
  backend: {
    getPublicKey: async () => "1".repeat(64),
    signEventRequest: async () => {
      throw new Error("README example does not dispatch signer I/O");
    }
  },
  nextRequestId: () => "readme-sdk-sign"
});

assert.equal(await provider.getPublicKey(), "1".repeat(64));
assert.equal(protocol.validateRequest({
  version: 1,
  request_id: "readme-sdk-request",
  method: "get_public_key"
}).ok, true);
```
