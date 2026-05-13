# SDK Examples

Executable SDK examples live in private workspace app `@nsealr/sdk-examples`.
They are CI guards for public package usage, not production signer code.

Run them with:

```sh
make examples-smoke
```

The examples import public packages through their package entrypoints after
`dist` artifacts are built. The examples import every publishable public
package and cover:

- request validation, response validation, event-id computation, signed-output
  verification, and static QR envelope round-trip;
- shared fixture loading, policy descriptor parsing, pure policy decisions,
  review detail-page rendering, approval-digest calculation, and serial-frame
  round-trip;
- local companion service status, pairing-intent creation, secretless
  grant-store serialization/revocation, authorized request validation, and
  authorized response verification;
- browser-provider `getPublicKey` and refused `signEvent` behavior over an
  injected backend;
- already-decrypted NIP-46 bridge decisions for permitted and denied requests;
- smartcard APDU command/response round-trip and package-owned serial-line
  exchange against an in-memory port that returns `signing_disabled`.

The examples must stay secretless. They may use deterministic signed fixture
values, but they must not import `@nsealr/dev-signer`, create production
private keys, write a grant database, open relays, or dispatch to real signer
transports. In-memory grant-store examples may serialize the public approval
metadata contract, but they must not create production local-service state.

Package README snippets are a separate public-doc gate. Mark runnable snippets
with `nsealr-readme-example` and verify them with:

```sh
make readme-examples
```

README snippets are extracted from publishable package READMEs and executed
against built package entrypoints.
