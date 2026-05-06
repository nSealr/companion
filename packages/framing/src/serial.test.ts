import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeSerialFrame, encodeSerialFrame, SERIAL_FRAME_PREFIX } from "./serial.js";

const specsRoot = resolve("../specs");
const signEventRequest = JSON.parse(readFileSync(resolve(specsRoot, "examples/request-kind-1-basic.json"), "utf8"));

describe("serial framing draft", () => {
  it("round-trips a request frame as one newline-terminated ASCII line", () => {
    const frame = encodeSerialFrame({ type: "request", payload: signEventRequest });

    expect(frame.startsWith(SERIAL_FRAME_PREFIX)).toBe(true);
    expect(frame.endsWith("\n")).toBe(true);
    expect(decodeSerialFrame(frame)).toEqual({ type: "request", payload: signEventRequest });
  });

  it("rejects frames with unsupported types", () => {
    const frame = encodeSerialFrame({ type: "request", payload: signEventRequest }).replace(":request:", ":pubkey:");

    expect(() => decodeSerialFrame(frame)).toThrow("unsupported serial frame type");
  });

  it("rejects frames with checksum mismatches", () => {
    const frame = encodeSerialFrame({ type: "request", payload: signEventRequest });
    const checksum = frame.match(/:([0-9a-f]{16})\n$/u)?.[1];
    if (!checksum) throw new Error("test frame did not include checksum");
    const badChecksum = checksum === "0".repeat(16) ? "1".repeat(16) : "0".repeat(16);
    const corrupted = frame.replace(checksum, badChecksum);

    expect(() => decodeSerialFrame(corrupted)).toThrow("serial frame checksum mismatch");
  });
});
