import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes, verifySchnorrSignature, type VerificationResult } from "../../core/src/nostr.js";
import { publicKeyFromSecret } from "../../dev-signer/src/dev-signer.js";

export const NOSTRSEAL_CLA = 0x80;
export const GET_PUBLIC_KEY_INS = 0x10;
export const SIGN_EVENT_ID_INS = 0x20;
export const SW_NO_ERROR = 0x9000;
export const SW_WRONG_LENGTH = 0x6700;
export const SW_CLA_NOT_SUPPORTED = 0x6e00;
export const SW_INS_NOT_SUPPORTED = 0x6d00;

function assertByte(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`${name} must fit in one byte`);
  }
}

function statusWordToBytes(statusWord: number): Uint8Array {
  return Uint8Array.of((statusWord >> 8) & 0xff, statusWord & 0xff);
}

export class CommandApdu {
  constructor(
    readonly cla: number,
    readonly ins: number,
    readonly p1 = 0,
    readonly p2 = 0,
    readonly data = new Uint8Array(),
    readonly le?: number
  ) {}

  static fromBytes(raw: Uint8Array): CommandApdu {
    if (raw.length < 4) throw new Error("command APDU must contain at least four header bytes");
    const [cla, ins, p1, p2] = raw;
    const rest = raw.slice(4);
    if (rest.length === 0) return new CommandApdu(cla, ins, p1, p2);
    const lc = rest[0];
    if (rest.length === 1) return new CommandApdu(cla, ins, p1, p2, new Uint8Array(), lc);
    if (rest.length < 1 + lc) throw new Error("command APDU data is shorter than Lc");
    const data = rest.slice(1, 1 + lc);
    const tail = rest.slice(1 + lc);
    if (tail.length > 1) throw new Error("short APDU supports at most one Le byte");
    return new CommandApdu(cla, ins, p1, p2, data, tail.length === 1 ? tail[0] : undefined);
  }

  static fromHex(hex: string): CommandApdu {
    return CommandApdu.fromBytes(hexToBytes(hex));
  }

  toBytes(): Uint8Array {
    for (const [name, value] of [
      ["cla", this.cla],
      ["ins", this.ins],
      ["p1", this.p1],
      ["p2", this.p2]
    ] as const) {
      assertByte(value, name);
    }
    if (this.data.length > 255) throw new Error("short APDU data cannot exceed 255 bytes");
    const body = this.data.length > 0 ? [this.data.length, ...this.data] : [];
    const le = this.le === undefined ? [] : [this.le];
    return Uint8Array.from([this.cla, this.ins, this.p1, this.p2, ...body, ...le]);
  }

  toHex(): string {
    return bytesToHex(this.toBytes());
  }
}

export class ResponseApdu {
  constructor(readonly data = new Uint8Array(), readonly statusWord = SW_NO_ERROR) {}

  static fromBytes(raw: Uint8Array): ResponseApdu {
    if (raw.length < 2) throw new Error("response APDU must contain a status word");
    const statusWord = (raw[raw.length - 2] << 8) | raw[raw.length - 1];
    return new ResponseApdu(raw.slice(0, -2), statusWord);
  }

  static fromHex(hex: string): ResponseApdu {
    return ResponseApdu.fromBytes(hexToBytes(hex));
  }

  toBytes(): Uint8Array {
    return Uint8Array.from([...this.data, ...statusWordToBytes(this.statusWord)]);
  }

  toHex(): string {
    return bytesToHex(this.toBytes());
  }

  statusWordHex(): string {
    return this.statusWord.toString(16).padStart(4, "0");
  }
}

export class SmartcardSimulator {
  constructor(private readonly secretKeyHex: string) {}

  async exchange(command: CommandApdu): Promise<ResponseApdu> {
    if (command.cla !== NOSTRSEAL_CLA) return new ResponseApdu(new Uint8Array(), SW_CLA_NOT_SUPPORTED);
    if (command.ins === GET_PUBLIC_KEY_INS) {
      if (command.data.length !== 0) return new ResponseApdu(new Uint8Array(), SW_WRONG_LENGTH);
      return new ResponseApdu(Uint8Array.from(hexToBytes(publicKeyFromSecret(this.secretKeyHex))), SW_NO_ERROR);
    }
    if (command.ins === SIGN_EVENT_ID_INS) {
      if (command.data.length !== 32) return new ResponseApdu(new Uint8Array(), SW_WRONG_LENGTH);
      const signature = schnorr.sign(command.data, hexToBytes(this.secretKeyHex), new Uint8Array(32));
      return new ResponseApdu(Uint8Array.from(signature), SW_NO_ERROR);
    }
    return new ResponseApdu(new Uint8Array(), SW_INS_NOT_SUPPORTED);
  }

  async verifySignEventIdResponse(command: CommandApdu, response: ResponseApdu): Promise<VerificationResult> {
    if (command.ins !== SIGN_EVENT_ID_INS || command.data.length !== 32) {
      return { ok: false, error: "command is not a sign_event_id APDU" };
    }
    if (response.statusWord !== SW_NO_ERROR || response.data.length !== 64) {
      return { ok: false, error: "response is not a successful Schnorr signature APDU" };
    }
    const pubkey = publicKeyFromSecret(this.secretKeyHex);
    const eventId = bytesToHex(command.data);
    const signature = bytesToHex(response.data);
    if (!verifySchnorrSignature(pubkey, eventId, signature)) {
      return { ok: false, error: "smartcard Schnorr signature is invalid" };
    }
    return { ok: true };
  }
}
