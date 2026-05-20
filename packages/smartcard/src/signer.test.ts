import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { verifySignedEventResponse, type SignEventRequest } from "@nsealr/core";
import { resolveSpecsRoot } from "@nsealr/fixtures";
import { approvalDigestForRequest } from "@nsealr/review";
import { CommandApdu, ResponseApdu, SIGN_EVENT_ID_INS } from "./apdu.js";
import { SmartcardSigner } from "./signer.js";

const specsRoot = resolveSpecsRoot();
const key = JSON.parse(readFileSync(resolve(specsRoot, "vectors/keys/test-key-1.json"), "utf8")) as {
  public_key: string;
};
const request = JSON.parse(readFileSync(resolve(specsRoot, "examples/request-kind-1-basic.json"), "utf8")) as SignEventRequest;
const signedResponse = JSON.parse(readFileSync(resolve(specsRoot, "examples/response-kind-1-basic.json"), "utf8")) as {
  result: { event: { sig: string } };
};
const getPublicKeyVector = JSON.parse(readFileSync(resolve(specsRoot, "vectors/smartcard/get-public-key.json"), "utf8"));
const signEventIdVector = JSON.parse(readFileSync(resolve(specsRoot, "vectors/smartcard/sign-event-id-kind-1-basic.json"), "utf8"));
const unsafeTemplateVector = JSON.parse(
  readFileSync(resolve(specsRoot, "vectors/invalid/request-event-template-pubkey.json"), "utf8")
) as { request: SignEventRequest; expected_error: string };

function vectorBackedTransport() {
  return {
    exchange: vi.fn(async (command: CommandApdu) => {
      if (command.toHex() === getPublicKeyVector.command_hex) {
        return ResponseApdu.fromHex(getPublicKeyVector.response_hex);
      }
      if (command.ins === SIGN_EVENT_ID_INS) {
        expect(command.toHex()).toBe(signEventIdVector.command_hex);
        return ResponseApdu.fromHex(`${signedResponse.result.event.sig}${signEventIdVector.expected_status_word}`);
      }
      throw new Error(`unexpected APDU command ${command.toHex()}`);
    })
  };
}

describe("SmartcardSigner", () => {
  it("refuses to sign unless an external review acknowledgement is supplied", async () => {
    const transport = vectorBackedTransport();
    const signer = new SmartcardSigner(transport);

    await expect(signer.signEventRequest(request)).rejects.toThrow("smartcard signing requires explicit review acknowledgement");
    expect(transport.exchange).not.toHaveBeenCalled();
  });

  it("rejects trusted-display acknowledgement for display-less smartcards", async () => {
    const transport = vectorBackedTransport();
    const signer = new SmartcardSigner(transport);
    const trustedDisplayAcknowledgement = {
      acknowledged: true,
      source: "trusted-display"
    } as unknown as Parameters<typeof signer.signEventRequest>[1];

    await expect(signer.signEventRequest(request, trustedDisplayAcknowledgement)).rejects.toThrow(
      "display-less smartcard signing requires external review acknowledgement"
    );
    expect(transport.exchange).not.toHaveBeenCalled();
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
    const transport = vectorBackedTransport();
    const signer = new SmartcardSigner(transport);

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
    expect(transport.exchange).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid card signatures before returning a response", async () => {
    const transport = {
      exchange: vi.fn(async (command: CommandApdu) => {
        if (command.toHex() === getPublicKeyVector.command_hex) {
          return ResponseApdu.fromHex(getPublicKeyVector.response_hex);
        }
        if (command.ins === SIGN_EVENT_ID_INS) {
          return new ResponseApdu(new Uint8Array(64));
        }
        throw new Error(`unexpected APDU command ${command.toHex()}`);
      })
    };
    const signer = new SmartcardSigner(transport);

    await expect(
      signer.signEventRequest(request, {
        acknowledged: true,
        source: "external-review",
        approvalDigest: approvalDigestForRequest(request)
      })
    ).rejects.toThrow("smartcard Schnorr signature is invalid");
    expect(transport.exchange).toHaveBeenCalledTimes(2);
  });

  it("rejects unsafe requests before sending an event id to the card", async () => {
    const transport = vectorBackedTransport();
    const signer = new SmartcardSigner(transport);

    await expect(
      signer.signEventRequest(unsafeTemplateVector.request, {
        acknowledged: true,
        source: "external-review",
        approvalDigest: "00".repeat(32)
      })
    ).rejects.toThrow(unsafeTemplateVector.expected_error);
    expect(transport.exchange).not.toHaveBeenCalled();
  });
});
