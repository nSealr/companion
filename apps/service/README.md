# @nsealr/service

Private native-messaging host scaffold for the nSealr local companion service.

## Purpose

- Run the length-prefixed native-messaging stdio loop used by browser hosts.
- Return deterministic malformed-frame errors instead of unstructured output.
- Generate validated Chromium and Firefox native-host manifest JSON for future
  installer work.

## Manifest Example

```sh
pnpm --filter @nsealr/service service -- --native-host-manifest chromium \
  --host-path /Applications/nSealr/nsealr-service \
  --extension-id aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

## Boundary

This app is private and secretless. It does not persist grants, store accounts,
open relays, contact signer transports, or hold production signing material.
Manifest generation only prints JSON; it does not install files into browser
native-messaging directories.
