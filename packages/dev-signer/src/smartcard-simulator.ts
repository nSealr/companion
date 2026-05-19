import { schnorr } from "@noble/curves/secp256k1.js";
import {
  bytesToHex,
  hexToBytes,
  verifySchnorrSignature,
  type VerificationResult
} from "@nsealr/core";
import {
  CommandApdu,
  GET_PUBLIC_KEY_INS,
  NSEALR_CLA,
  ResponseApdu,
  SIGN_EVENT_ID_INS,
  SW_CLA_NOT_SUPPORTED,
  SW_INCORRECT_P1P2,
  SW_INS_NOT_SUPPORTED,
  SW_NO_ERROR,
  SW_WRONG_LENGTH
} from "@nsealr/smartcard";

export class SmartcardSimulator {
  constructor(private readonly secretKeyHex: string) {}

  async exchange(command: CommandApdu): Promise<ResponseApdu> {
    if (command.cla !== NSEALR_CLA) return new ResponseApdu(new Uint8Array(), SW_CLA_NOT_SUPPORTED);
    if (command.ins === GET_PUBLIC_KEY_INS) {
      if (command.p1 !== 0 || command.p2 !== 0) return new ResponseApdu(new Uint8Array(), SW_INCORRECT_P1P2);
      if (command.data.length !== 0 || command.le !== undefined) return new ResponseApdu(new Uint8Array(), SW_WRONG_LENGTH);
      return new ResponseApdu(Uint8Array.from(hexToBytes(simulatorPublicKeyFromSecret(this.secretKeyHex))), SW_NO_ERROR);
    }
    if (command.ins === SIGN_EVENT_ID_INS) {
      if (command.p1 !== 0 || command.p2 !== 0) return new ResponseApdu(new Uint8Array(), SW_INCORRECT_P1P2);
      if (command.data.length !== 32 || command.le !== undefined) return new ResponseApdu(new Uint8Array(), SW_WRONG_LENGTH);
      const signature = schnorr.sign(command.data, hexToBytes(this.secretKeyHex), new Uint8Array(32));
      return new ResponseApdu(Uint8Array.from(signature), SW_NO_ERROR);
    }
    return new ResponseApdu(new Uint8Array(), SW_INS_NOT_SUPPORTED);
  }

  async verifySignEventIdResponse(command: CommandApdu, response: ResponseApdu): Promise<VerificationResult> {
    if (
      command.ins !== SIGN_EVENT_ID_INS ||
      command.p1 !== 0 ||
      command.p2 !== 0 ||
      command.le !== undefined ||
      command.data.length !== 32
    ) {
      return { ok: false, error: "command is not a sign_event_id APDU" };
    }
    if (response.statusWord !== SW_NO_ERROR || response.data.length !== 64) {
      return { ok: false, error: "response is not a successful Schnorr signature APDU" };
    }
    const pubkey = simulatorPublicKeyFromSecret(this.secretKeyHex);
    const eventId = bytesToHex(command.data);
    const signature = bytesToHex(response.data);
    if (!verifySchnorrSignature(pubkey, eventId, signature)) {
      return { ok: false, error: "smartcard Schnorr signature is invalid" };
    }
    return { ok: true };
  }
}

function simulatorPublicKeyFromSecret(secretKeyHex: string): string {
  return bytesToHex(schnorr.getPublicKey(hexToBytes(secretKeyHex)));
}
