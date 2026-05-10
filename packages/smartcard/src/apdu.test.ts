import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { bytesToHex } from "../../core/src/nostr.js";
import { resolveSpecsRoot } from "../../fixtures/src/specs-root.js";
import {
  CommandApdu,
  GET_PUBLIC_KEY_INS,
  NOSTRSEAL_CLA,
  ResponseApdu,
  SIGN_EVENT_ID_INS,
  SmartcardSimulator
} from "./apdu.js";

const specsRoot = resolveSpecsRoot();
const key = JSON.parse(readFileSync(resolve(specsRoot, "vectors/keys/test-key-1.json"), "utf8")) as {
  secret_key: string;
};
const getPublicKeyVector = JSON.parse(readFileSync(resolve(specsRoot, "vectors/smartcard/get-public-key.json"), "utf8"));
const signEventIdVector = JSON.parse(readFileSync(resolve(specsRoot, "vectors/smartcard/sign-event-id-kind-1-basic.json"), "utf8"));
const smartcardErrorVectors = ["sign-event-id-wrong-length", "unsupported-cla", "unsupported-ins"].map((name) =>
  JSON.parse(readFileSync(resolve(specsRoot, `vectors/smartcard/${name}.json`), "utf8"))
);

describe("smartcard APDU adapter", () => {
  it("encodes and decodes short command APDUs from shared vectors", () => {
    const command = CommandApdu.fromHex(signEventIdVector.command_hex);

    expect(command.cla).toBe(NOSTRSEAL_CLA);
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

  it("simulates get_public_key and sign_event_id commands", async () => {
    const simulator = new SmartcardSimulator(key.secret_key);
    const pubkeyResponse = await simulator.exchange(CommandApdu.fromHex(getPublicKeyVector.command_hex));
    const signResponse = await simulator.exchange(CommandApdu.fromHex(signEventIdVector.command_hex));

    expect(pubkeyResponse.toHex()).toBe(getPublicKeyVector.response_hex);
    expect(signResponse.statusWordHex()).toBe(signEventIdVector.expected_status_word);
    expect(signResponse.data.length).toBe(signEventIdVector.expected_data_length);
    expect((await simulator.verifySignEventIdResponse(CommandApdu.fromHex(signEventIdVector.command_hex), signResponse)).ok).toBe(true);
  });

  it("simulates shared APDU rejection status vectors", async () => {
    const simulator = new SmartcardSimulator(key.secret_key);

    for (const vector of smartcardErrorVectors) {
      const response = await simulator.exchange(CommandApdu.fromHex(vector.command_hex));

      expect(response.statusWordHex()).toBe(vector.expected_status_word);
      expect(response.toHex()).toBe(vector.response_hex);
    }
  });
});
