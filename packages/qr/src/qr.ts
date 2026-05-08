import { TextDecoder } from "node:util";
import { NOSTRSEAL_V0_LIMITS } from "../../protocol/src/limits.js";

export const QR_ENVELOPE_PREFIX = "nseal1:";

function assertBase64Url(value: string): void {
  if (value.includes("=")) {
    throw new Error("QR envelope payload must be unpadded base64url");
  }
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("QR envelope payload must be base64url");
  }
}

export function encodeQrEnvelope(value: unknown): string {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${QR_ENVELOPE_PREFIX}${payload}`;
}

export function decodeQrEnvelope(envelope: string): unknown {
  if (!envelope.startsWith(QR_ENVELOPE_PREFIX)) {
    throw new Error("QR envelope requires nseal1 prefix");
  }
  const payload = envelope.slice(QR_ENVELOPE_PREFIX.length);
  if (payload.length === 0) {
    throw new Error("QR envelope payload is empty");
  }
  assertBase64Url(payload);
  const decoded = Buffer.from(payload, "base64url");
  if (decoded.byteLength > NOSTRSEAL_V0_LIMITS.max_static_qr_decoded_json_bytes) {
    throw new Error("QR decoded JSON exceeds max_static_qr_decoded_json_bytes");
  }
  let json: string;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
  } catch (error) {
    throw new Error("QR envelope payload must be valid UTF-8", { cause: error });
  }
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error("QR envelope payload is not valid JSON", { cause: error });
  }
}
