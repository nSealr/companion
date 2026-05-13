# @nsealr/transport

Secretless signer transport contracts and adapters.

## Purpose

- Define host-side signer transport interfaces.
- Provide JSON file, JSON-lines stdio, serial-frame, and serial-line helpers.
- Verify successful `sign_event` responses before returning them to callers.

## Example

```ts nsealr-readme-example
import assert from "node:assert/strict";
import { encodeSerialFrame } from "@nsealr/framing";
import { exchangeSerialLineRequest, type SerialLinePort } from "@nsealr/transport";

const request = {
  version: 1,
  request_id: "readme-transport",
  method: "get_public_key"
};
const port: SerialLinePort = {
  async writeLine() {},
  async readLine() {
    return encodeSerialFrame({
      type: "response",
      payload: {
        version: 1,
        request_id: request.request_id,
        ok: false,
        error: {
          code: "signing_disabled",
          message: "No signer connected",
          retryable: false
        }
      }
    });
  }
};

const response = await exchangeSerialLineRequest({
  path: "memory",
  request,
  openPort: () => port,
  responseTimeoutMs: 10
});

assert.equal((response as { ok?: boolean }).ok, false);
```

## Boundary

Production transport code must not depend on software signing helpers and must
not store production signing material. Test-only signing transport lives in
private `@nsealr/dev-signer`.
