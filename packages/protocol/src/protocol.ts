export type ValidationResult = {
  ok: boolean;
  error?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/u.test(value);
}

function isLowerHex(value: unknown, length: number): value is string {
  return typeof value === "string" && new RegExp(`^[0-9a-f]{${length}}$`, "u").test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function validateEventTemplate(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, error: "event_template must be an object" };
  for (const forbidden of ["id", "pubkey", "sig"]) {
    if (forbidden in value) return { ok: false, error: `event_template must not contain ${forbidden}` };
  }
  if (!isNonNegativeInteger(value.created_at)) return { ok: false, error: "created_at must be a non-negative integer" };
  if (!isNonNegativeInteger(value.kind)) return { ok: false, error: "kind must be a non-negative integer" };
  if (!Array.isArray(value.tags) || !value.tags.every((tag) => Array.isArray(tag) && tag.every((item) => typeof item === "string"))) {
    return { ok: false, error: "tags must be an array of string arrays" };
  }
  if (typeof value.content !== "string") return { ok: false, error: "content must be a string" };
  const allowed = new Set(["created_at", "kind", "tags", "content"]);
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (extra.length > 0) return { ok: false, error: `event_template contains unknown fields: ${extra.join(", ")}` };
  return { ok: true };
}

export function validateRequest(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, error: "request must be an object" };
  if (value.version !== 1) return { ok: false, error: "version must be 1" };
  if (!isRequestId(value.request_id)) return { ok: false, error: "request_id is invalid" };
  if (value.method === "get_public_key") {
    if ("params" in value) return { ok: false, error: "get_public_key must not include params" };
    return { ok: true };
  }
  if (value.method === "sign_event") {
    if (!isRecord(value.params)) return { ok: false, error: "sign_event requires params" };
    const result = validateEventTemplate(value.params.event_template);
    if (!result.ok) return result;
    return { ok: true };
  }
  return { ok: false, error: "unsupported method" };
}

function validateSignedEvent(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, error: "event must be an object" };
  if (!isLowerHex(value.id, 64)) return { ok: false, error: "event id must be 32-byte lowercase hex" };
  if (!isLowerHex(value.pubkey, 64)) return { ok: false, error: "event pubkey must be 32-byte lowercase hex" };
  if (!isNonNegativeInteger(value.created_at)) return { ok: false, error: "created_at must be a non-negative integer" };
  if (!isNonNegativeInteger(value.kind)) return { ok: false, error: "kind must be a non-negative integer" };
  if (!Array.isArray(value.tags) || !value.tags.every((tag) => Array.isArray(tag) && tag.every((item) => typeof item === "string"))) {
    return { ok: false, error: "tags must be an array of string arrays" };
  }
  if (typeof value.content !== "string") return { ok: false, error: "content must be a string" };
  if (!isLowerHex(value.sig, 128)) return { ok: false, error: "event sig must be 64-byte lowercase hex" };
  return { ok: true };
}

export function validateResponse(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, error: "response must be an object" };
  if (value.version !== 1) return { ok: false, error: "version must be 1" };
  if (!isRequestId(value.request_id)) return { ok: false, error: "request_id is invalid" };
  if (value.ok === false) {
    if (!isRecord(value.error)) return { ok: false, error: "error response requires error object" };
    if (typeof value.error.code !== "string") return { ok: false, error: "error code is required" };
    if (typeof value.error.message !== "string" || value.error.message.length === 0) return { ok: false, error: "error message is required" };
    if (typeof value.error.retryable !== "boolean") return { ok: false, error: "error retryable flag is required" };
    return { ok: true };
  }
  if (value.ok === true) {
    if (!isRecord(value.result)) return { ok: false, error: "successful response requires result" };
    if ("public_key" in value.result) {
      return isLowerHex(value.result.public_key, 64) ? { ok: true } : { ok: false, error: "public_key is invalid" };
    }
    if ("event" in value.result) return validateSignedEvent(value.result.event);
    return { ok: false, error: "successful response result is empty" };
  }
  return { ok: false, error: "ok must be true or false" };
}
