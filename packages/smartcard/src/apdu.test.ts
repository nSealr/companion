import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { bytesToHex } from "@nsealr/core";
import { resolveSpecsRoot } from "@nsealr/fixtures";
import {
  CommandApdu,
  GET_PUBLIC_KEY_INS,
  NSEALR_CLA,
  ResponseApdu,
  SIGN_EVENT_ID_INS
} from "./apdu.js";

const specsRoot = resolveSpecsRoot();
const getPublicKeyVector = JSON.parse(readFileSync(resolve(specsRoot, "vectors/smartcard/get-public-key.json"), "utf8"));
const signEventIdVector = JSON.parse(readFileSync(resolve(specsRoot, "vectors/smartcard/sign-event-id-kind-1-basic.json"), "utf8"));
const smartcardErrorVectors = readdirSync(resolve(specsRoot, "vectors/smartcard"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(resolve(specsRoot, "vectors/smartcard", name), "utf8")) as {
    name: string;
    expected_status_word?: string;
    response_hex?: string;
  })
  .filter((vector) => vector.expected_status_word !== undefined && vector.expected_status_word !== "9000");

describe("smartcard APDU adapter", () => {
  it("encodes and decodes short command APDUs from shared vectors", () => {
    const command = CommandApdu.fromHex(signEventIdVector.command_hex);

    expect(command.cla).toBe(NSEALR_CLA);
    expect(command.ins).toBe(SIGN_EVENT_ID_INS);
    expect(command.data.length).toBe(32);
    expect(command.toHex()).toBe(signEventIdVector.command_hex);
  });

  it("rejects non-integer command header bytes deterministically", () => {
    expect(() => new CommandApdu(0.5, SIGN_EVENT_ID_INS).toBytes()).toThrow(/cla must be an integer byte/u);
    expect(() => new CommandApdu(true as unknown as number, SIGN_EVENT_ID_INS).toBytes()).toThrow(
      /cla must be an integer byte/u
    );
  });

  it("rejects invalid short APDU command payloads deterministically", () => {
    expect(() => new CommandApdu(NSEALR_CLA, SIGN_EVENT_ID_INS, 0, 0, new Uint8Array(256)).toBytes()).toThrow(
      /short APDU data cannot exceed 255 bytes/u
    );
    expect(() => new CommandApdu(NSEALR_CLA, SIGN_EVENT_ID_INS, 0, 0, [0] as unknown as Uint8Array).toBytes()).toThrow(
      /command APDU data must be a Uint8Array/u
    );
    expect(() => new CommandApdu(NSEALR_CLA, SIGN_EVENT_ID_INS, 0, 0, new Uint8Array(), 0.5).toBytes()).toThrow(
      /le must be an integer byte/u
    );
    expect(() => CommandApdu.fromBytes([NSEALR_CLA, SIGN_EVENT_ID_INS, 0, 0] as unknown as Uint8Array)).toThrow(
      /command APDU must be a Uint8Array/u
    );
  });

  it("decodes response APDUs from shared get_public_key vector", () => {
    const response = ResponseApdu.fromHex(getPublicKeyVector.response_hex);

    expect(bytesToHex(response.data)).toBe(getPublicKeyVector.response_data_hex);
    expect(response.statusWordHex()).toBe(getPublicKeyVector.status_word);
    expect(response.toHex()).toBe(getPublicKeyVector.response_hex);
  });

  it("rejects invalid response APDU payloads and status words deterministically", () => {
    expect(() => new ResponseApdu([0] as unknown as Uint8Array).toBytes()).toThrow(
      /response APDU data must be a Uint8Array/u
    );
    expect(() => new ResponseApdu(new Uint8Array(), true as unknown as number).toBytes()).toThrow(
      /status word must be an integer word/u
    );
    expect(() => new ResponseApdu(new Uint8Array(), 0x10000).toBytes()).toThrow(
      /status word must fit in two bytes/u
    );
    expect(() => ResponseApdu.fromBytes([0x90, 0x00] as unknown as Uint8Array)).toThrow(
      /response APDU must be a Uint8Array/u
    );
  });

  it("decodes shared APDU rejection status vectors", () => {
    expect(smartcardErrorVectors.length).toBeGreaterThanOrEqual(7);
    for (const vector of smartcardErrorVectors) {
      const responseHex = vector.response_hex;
      if (responseHex === undefined) throw new Error(`${vector.name} is missing response_hex`);
      const response = ResponseApdu.fromHex(responseHex);

      expect(response.statusWordHex()).toBe(vector.expected_status_word);
      expect(response.toHex()).toBe(responseHex);
    }
  });
});
