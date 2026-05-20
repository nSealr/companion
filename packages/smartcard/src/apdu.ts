import { bytesToHex, hexToBytes } from "@nsealr/core";

export const NSEALR_CLA = 0x80;
export const GET_PUBLIC_KEY_INS = 0x10;
export const SIGN_EVENT_ID_INS = 0x20;
export const SW_NO_ERROR = 0x9000;
export const SW_WRONG_LENGTH = 0x6700;
export const SW_INCORRECT_P1P2 = 0x6a86;
export const SW_CLA_NOT_SUPPORTED = 0x6e00;
export const SW_INS_NOT_SUPPORTED = 0x6d00;

type ApduBytes = Uint8Array<ArrayBufferLike>;

function byte(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${name} must be an integer byte`);
  }
  if (value < 0 || value > 0xff) {
    throw new Error(`${name} must fit in one byte`);
  }
  return value;
}

function statusWord(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("status word must be an integer word");
  }
  if (value < 0 || value > 0xffff) {
    throw new Error("status word must fit in two bytes");
  }
  return value;
}

function bytes(value: unknown, name: string): ApduBytes {
  if (!(value instanceof Uint8Array)) {
    throw new Error(`${name} must be a Uint8Array`);
  }
  return value;
}

function statusWordToBytes(statusWord: number): Uint8Array {
  const word = statusWord;
  return Uint8Array.of((word >> 8) & 0xff, word & 0xff);
}

export class CommandApdu {
  constructor(
    readonly cla: number,
    readonly ins: number,
    readonly p1 = 0,
    readonly p2 = 0,
    readonly data: ApduBytes = new Uint8Array(),
    readonly le?: number
  ) {}

  static fromBytes(raw: ApduBytes): CommandApdu {
    raw = bytes(raw, "command APDU");
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
    const cla = byte(this.cla, "cla");
    const ins = byte(this.ins, "ins");
    const p1 = byte(this.p1, "p1");
    const p2 = byte(this.p2, "p2");
    const data = bytes(this.data, "command APDU data");
    if (data.length > 255) throw new Error("short APDU data cannot exceed 255 bytes");
    const body = data.length > 0 ? [data.length, ...data] : [];
    const le = this.le === undefined ? [] : [byte(this.le, "le")];
    return Uint8Array.from([cla, ins, p1, p2, ...body, ...le]);
  }

  toHex(): string {
    return bytesToHex(this.toBytes());
  }
}

export class ResponseApdu {
  constructor(readonly data: ApduBytes = new Uint8Array(), readonly statusWord = SW_NO_ERROR) {}

  static fromBytes(raw: ApduBytes): ResponseApdu {
    raw = bytes(raw, "response APDU");
    if (raw.length < 2) throw new Error("response APDU must contain a status word");
    const statusWord = (raw[raw.length - 2] << 8) | raw[raw.length - 1];
    return new ResponseApdu(raw.slice(0, -2), statusWord);
  }

  static fromHex(hex: string): ResponseApdu {
    return ResponseApdu.fromBytes(hexToBytes(hex));
  }

  toBytes(): Uint8Array {
    return Uint8Array.from([
      ...bytes(this.data, "response APDU data"),
      ...statusWordToBytes(statusWord(this.statusWord))
    ]);
  }

  toHex(): string {
    return bytesToHex(this.toBytes());
  }

  statusWordHex(): string {
    return this.statusWord.toString(16).padStart(4, "0");
  }
}
