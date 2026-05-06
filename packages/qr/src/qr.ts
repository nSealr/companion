export const QR_ENVELOPE_PREFIX = "nseal1:";

function assertBase64Url(value: string): void {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("QR envelope payload must be unpadded base64url");
  }
}

export function encodeQrEnvelope(value: unknown): string {
  const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${QR_ENVELOPE_PREFIX}${payload}`;
}

export function decodeQrEnvelope(envelope: string): unknown {
  if (!envelope.startsWith(QR_ENVELOPE_PREFIX)) {
    throw new Error(`QR envelope must start with ${QR_ENVELOPE_PREFIX}`);
  }
  const payload = envelope.slice(QR_ENVELOPE_PREFIX.length);
  if (payload.length === 0) {
    throw new Error("QR envelope payload is empty");
  }
  assertBase64Url(payload);
  const json = Buffer.from(payload, "base64url").toString("utf8");
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error("QR envelope payload is not valid JSON", { cause: error });
  }
}
