import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSpecsRoot } from "../../fixtures/src/specs-root.js";
import { decodeQrEnvelope, encodeQrEnvelope, QR_ENVELOPE_PREFIX } from "./qr.js";

const specsRoot = resolveSpecsRoot();
const signEventRequest = JSON.parse(readFileSync(resolve(specsRoot, "examples/request-kind-1-basic.json"), "utf8"));
const qrVector = JSON.parse(readFileSync(resolve(specsRoot, "vectors/transports/qr-envelope-kind-1-basic.json"), "utf8"));

describe("QR envelope v0", () => {
  it("encodes and decodes an uncompressed base64url JSON envelope", () => {
    const envelope = encodeQrEnvelope(signEventRequest);

    expect(envelope.startsWith(QR_ENVELOPE_PREFIX)).toBe(true);
    expect(envelope).not.toContain("=");
    expect(envelope).toBe(qrVector.envelope);
    expect(decodeQrEnvelope(envelope)).toEqual(signEventRequest);
    expect(decodeQrEnvelope(qrVector.envelope)).toEqual(qrVector.decoded);
  });

  it("rejects envelopes without the nseal1 prefix", () => {
    expect(() => decodeQrEnvelope("nostr:abc")).toThrow("QR envelope requires nseal1 prefix");
  });

  it("rejects envelopes whose payload is not JSON", () => {
    expect(() => decodeQrEnvelope(`${QR_ENVELOPE_PREFIX}bm90LWpzb24`)).toThrow("QR envelope payload is not valid JSON");
  });

  it("rejects shared invalid QR hardening vectors deterministically", () => {
    const fixtures = JSON.parse(readFileSync(resolve(specsRoot, "vectors/limits/nseal-v0.json"), "utf8"));
    expect(fixtures.name).toBe("nostrseal-v0");
    const invalidRoot = resolve(specsRoot, "vectors/invalid");
    for (const name of ["qr-envelope-invalid-utf8", "qr-envelope-malformed", "qr-envelope-oversized", "qr-envelope-padded"]) {
      const vector = JSON.parse(readFileSync(resolve(invalidRoot, `${name}.json`), "utf8"));
      expect(() => decodeQrEnvelope(vector.envelope), name).toThrow(vector.expected_error);
    }
  });
});
