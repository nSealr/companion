import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hexToBytes } from "../../core/src/nostr.js";
import { resolveSpecsRoot } from "../../fixtures/src/specs-root.js";
import { CommandApdu, ResponseApdu } from "./apdu.js";
import { PcscApduTransport, PcscUnavailableError, type PcscConnection } from "./pcsc.js";

const specsRoot = resolveSpecsRoot();
const getPublicKeyVector = JSON.parse(readFileSync(resolve(specsRoot, "vectors/smartcard/get-public-key.json"), "utf8"));

class FakePcscConnection implements PcscConnection {
  connected = false;
  transmitted?: Uint8Array;

  constructor(private readonly response: { data: Uint8Array; sw1: number; sw2: number }) {}

  async connect(): Promise<void> {
    this.connected = true;
  }

  async transmit(command: Uint8Array): Promise<{ data: Uint8Array; sw1: number; sw2: number }> {
    this.transmitted = command;
    return this.response;
  }
}

describe("PC/SC smartcard transport boundary", () => {
  it("exchanges short APDUs through a connected PC/SC-style connection", async () => {
    const command = CommandApdu.fromHex(getPublicKeyVector.command_hex);
    const connection = new FakePcscConnection({
      data: Uint8Array.from(hexToBytes(getPublicKeyVector.response_data_hex)),
      sw1: 0x90,
      sw2: 0x00
    });

    const transport = await PcscApduTransport.fromFirstReader(async () => [
      {
        connect: async () => connection
      }
    ]);
    const response = await transport.exchange(command);

    expect(connection.connected).toBe(true);
    expect(connection.transmitted).toEqual(command.toBytes());
    expect(response).toEqual(ResponseApdu.fromHex(getPublicKeyVector.response_hex));
  });

  it("fails clearly when no PC/SC reader is available", async () => {
    await expect(PcscApduTransport.fromFirstReader(async () => [])).rejects.toThrow(PcscUnavailableError);
    await expect(PcscApduTransport.fromFirstReader(async () => [])).rejects.toThrow(/no PC\/SC smartcard readers/u);
  });
});
