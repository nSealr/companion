import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { NSEALR_V0_LIMITS } from "@nsealr/protocol";

export const QR_ENVELOPE_PREFIX = "nsealr1:";
export const ANIMATED_QR_ENVELOPE_PREFIX = "nsealr1a:";

export type AnimatedQrEnvelopeOptions = {
  chunkSizeChars?: number;
};

const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const BASE64URL_DECODE = new Map([...BASE64URL_ALPHABET].map((char, index) => [char, index]));
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

function assertBase64Url(value: string): void {
  if (value.includes("=")) {
    throw new Error("QR envelope payload must be unpadded base64url");
  }
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("QR envelope payload must be base64url");
  }
}

function jsonBytes(value: unknown): Uint8Array {
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new Error("QR payload must be JSON-serializable");
  }
  return TEXT_ENCODER.encode(json);
}

function sha256Hex(value: string | Uint8Array): string {
  return bytesToHex(sha256(typeof value === "string" ? TEXT_ENCODER.encode(value) : value));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let output = "";
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset];
    const hasSecond = offset + 1 < bytes.length;
    const hasThird = offset + 2 < bytes.length;
    const second = hasSecond ? bytes[offset + 1] : 0;
    const third = hasThird ? bytes[offset + 2] : 0;

    output += BASE64URL_ALPHABET[first >> 2];
    output += BASE64URL_ALPHABET[((first & 0x03) << 4) | (second >> 4)];
    if (hasSecond) {
      output += BASE64URL_ALPHABET[((second & 0x0f) << 2) | (third >> 6)];
    }
    if (hasThird) {
      output += BASE64URL_ALPHABET[third & 0x3f];
    }
  }
  return output;
}

function decodeBase64Url(value: string, errorMessage: string): Uint8Array {
  if (value.length % 4 === 1) {
    throw new Error(errorMessage);
  }
  const output = new Uint8Array(Math.floor((value.length * 3) / 4));
  let outputOffset = 0;
  for (let offset = 0; offset < value.length; offset += 4) {
    const remaining = value.length - offset;
    if (remaining === 1) {
      throw new Error(errorMessage);
    }
    const first = BASE64URL_DECODE.get(value[offset]);
    const second = BASE64URL_DECODE.get(value[offset + 1]);
    const third = remaining > 2 ? BASE64URL_DECODE.get(value[offset + 2]) : 0;
    const fourth = remaining > 3 ? BASE64URL_DECODE.get(value[offset + 3]) : 0;
    if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
      throw new Error(errorMessage);
    }
    const block = (first << 18) | (second << 12) | (third << 6) | fourth;
    output[outputOffset] = (block >> 16) & 0xff;
    outputOffset += 1;
    if (remaining > 2) {
      output[outputOffset] = (block >> 8) & 0xff;
      outputOffset += 1;
    }
    if (remaining > 3) {
      output[outputOffset] = block & 0xff;
      outputOffset += 1;
    }
  }
  return output;
}

function animatedFrameChecksum(digest: string, index: number, total: number, chunk: string): string {
  return sha256Hex(`${ANIMATED_QR_ENVELOPE_PREFIX}${digest}:${index}/${total}:${chunk}`).slice(0, 16);
}

export function encodeQrEnvelope(value: unknown): string {
  const decodedJson = jsonBytes(value);
  if (decodedJson.byteLength > NSEALR_V0_LIMITS.max_static_qr_decoded_json_bytes) {
    throw new Error("QR decoded JSON exceeds max_static_qr_decoded_json_bytes");
  }
  const payload = encodeBase64Url(decodedJson);
  return `${QR_ENVELOPE_PREFIX}${payload}`;
}

export function encodeAnimatedQrEnvelopeFrames(value: unknown, options: AnimatedQrEnvelopeOptions = {}): string[] {
  const chunkSize = options.chunkSizeChars ?? NSEALR_V0_LIMITS.max_animated_qr_frame_payload_chars;
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error("animated QR chunk size must be a positive integer");
  }
  if (chunkSize > NSEALR_V0_LIMITS.max_animated_qr_frame_payload_chars) {
    throw new Error("animated QR chunk exceeds max_animated_qr_frame_payload_chars");
  }
  const decodedJson = jsonBytes(value);
  if (decodedJson.byteLength > NSEALR_V0_LIMITS.max_animated_qr_decoded_json_bytes) {
    throw new Error("animated QR decoded JSON exceeds max_animated_qr_decoded_json_bytes");
  }
  const digest = sha256Hex(decodedJson);
  const payload = encodeBase64Url(decodedJson);
  const chunks = payload.match(new RegExp(`.{1,${chunkSize}}`, "gu")) ?? [];
  if (chunks.length === 0) {
    throw new Error("animated QR payload is empty");
  }
  if (chunks.length > NSEALR_V0_LIMITS.max_animated_qr_frame_count) {
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
    throw new Error("QR envelope requires nsealr1 prefix");
  }
  const payload = envelope.slice(QR_ENVELOPE_PREFIX.length);
  if (payload.length === 0) {
    throw new Error("QR envelope payload is empty");
  }
  assertBase64Url(payload);
  const decoded = decodeBase64Url(payload, "QR envelope payload must be base64url");
  if (decoded.byteLength > NSEALR_V0_LIMITS.max_static_qr_decoded_json_bytes) {
    throw new Error("QR decoded JSON exceeds max_static_qr_decoded_json_bytes");
  }
  let json: string;
  try {
    json = TEXT_DECODER.decode(decoded);
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
    throw new Error("animated QR frame requires nsealr1a prefix");
  }
  const parts = frame.split(":");
  if (parts.length !== 5 || parts[0] !== "nsealr1a") {
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
  if (total > NSEALR_V0_LIMITS.max_animated_qr_frame_count) {
    throw new Error("animated QR frame count exceeds max_animated_qr_frame_count");
  }
  assertBase64Url(chunk);
  if (chunk.length > NSEALR_V0_LIMITS.max_animated_qr_frame_payload_chars) {
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
  const decoded = decodeBase64Url(chunks.join(""), "animated QR payload must be base64url");
  if (decoded.byteLength > NSEALR_V0_LIMITS.max_animated_qr_decoded_json_bytes) {
    throw new Error("animated QR decoded JSON exceeds max_animated_qr_decoded_json_bytes");
  }
  if (sha256Hex(decoded) !== digest) {
    throw new Error("animated QR decoded digest mismatch");
  }
  let json: string;
  try {
    json = TEXT_DECODER.decode(decoded);
  } catch (error) {
    throw new Error("animated QR payload must be valid UTF-8", { cause: error });
  }
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error("animated QR payload is not valid JSON", { cause: error });
  }
}
