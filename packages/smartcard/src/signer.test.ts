import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { verifySignedEventResponse, type SignEventRequest } from "@nsealr/core";
import { resolveSpecsRoot } from "@nsealr/fixtures";
import { approvalDigestForRequest } from "@nsealr/review";
import { SmartcardSimulator } from "./apdu.js";
import { SmartcardSigner } from "./signer.js";

const specsRoot = resolveSpecsRoot();
const key = JSON.parse(readFileSync(resolve(specsRoot, "vectors/keys/test-key-1.json"), "utf8")) as {
  public_key: string;
  secret_key: string;
};
const request = JSON.parse(readFileSync(resolve(specsRoot, "examples/request-kind-1-basic.json"), "utf8")) as SignEventRequest;
const unsafeTemplateVector = JSON.parse(
  readFileSync(resolve(specsRoot, "vectors/invalid/request-event-template-pubkey.json"), "utf8")
) as { request: SignEventRequest; expected_error: string };

describe("SmartcardSigner", () => {
  it("refuses to sign unless an external review acknowledgement is supplied", async () => {
    const signer = new SmartcardSigner(new SmartcardSimulator(key.secret_key));

    await expect(signer.signEventRequest(request)).rejects.toThrow("smartcard signing requires explicit review acknowledgement");
  });

  it("rejects trusted-display acknowledgement for display-less smartcards", async () => {
    const signer = new SmartcardSigner(new SmartcardSimulator(key.secret_key));
    const trustedDisplayAcknowledgement = {
      acknowledged: true,
      source: "trusted-display"
    } as unknown as Parameters<typeof signer.signEventRequest>[1];

    await expect(signer.signEventRequest(request, trustedDisplayAcknowledgement)).rejects.toThrow(
      "display-less smartcard signing requires external review acknowledgement"
    );
  });

  it("rejects mismatched approval digest before APDU exchange", async () => {
    const transport = {
      exchange: vi.fn(async () => {
        throw new Error("APDU exchange must not run");
      })
    };
    const signer = new SmartcardSigner(transport);

    await expect(
      signer.signEventRequest(request, {
        acknowledged: true,
        source: "external-review",
        approvalDigest: "00".repeat(32)
      })
    ).rejects.toThrow("approval_digest_mismatch");
    expect(transport.exchange).not.toHaveBeenCalled();
  });

  it("rejects missing approval digest before APDU exchange", async () => {
    const transport = {
      exchange: vi.fn(async () => {
        throw new Error("APDU exchange must not run");
      })
    };
    const signer = new SmartcardSigner(transport);

    await expect(
      signer.signEventRequest(request, {
        acknowledged: true,
        source: "external-review"
      } as unknown as Parameters<typeof signer.signEventRequest>[1])
    ).rejects.toThrow("approval_digest is required for display-less smartcard signing");
    expect(transport.exchange).not.toHaveBeenCalled();
  });

  it("signs a Nostr event request through card APDUs after review acknowledgement", async () => {
    const signer = new SmartcardSigner(new SmartcardSimulator(key.secret_key));

    const response = await signer.signEventRequest(request, {
      acknowledged: true,
      source: "external-review",
      approvalDigest: approvalDigestForRequest(request)
    });

    expect(response.request_id).toBe(request.request_id);
    expect(response.result.event.pubkey).toBe(key.public_key);
    expect(response.result.event.id).toHaveLength(64);
    expect(response.result.event.sig).toHaveLength(128);
    expect(verifySignedEventResponse(request, response).ok).toBe(true);
  });

  it("rejects unsafe requests before sending an event id to the card", async () => {
    const signer = new SmartcardSigner(new SmartcardSimulator(key.secret_key));

    await expect(
      signer.signEventRequest(unsafeTemplateVector.request, {
        acknowledged: true,
        source: "external-review",
        approvalDigest: "00".repeat(32)
      })
    ).rejects.toThrow(unsafeTemplateVector.expected_error);
  });
});
