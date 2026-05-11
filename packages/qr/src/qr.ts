import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { NOSTRSEAL_V0_LIMITS } from "../../protocol/src/limits.js";

export const QR_ENVELOPE_PREFIX = "nseal1:";
export const ANIMATED_QR_ENVELOPE_PREFIX = "nseal1a:";

export type AnimatedQrEnvelopeOptions = {
  chunkSizeChars?: number;
};

function assertBase64Url(value: string): void {
  if (value.includes("=")) {
    throw new Error("QR envelope payload must be unpadded base64url");
  }
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("QR envelope payload must be base64url");
  }
}

function sha256Hex(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function animatedFrameChecksum(digest: string, index: number, total: number, chunk: string): string {
  return sha256Hex(`${ANIMATED_QR_ENVELOPE_PREFIX}${digest}:${index}/${total}:${chunk}`).slice(0, 16);
}

export function encodeQrEnvelope(value: unknown): string {
  const decodedJson = Buffer.from(JSON.stringify(value), "utf8");
  if (decodedJson.byteLength > NOSTRSEAL_V0_LIMITS.max_static_qr_decoded_json_bytes) {
    throw new Error("QR decoded JSON exceeds max_static_qr_decoded_json_bytes");
  }
  const payload = decodedJson.toString("base64url");
  return `${QR_ENVELOPE_PREFIX}${payload}`;
}

export function encodeAnimatedQrEnvelopeFrames(value: unknown, options: AnimatedQrEnvelopeOptions = {}): string[] {
  const chunkSize = options.chunkSizeChars ?? NOSTRSEAL_V0_LIMITS.max_animated_qr_frame_payload_chars;
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error("animated QR chunk size must be a positive integer");
  }
  if (chunkSize > NOSTRSEAL_V0_LIMITS.max_animated_qr_frame_payload_chars) {
    throw new Error("animated QR chunk exceeds max_animated_qr_frame_payload_chars");
  }
  const decodedJson = Buffer.from(JSON.stringify(value), "utf8");
  if (decodedJson.byteLength > NOSTRSEAL_V0_LIMITS.max_animated_qr_decoded_json_bytes) {
    throw new Error("animated QR decoded JSON exceeds max_animated_qr_decoded_json_bytes");
  }
  const digest = sha256Hex(decodedJson);
  const payload = decodedJson.toString("base64url");
  const chunks = payload.match(new RegExp(`.{1,${chunkSize}}`, "gu")) ?? [];
  if (chunks.length === 0) {
    throw new Error("animated QR payload is empty");
  }
  if (chunks.length > NOSTRSEAL_V0_LIMITS.max_animated_qr_frame_count) {
    throw new Error("animated QR frame count exceeds max_animated_qr_frame_count");
  }
  return chunks.map((chunk, position) => {
    const index = position + 1;
    const checksum = animatedFrameChecksum(digest, index, chunks.length, chunk);
    return `${ANIMATED_QR_ENVELOPE_PREFIX}${digest}:${index}/${chunks.length}:${chunk}:${checksum}`;
  });
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

type ParsedAnimatedFrame = {
  digest: string;
  index: number;
  total: number;
  chunk: string;
};

function parseAnimatedFrame(frame: string): ParsedAnimatedFrame {
  if (!frame.startsWith(ANIMATED_QR_ENVELOPE_PREFIX)) {
    throw new Error("animated QR frame requires nseal1a prefix");
  }
  const parts = frame.split(":");
  if (parts.length !== 5 || parts[0] !== "nseal1a") {
    throw new Error("animated QR frame is malformed");
  }
  const [, digest, indexTotal, chunk, checksum] = parts;
  if (!/^[0-9a-f]{64}$/u.test(digest)) {
    throw new Error("animated QR digest must be 32-byte lowercase hex");
  }
  if (!/^[0-9a-f]{16}$/u.test(checksum)) {
    throw new Error("animated QR checksum must be 8-byte lowercase hex");
  }
  const match = /^([1-9][0-9]*)\/([1-9][0-9]*)$/u.exec(indexTotal);
  if (!match) {
    throw new Error("animated QR index must use index/total");
  }
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (index > total) {
    throw new Error("animated QR frame index is out of range");
  }
  if (total > NOSTRSEAL_V0_LIMITS.max_animated_qr_frame_count) {
    throw new Error("animated QR frame count exceeds max_animated_qr_frame_count");
  }
  assertBase64Url(chunk);
  if (chunk.length > NOSTRSEAL_V0_LIMITS.max_animated_qr_frame_payload_chars) {
    throw new Error("animated QR chunk exceeds max_animated_qr_frame_payload_chars");
  }
  if (checksum !== animatedFrameChecksum(digest, index, total, chunk)) {
    throw new Error("animated QR frame checksum mismatch");
  }
  return { digest, index, total, chunk };
}

export function decodeAnimatedQrEnvelopeFrames(frames: string[]): unknown {
  if (frames.length === 0) {
    throw new Error("animated QR requires at least one frame");
  }
  const parsed = frames.map(parseAnimatedFrame);
  const digest = parsed[0].digest;
  const total = parsed[0].total;
  if (parsed.some((frame) => frame.digest !== digest || frame.total !== total)) {
    throw new Error("animated QR frame set mismatch");
  }
  if (parsed.length !== total) {
    throw new Error("animated QR frames must be unique and contiguous");
  }
  const byIndex = new Map<number, ParsedAnimatedFrame>();
  for (const frame of parsed) {
    if (byIndex.has(frame.index)) {
      throw new Error("animated QR frames must be unique and contiguous");
    }
    byIndex.set(frame.index, frame);
  }
  const chunks: string[] = [];
  for (let index = 1; index <= total; index += 1) {
    const frame = byIndex.get(index);
    if (!frame) {
      throw new Error("animated QR frames must be unique and contiguous");
    }
    chunks.push(frame.chunk);
  }
  const decoded = Buffer.from(chunks.join(""), "base64url");
  if (decoded.byteLength > NOSTRSEAL_V0_LIMITS.max_animated_qr_decoded_json_bytes) {
    throw new Error("animated QR decoded JSON exceeds max_animated_qr_decoded_json_bytes");
  }
  if (sha256Hex(decoded) !== digest) {
    throw new Error("animated QR decoded digest mismatch");
  }
  let json: string;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
  } catch (error) {
    throw new Error("animated QR payload must be valid UTF-8", { cause: error });
  }
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error("animated QR payload is not valid JSON", { cause: error });
  }
}
