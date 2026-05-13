import { readFileSync } from "node:fs";
import {
  parseLocalGrantStore,
  type LocalGrantStore,
  type LocalServiceContext
} from "@nsealr/client";
import { parseAccountDescriptor, type AccountDescriptor } from "@nsealr/policy";

export const SERVICE_ACCOUNT_STORE_FORMAT = "nsealr-service-account-store-v0";
export const MAX_SERVICE_ACCOUNT_STORE_JSON_BYTES = 64 * 1024;
export const MAX_SERVICE_ACCOUNT_STORE_ACCOUNTS = 256;

export type ServiceAccountStore = {
  format: typeof SERVICE_ACCOUNT_STORE_FORMAT;
  updated_at: number;
  accounts: AccountDescriptor[];
  contains_secret_material: false;
};

export type ServiceContextFileOptions = {
  grantStorePath?: string;
  accountStorePath?: string;
  now?: number;
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

function compactJsonUtf8ByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function readJsonFile(path: string, label: string): unknown {
  const contents = readFileSync(path, "utf8");
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`${label} JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function takeOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

export function parseServiceAccountStore(value: unknown): ServiceAccountStore {
  if (!isRecord(value)) throw new Error("service account store must be an object");
  if (compactJsonUtf8ByteLength(value) > MAX_SERVICE_ACCOUNT_STORE_JSON_BYTES) {
    throw new Error("service account store JSON exceeds max bytes");
  }
  if (!hasOnlyKeys(value, ["format", "updated_at", "accounts", "contains_secret_material"])) {
    throw new Error("service account store has unsupported fields");
  }
  if (value.format !== SERVICE_ACCOUNT_STORE_FORMAT) {
    throw new Error("service account store format is unsupported");
  }
  if (value.contains_secret_material !== false) {
    throw new Error("service account store must not contain secret material");
  }
  const updatedAt = requireNonNegativeInteger(value.updated_at, "service account store updated_at");
  if (!Array.isArray(value.accounts)) {
    throw new Error("service account store accounts must be an array");
  }
  if (value.accounts.length > MAX_SERVICE_ACCOUNT_STORE_ACCOUNTS) {
    throw new Error("service account store has too many accounts");
  }
  const accounts = value.accounts.map(parseAccountDescriptor);
  const accountIds = new Set<string>();
  for (const account of accounts) {
    if (accountIds.has(account.account_id)) {
      throw new Error("service account store account_id is duplicated");
    }
    accountIds.add(account.account_id);
  }
  return {
    format: SERVICE_ACCOUNT_STORE_FORMAT,
    updated_at: updatedAt,
    accounts,
    contains_secret_material: false
  };
}

export function loadServiceContextFromFiles(options: ServiceContextFileOptions): LocalServiceContext {
  const grantStore: LocalGrantStore | undefined = options.grantStorePath === undefined
    ? undefined
    : parseLocalGrantStore(readJsonFile(options.grantStorePath, "local grant store"));
  const accountStore: ServiceAccountStore | undefined = options.accountStorePath === undefined
    ? undefined
    : parseServiceAccountStore(readJsonFile(options.accountStorePath, "service account store"));
  return {
    ...(accountStore !== undefined ? { accounts: accountStore.accounts } : {}),
    ...(grantStore !== undefined ? { grants: grantStore.grants } : {}),
    ...(options.now !== undefined ? { now: options.now } : {})
  };
}

export function contextArgsFromCliArgs(args: string[]): ServiceContextFileOptions {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  const options: ServiceContextFileOptions = {};

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const arg = normalizedArgs[index];
    if (arg === "--grant-store") {
      if (options.grantStorePath !== undefined) throw new Error("--grant-store is duplicated");
      options.grantStorePath = takeOptionValue(normalizedArgs, index, arg);
      index += 1;
    } else if (arg === "--account-store") {
      if (options.accountStorePath !== undefined) throw new Error("--account-store is duplicated");
      options.accountStorePath = takeOptionValue(normalizedArgs, index, arg);
      index += 1;
    } else if (arg === "--now") {
      if (options.now !== undefined) throw new Error("--now is duplicated");
      const value = Number(takeOptionValue(normalizedArgs, index, arg));
      options.now = requireNonNegativeInteger(value, "--now");
      index += 1;
    } else {
      throw new Error(`unsupported service option: ${arg}`);
    }
  }

  return options;
}
