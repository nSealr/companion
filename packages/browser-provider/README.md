# @nsealr/browser-provider

NIP-07 provider adapter for future nSealr browser-extension packaging.

## Purpose

- Expose `getPublicKey` and `signEvent` behavior over an injected companion
  backend.
- Bind every call to explicit client identity.
- Convert event templates into nSealr signer requests.
- Verify signed responses before returning them to `window.nostr` callers.

## Boundary

This package is not a browser extension by itself. It stores no browser-side
production keys, implements no local signing, persists no grants, and does not
implement NIP-04, NIP-44, relay sessions, or native-host installation.

