import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { verifySignedEventResponse, type SignEventRequest } from "../../core/src/nostr.js";
import { SmartcardSimulator } from "./apdu.js";
import { SmartcardSigner } from "./signer.js";

const specsRoot = resolve("../specs");
const key = JSON.parse(readFileSync(resolve(specsRoot, "vectors/keys/test-key-1.json"), "utf8")) as {
  public_key: string;
  secret_key: string;
};
const request = JSON.parse(readFileSync(resolve(specsRoot, "examples/request-kind-1-basic.json"), "utf8")) as SignEventRequest;

describe("SmartcardSigner", () => {
  it("refuses to sign unless an external review acknowledgement is supplied", async () => {
    const signer = new SmartcardSigner(new SmartcardSimulator(key.secret_key));

    await expect(signer.signEventRequest(request)).rejects.toThrow("smartcard signing requires explicit review acknowledgement");
  });

  it("signs a Nostr event request through card APDUs after review acknowledgement", async () => {
    const signer = new SmartcardSigner(new SmartcardSimulator(key.secret_key));

    const response = await signer.signEventRequest(request, {
      acknowledged: true,
      source: "external-review"
    });

    expect(response.request_id).toBe(request.request_id);
    expect(response.result.event.pubkey).toBe(key.public_key);
    expect(response.result.event.id).toHaveLength(64);
    expect(response.result.event.sig).toHaveLength(128);
    expect(verifySignedEventResponse(request, response).ok).toBe(true);
  });
});
