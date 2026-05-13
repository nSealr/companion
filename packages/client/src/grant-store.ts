import { compactJsonUtf8ByteLength } from "@nsealr/protocol";
import {
  LOCAL_CLIENT_SURFACES,
  LOCAL_SERVICE_OPERATIONS,
  type LocalClientGrant,
  type LocalClientSurface,
  type PairableLocalServiceOperation
} from "./service.js";

export const LOCAL_GRANT_STORE_FORMAT = "nsealr-local-grant-store-v0";
export const MAX_LOCAL_GRANT_STORE_JSON_BYTES = 64 * 1024;
export const MAX_LOCAL_GRANT_STORE_GRANTS = 512;

export type LocalGrantStore = {
  format: typeof LOCAL_GRANT_STORE_FORMAT;
  updated_at: number;
  grants: LocalClientGrant[];
  contains_secret_material: false;
};

export type LocalGrantStoreOptions = {
  updatedAt: number;
};

export type LocalGrantRevocationOptions = {
  revokedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function requireHex64(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be 64 lowercase hex characters`);
  }
  return value;
}

function requireOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new Error("grant origin is invalid");
  }
  if (value.startsWith("extension:") || value.startsWith("app:") || value.startsWith("cli:") || value.startsWith("sdk:")) {
    return value;
  }
  try {
    const url = new URL(value);
    if (url.origin === value && (url.protocol === "https:" || (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")))) {
      return value;
    }
  } catch {
    throw new Error("grant origin scheme is unsupported");
  }
  throw new Error("grant origin scheme is unsupported");
}

function requireSurface(value: unknown): LocalClientSurface {
  if (typeof value !== "string" || !LOCAL_CLIENT_SURFACES.includes(value as LocalClientSurface)) {
    throw new Error("grant surface is unsupported");
  }
  return value as LocalClientSurface;
}

function requireAllowedOperations(value: unknown): PairableLocalServiceOperation[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("grant allowed_operations must be a non-empty array");
  }
  const operations: PairableLocalServiceOperation[] = [];
  for (const operation of value) {
    if (
      typeof operation !== "string" ||
      !LOCAL_SERVICE_OPERATIONS.includes(operation as (typeof LOCAL_SERVICE_OPERATIONS)[number])
    ) {
      throw new Error("grant allowed operation is unsupported");
    }
    if (operation === "service_status" || operation === "request_pairing") {
      throw new Error("grant allowed operation does not require pairing");
    }
    if (operations.includes(operation as PairableLocalServiceOperation)) {
      throw new Error("grant allowed operation is duplicated");
    }
    operations.push(operation as PairableLocalServiceOperation);
  }
  return operations;
}

export function parseLocalGrant(value: unknown): LocalClientGrant {
  if (!isRecord(value)) throw new Error("grant must be an object");
  if (!hasOnlyKeys(value, [
    "client_id",
    "origin",
    "surface",
    "allowed_operations",
    "pairing_digest",
    "approved_at",
    "revoked",
    "expires_at"
  ])) {
    throw new Error("grant has unsupported fields");
  }
  const approvedAt = requireNonNegativeInteger(value.approved_at, "grant approved_at");
  const expiresAt = "expires_at" in value
    ? requireNonNegativeInteger(value.expires_at, "grant expires_at")
    : undefined;
  if (expiresAt !== undefined && expiresAt <= approvedAt) {
    throw new Error("grant expires_at must be greater than approved_at");
  }
  if ("revoked" in value && typeof value.revoked !== "boolean") {
    throw new Error("grant revoked flag is invalid");
  }
  const pairingDigest = "pairing_digest" in value
    ? requireHex64(value.pairing_digest, "grant pairing_digest")
    : undefined;
  return {
    client_id: requireHex64(value.client_id, "grant client_id"),
    origin: requireOrigin(value.origin),
    surface: requireSurface(value.surface),
    allowed_operations: requireAllowedOperations(value.allowed_operations),
    approved_at: approvedAt,
    ...(pairingDigest !== undefined ? { pairing_digest: pairingDigest } : {}),
    ...(value.revoked === true ? { revoked: true } : {}),
    ...(expiresAt !== undefined ? { expires_at: expiresAt } : {})
  };
}

export function createLocalGrantStore(
  grants: LocalClientGrant[],
  options: LocalGrantStoreOptions
): LocalGrantStore {
  const store = {
    format: LOCAL_GRANT_STORE_FORMAT,
    updated_at: options.updatedAt,
    grants,
    contains_secret_material: false
  };
  return parseLocalGrantStore(store);
}

export function parseLocalGrantStore(value: unknown): LocalGrantStore {
  if (!isRecord(value)) throw new Error("local grant store must be an object");
  if (compactJsonUtf8ByteLength(value) > MAX_LOCAL_GRANT_STORE_JSON_BYTES) {
    throw new Error("local grant store JSON exceeds max bytes");
  }
  if (!hasOnlyKeys(value, ["format", "updated_at", "grants", "contains_secret_material"])) {
    throw new Error("local grant store has unsupported fields");
  }
  if (value.format !== LOCAL_GRANT_STORE_FORMAT) {
    throw new Error("local grant store format is unsupported");
  }
  if (value.contains_secret_material !== false) {
    throw new Error("local grant store must not contain secret material");
  }
  const updatedAt = requireNonNegativeInteger(value.updated_at, "local grant store updated_at");
  if (!Array.isArray(value.grants)) {
    throw new Error("local grant store grants must be an array");
  }
  if (value.grants.length > MAX_LOCAL_GRANT_STORE_GRANTS) {
    throw new Error("local grant store has too many grants");
  }
  return {
    format: LOCAL_GRANT_STORE_FORMAT,
    updated_at: updatedAt,
    grants: value.grants.map(parseLocalGrant),
    contains_secret_material: false
  };
}

export function serializeLocalGrantStore(store: LocalGrantStore): string {
  return `${JSON.stringify(parseLocalGrantStore(store), null, 2)}\n`;
}

export function appendLocalGrant(store: LocalGrantStore, grant: LocalClientGrant, options: LocalGrantStoreOptions): LocalGrantStore {
  return createLocalGrantStore([...parseLocalGrantStore(store).grants, parseLocalGrant(grant)], options);
}

export function revokeLocalGrant(grant: LocalClientGrant, options: LocalGrantRevocationOptions): LocalClientGrant {
  const parsed = parseLocalGrant({
    ...grant,
    approved_at: grant.approved_at ?? options.revokedAt
  });
  const revokedAt = requireNonNegativeInteger(options.revokedAt, "revokedAt");
  if (revokedAt < (parsed.approved_at ?? 0)) {
    throw new Error("revokedAt must be greater than or equal to grant approved_at");
  }
  return {
    client_id: parsed.client_id,
    origin: parsed.origin,
    surface: parsed.surface,
    allowed_operations: [...parsed.allowed_operations],
    ...(parsed.pairing_digest !== undefined ? { pairing_digest: parsed.pairing_digest } : {}),
    approved_at: revokedAt,
    revoked: true
  };
}
