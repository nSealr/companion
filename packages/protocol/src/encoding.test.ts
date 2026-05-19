import { describe, expect, it } from "vitest";
import {
  assertBase64UrlPayload,
  decodeBase64Url,
  encodeBase64Url,
  jsonToUtf8Bytes
} from "./encoding.js";

const textDecoder = new TextDecoder("utf-8", { fatal: true });

describe("shared browser-safe encoding helpers", () => {
  it("round-trips UTF-8 JSON through unpadded base64url", () => {
    const value = { content: "Line one\nTabbed\tEuro \u20ac Lock \ud83d\udd10" };
    const bytes = jsonToUtf8Bytes(value, "not JSON");
    const encoded = encodeBase64Url(bytes);

    expect(encoded).not.toContain("=");
    expect(JSON.parse(textDecoder.decode(decodeBase64Url(encoded, "bad base64url")))).toEqual(value);
  });

  it("rejects padded, malformed, and impossible-length payloads deterministically", () => {
    expect(() => assertBase64UrlPayload("abc=", { padded: "padded", invalid: "invalid" })).toThrow("padded");
    expect(() => assertBase64UrlPayload("abc*", { padded: "padded", invalid: "invalid" })).toThrow("invalid");
    expect(() => decodeBase64Url("a", "invalid length")).toThrow("invalid length");
  });

  it("rejects non-JSON-serializable roots deterministically", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => jsonToUtf8Bytes(undefined, "not JSON")).toThrow("not JSON");
    expect(() => jsonToUtf8Bytes(cyclic, "not JSON")).toThrow("not JSON");
  });
});
