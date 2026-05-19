import { readFileSync } from "node:fs";
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
const smartcardErrorVectors = ["sign-event-id-wrong-length", "unsupported-cla", "unsupported-ins"].map((name) =>
  JSON.parse(readFileSync(resolve(specsRoot, `vectors/smartcard/${name}.json`), "utf8"))
);

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

    for (const vector of smartcardErrorVectors) {
      const response = await simulator.exchange(CommandApdu.fromHex(vector.command_hex));

      expect(response.statusWordHex()).toBe(vector.expected_status_word);
      expect(response.toHex()).toBe(vector.response_hex);
    }
  });
});
