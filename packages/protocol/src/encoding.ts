const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const BASE64URL_DECODE = new Map([...BASE64URL_ALPHABET].map((char, index) => [char, index]));
const TEXT_ENCODER = new TextEncoder();

export type Base64UrlPayloadErrorMessages = {
  padded: string;
  invalid: string;
};

export function jsonToUtf8Bytes(value: unknown, errorMessage: string): Uint8Array {
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch (error) {
    throw new Error(errorMessage, { cause: error });
  }
  if (json === undefined) {
    throw new Error(errorMessage);
  }
  return TEXT_ENCODER.encode(json);
}

export function assertBase64UrlPayload(value: string, messages: Base64UrlPayloadErrorMessages): void {
  if (value.includes("=")) {
    throw new Error(messages.padded);
  }
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error(messages.invalid);
  }
}

export function encodeBase64Url(bytes: Uint8Array): string {
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

export function decodeBase64Url(value: string, errorMessage: string): Uint8Array {
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
