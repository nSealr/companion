# SDK Examples

Executable SDK examples live in private workspace app `@nsealr/sdk-examples`.
They are CI guards for public package usage, not production signer code.

Run them with:

```sh
make examples-smoke
```

The examples import public packages through their package entrypoints after
`dist` artifacts are built. They cover:

- request validation, response validation, event-id computation, signed-output
  verification, and static QR envelope round-trip;
- local companion service status, pairing-intent creation, authorized request
  validation, and authorized response verification;
- browser-provider `getPublicKey` and refused `signEvent` behavior over an
  injected backend;
- already-decrypted NIP-46 bridge decisions for permitted and denied requests.

The examples must stay secretless. They may use deterministic signed fixture
values, but they must not import `@nsealr/dev-signer`, create production
private keys, persist grants, open relays, or dispatch to real signer
transports.
