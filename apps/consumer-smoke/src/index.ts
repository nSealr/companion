import assert from "node:assert/strict";

const publicPackages = [
  "@nsealr/browser-provider",
  "@nsealr/client",
  "@nsealr/core",
  "@nsealr/fixtures",
  "@nsealr/framing",
  "@nsealr/nip46",
  "@nsealr/policy",
  "@nsealr/protocol",
  "@nsealr/qr",
  "@nsealr/review",
  "@nsealr/sdk",
  "@nsealr/smartcard",
  "@nsealr/transport"
] as const;

for (const packageName of publicPackages) {
  const module = await import(packageName);
  assert(Object.keys(module).length > 0, `${packageName} must expose a public entrypoint`);
}

const protocol = await import("@nsealr/protocol");
const core = await import("@nsealr/core");
const browserProvider = await import("@nsealr/browser-provider");
const clientIdentity = await import("@nsealr/client/client-identity");
const sdk = await import("@nsealr/sdk");

assert.equal(protocol.validateRequest({
  version: 1,
  request_id: "consumer-smoke-get-public-key",
  method: "get_public_key"
}).ok, true);

assert.equal(core.computeEventId({
  pubkey: "0".repeat(64),
  created_at: 1,
  kind: 1,
  tags: [],
  content: "consumer smoke"
}).length, 64);

assert.equal(clientIdentity.parseLocalClientIdentity({
  surface: "browser_extension",
  origin: "https://example.com",
  app_name: "Package Consumer Smoke",
  instance_id: "consumer-smoke"
}).origin, "https://example.com");

const provider = browserProvider.createNip07Provider({
  client: {
    surface: "browser_extension",
    origin: "https://example.com",
    app_name: "Package Consumer Smoke",
    instance_id: "consumer-smoke"
  },
  backend: {
    getPublicKey: async () => "1".repeat(64),
    signEventRequest: async () => {
      throw new Error("consumer smoke must not contact a signer");
    }
  }
});
assert.equal(await provider.getPublicKey(), "1".repeat(64));
assert.equal(sdk.protocol.validateRequest({
  version: 1,
  request_id: "consumer-smoke-sdk-get-public-key",
  method: "get_public_key"
}).ok, true);
assert.equal(sdk.core.computeEventId({
  pubkey: "0".repeat(64),
  created_at: 1,
  kind: 1,
  tags: [],
  content: "consumer smoke sdk"
}).length, 64);

console.log("nSealr package consumer smoke passed");
