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

  it("decodes response APDUs from shared get_public_key vector", () => {
    const response = ResponseApdu.fromHex(getPublicKeyVector.response_hex);

    expect(bytesToHex(response.data)).toBe(getPublicKeyVector.response_data_hex);
    expect(response.statusWordHex()).toBe(getPublicKeyVector.status_word);
    expect(response.toHex()).toBe(getPublicKeyVector.response_hex);
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
