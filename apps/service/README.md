# @nsealr/service

Private native-messaging host scaffold for the nSealr local companion service.

## Purpose

- Run the length-prefixed native-messaging stdio loop used by browser hosts.
- Return deterministic malformed-frame errors instead of unstructured output.
- Carry grant-gated local-service requests, including deterministic
  `signer_route_unavailable` dispatch refusal when no reviewed signer driver is
  configured.
- Await package-owned async local-service dispatch so future reviewed signer
  drivers can use asynchronous I/O without changing the native-messaging
  framing contract.
- Load explicit secretless route-driver stores for reviewed host-owned drivers.
  The first supported driver is exact account/route/USB serial-line dispatch.
- Normalize serial-line driver open, timeout, protocol, I/O, close, and
  fallback failures into deterministic local-service transport error codes.
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
  --account-store ./local-accounts.json \
  --route-driver-store ./local-route-drivers.json
```

Context files are loaded only from explicit paths. The service validates the
secretless grant-store and account-store formats before entering the stdio loop.
They may authorize route selection, request validation, response verification,
or dispatch. Route-driver stores must also be explicit, secretless, and exact:
each serial-line driver names `account_id`, `route_type`, `transport: "usb"`,
and a local serial path. The service never writes those files, chooses a
default storage location, or approves a client by loading a file.

A route-driver store uses this shape:

```json
{
  "format": "nsealr-service-route-driver-store-v0",
  "updated_at": 1900000000,
  "contains_secret_material": false,
  "routes": [
    {
      "account_id": "acct-esp32-usb-slot-0",
      "route_type": "esp32_usb_nip46",
      "transport": "usb",
      "driver": "serial_line",
      "serial_line": {
        "path": "/dev/cu.usbmodem1101",
        "response_timeout_ms": 30000
      }
    }
  ]
}
```

Route-driver files reject QR-vault route types, non-USB transports, empty route
sets, duplicate account/route/transport entries, unsupported fields, and secret
field names such as `nsec`, `mnemonic`, or `passphrase`.

## Boundary

This app is private and secretless. It does not persist grants, write account
stores, open relays, configure signer drivers by default, or hold production
signing material. Its async stdio path only awaits an explicitly configured
or injected dispatcher. The serial-line route driver opens only the exact path
provided in an explicit route-driver store and still relies on the device to
own trusted review, approval, and signing refusal or signing behavior. Manifest
generation only prints JSON; it does not install files into browser
native-messaging directories. File-backed context loading is an explicit
read-only developer and integration harness until approval UX, storage
location review, native-host installation, and production driver acceptance are
specified.
