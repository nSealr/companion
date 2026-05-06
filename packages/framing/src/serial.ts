import { createHash } from "node:crypto";

export const SERIAL_FRAME_PREFIX = "nseal1f:";

export type SerialFrameType = "request" | "response" | "error";

export type SerialFrame = {
  type: SerialFrameType;
  payload: unknown;
};

function isSerialFrameType(value: string): value is SerialFrameType {
  return value === "request" || value === "response" || value === "error";
}

function assertBase64Url(value: string): void {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("serial frame payload must be unpadded base64url");
  }
}

function checksum(type: SerialFrameType, payload: string): string {
  return createHash("sha256").update(`${type}:${payload}`, "utf8").digest("hex").slice(0, 16);
}

export function encodeSerialFrame(frame: SerialFrame): string {
  const payload = Buffer.from(JSON.stringify(frame.payload), "utf8").toString("base64url");
  const frameChecksum = checksum(frame.type, payload);
  return `${SERIAL_FRAME_PREFIX}${frame.type}:${payload}:${frameChecksum}\n`;
}

export function decodeSerialFrame(line: string): SerialFrame {
  const normalized = line.endsWith("\n") ? line.slice(0, -1) : line;
  if (!normalized.startsWith(SERIAL_FRAME_PREFIX)) {
    throw new Error(`serial frame must start with ${SERIAL_FRAME_PREFIX}`);
  }
  const parts = normalized.slice(SERIAL_FRAME_PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new Error("serial frame must contain type, payload, and checksum");
  }
  const [type, payload, frameChecksum] = parts;
  if (!isSerialFrameType(type)) {
    throw new Error("unsupported serial frame type");
  }
  assertBase64Url(payload);
  if (frameChecksum !== checksum(type, payload)) {
    throw new Error("serial frame checksum mismatch");
  }
  try {
    return {
      type,
      payload: JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    };
  } catch (error) {
    throw new Error("serial frame payload is not valid JSON", { cause: error });
  }
}
