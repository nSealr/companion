# @nsealr/service

Private native-messaging host scaffold for the nSealr local companion service.

## Purpose

- Run the length-prefixed native-messaging stdio loop used by browser hosts.
- Return deterministic malformed-frame errors instead of unstructured output.
- Carry grant-gated local-service requests, including deterministic
  `signer_route_unavailable` dispatch refusal when no reviewed signer driver is
  configured.
- Render validated Chromium and Firefox native-host manifest JSON from the
  shared `@nsealr/client` manifest contract for future installer work.

## Manifest Example

```sh
pnpm --filter @nsealr/service service -- --native-host-manifest chromium \
  --host-path /Applications/nSealr/nsealr-service \
  --extension-id aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

## Explicit Context Example

```sh
pnpm --filter @nsealr/service service -- \
  --grant-store ./local-grants.json \
  --account-store ./local-accounts.json
```

Context files are loaded only from explicit paths. The service validates the
secretless grant-store and account-store formats before entering the stdio loop.
They may authorize route selection, request validation, response verification,
or dispatch refusal, but they do not configure a signer driver. The service
never writes those files, chooses a default storage location, or approves a
client by loading a file.

## Boundary

This app is private and secretless. It does not persist grants, write account
stores, open relays, contact signer transports, configure signer drivers, or
hold production signing material. Manifest generation only prints JSON; it does
not install files into browser native-messaging directories. File-backed
context loading is an explicit read-only developer and integration harness
until approval UX, storage location review, native-host installation, and
route-specific signer drivers are specified.
