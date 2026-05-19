import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSpecsRoot } from "@nsealr/fixtures";
import { CommandApdu } from "@nsealr/smartcard";
import { SmartcardSimulator } from "./smartcard-simulator.js";

const specsRoot = resolveSpecsRoot();
const key = JSON.parse(readFileSync(resolve(specsRoot, "vectors/keys/test-key-1.json"), "utf8")) as {
  secret_key: string;
};
const getPublicKeyVector = JSON.parse(readFileSync(resolve(specsRoot, "vectors/smartcard/get-public-key.json"), "utf8"));
const signEventIdVector = JSON.parse(readFileSync(resolve(specsRoot, "vectors/smartcard/sign-event-id-kind-1-basic.json"), "utf8"));
const signEventIdWithLeVector = JSON.parse(readFileSync(resolve(specsRoot, "vectors/smartcard/sign-event-id-with-le.json"), "utf8"));
const smartcardErrorVectors = readdirSync(resolve(specsRoot, "vectors/smartcard"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(resolve(specsRoot, "vectors/smartcard", name), "utf8")) as {
    name: string;
    command_hex: string;
    expected_status_word?: string;
    response_hex?: string;
  })
  .filter((vector) => vector.expected_status_word !== undefined && vector.expected_status_word !== "9000");

describe("test-only smartcard simulator", () => {
  it("simulates get_public_key and sign_event_id commands from shared vectors", async () => {
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

    expect(smartcardErrorVectors.length).toBeGreaterThanOrEqual(7);
    for (const vector of smartcardErrorVectors) {
      const responseHex = vector.response_hex;
      if (responseHex === undefined) throw new Error(`${vector.name} is missing response_hex`);
      const response = await simulator.exchange(CommandApdu.fromHex(vector.command_hex));

      expect(response.statusWordHex()).toBe(vector.expected_status_word);
      expect(response.toHex()).toBe(responseHex);
    }
  });

  it("does not verify a signature response against a non-exact sign_event_id command", async () => {
    const simulator = new SmartcardSimulator(key.secret_key);
    const exactCommand = CommandApdu.fromHex(signEventIdVector.command_hex);
    const signResponse = await simulator.exchange(exactCommand);

    const verification = await simulator.verifySignEventIdResponse(
      CommandApdu.fromHex(signEventIdWithLeVector.command_hex),
      signResponse
    );

    expect(verification).toEqual({ ok: false, error: "command is not a sign_event_id APDU" });
  });
});
