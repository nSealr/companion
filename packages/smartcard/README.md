# @nsealr/smartcard

Smartcard APDU codec, simulator, PC/SC boundary, and display-less signer helper.

## Purpose

- Encode and decode nSealr smartcard APDUs.
- Simulate `GET_PUBLIC_KEY` and `SIGN_EVENT_ID` for conformance tests.
- Normalize PC/SC reader and APDU transmit failures.
- Bind display-less signing to an externally acknowledged review digest.

## Example

```ts nsealr-readme-example
import assert from "node:assert/strict";
import {
  CommandApdu,
  GET_PUBLIC_KEY_INS,
  NSEALR_CLA,
  ResponseApdu,
  SW_NO_ERROR
} from "@nsealr/smartcard";

const command = new CommandApdu(NSEALR_CLA, GET_PUBLIC_KEY_INS);
const response = new ResponseApdu(Uint8Array.of(1, 2, 3), SW_NO_ERROR);

assert.equal(CommandApdu.fromHex(command.toHex()).ins, GET_PUBLIC_KEY_INS);
assert.equal(ResponseApdu.fromHex(response.toHex()).statusWord, SW_NO_ERROR);
```

## Boundary

Smartcards are display-less in the current model. This package must not claim
trusted event review by itself. It does not store keys in companion and does not
bypass shared request validation or response verification.
