import {
  createRouteDispatcher,
  type RouteDispatchEntry,
  type SignerRequestDispatcher
} from "@nsealr/client";
import { type RouteType } from "@nsealr/policy";
import { exchangeSerialLineRequest, type SerialLinePortOpener } from "@nsealr/transport";

export const SERVICE_ROUTE_DRIVER_STORE_FORMAT = "nsealr-service-route-driver-store-v0";
export const MAX_SERVICE_ROUTE_DRIVER_STORE_JSON_BYTES = 64 * 1024;
export const MAX_SERVICE_ROUTE_DRIVERS = 64;

type ServiceSerialLineRouteDriver = {
  account_id: string;
  route_type: Extract<RouteType, "esp32_usb_nip46" | "custom_hardware_wallet">;
  transport: "usb";
  driver: "serial_line";
  serial_line: {
    path: string;
    max_ignored_lines?: number;
    response_timeout_ms?: number;
  };
};

export type ServiceRouteDriver = ServiceSerialLineRouteDriver;

export type ServiceRouteDriverStore = {
  format: typeof SERVICE_ROUTE_DRIVER_STORE_FORMAT;
  updated_at: number;
  contains_secret_material: false;
  routes: ServiceRouteDriver[];
};

export type ServiceRouteDriverOptions = {
  openSerialLinePort: SerialLinePortOpener;
};

const SERIAL_LINE_ROUTE_TYPES = new Set<RouteType>(["esp32_usb_nip46", "custom_hardware_wallet"]);
const SECRET_FIELD_NAMES = new Set([
  "secret_key",
  "private_key",
  "nsec",
  "mnemonic",
  "seed",
  "passphrase",
  "nip49_ciphertext"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function secretFieldPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => secretFieldPaths(item, prefix ? `${prefix}[${index}]` : `[${index}]`));
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const nested = secretFieldPaths(child, path);
    return SECRET_FIELD_NAMES.has(key.toLowerCase()) ? [path, ...nested] : nested;
  });
}

function rejectSecretFields(value: unknown): void {
  const secretPath = secretFieldPaths(value)[0];
  if (secretPath !== undefined) {
    throw new Error(`service route driver store must not contain secret field ${secretPath}`);
  }
}

function compactJsonUtf8ByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function requireStableId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value)) {
    throw new Error(`${label} must be a stable string id`);
  }
  return value;
}

function requireSerialLinePath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error("serial_line.path must be a non-empty path");
  }
  return value;
}

function parseSerialLineRouteDriver(value: Record<string, unknown>, index: number): ServiceSerialLineRouteDriver {
  if (!hasOnlyKeys(value, ["account_id", "route_type", "transport", "driver", "serial_line"])) {
    throw new Error(`service route driver ${index} has unsupported fields`);
  }
  if (value.driver !== "serial_line") {
    throw new Error(`service route driver ${index} driver is unsupported`);
  }
  if (value.transport !== "usb") {
    throw new Error(`service route driver ${index} transport must be usb`);
  }
  if (typeof value.route_type !== "string" || !SERIAL_LINE_ROUTE_TYPES.has(value.route_type as RouteType)) {
    throw new Error(`service route driver ${index} route_type is unsupported for serial_line`);
  }
  if (!isRecord(value.serial_line)) {
    throw new Error(`service route driver ${index} serial_line must be an object`);
  }
  if (!hasOnlyKeys(value.serial_line, ["path", "max_ignored_lines", "response_timeout_ms"])) {
    throw new Error(`service route driver ${index} serial_line has unsupported fields`);
  }
  return {
    account_id: requireStableId(value.account_id, `service route driver ${index} account_id`),
    route_type: value.route_type as ServiceSerialLineRouteDriver["route_type"],
    transport: "usb",
    driver: "serial_line",
    serial_line: {
      path: requireSerialLinePath(value.serial_line.path),
      ...(value.serial_line.max_ignored_lines !== undefined
        ? {
            max_ignored_lines: requirePositiveInteger(
              value.serial_line.max_ignored_lines,
              `service route driver ${index} serial_line.max_ignored_lines`
            )
          }
        : {}),
      ...(value.serial_line.response_timeout_ms !== undefined
        ? {
            response_timeout_ms: requirePositiveInteger(
              value.serial_line.response_timeout_ms,
              `service route driver ${index} serial_line.response_timeout_ms`
            )
          }
        : {})
    }
  };
}

function parseRouteDriver(value: unknown, index: number): ServiceRouteDriver {
  if (!isRecord(value)) throw new Error(`service route driver ${index} must be an object`);
  return parseSerialLineRouteDriver(value, index);
}

function rejectDuplicateRoutes(routes: ServiceRouteDriver[]): void {
  const seen = new Set<string>();
  for (const route of routes) {
    const key = `${route.account_id}\0${route.route_type}\0${route.transport}`;
    if (seen.has(key)) {
      throw new Error("service route driver store contains duplicate account/route/transport entries");
    }
    seen.add(key);
  }
}

export function parseServiceRouteDriverStore(value: unknown): ServiceRouteDriverStore {
  rejectSecretFields(value);
  if (!isRecord(value)) throw new Error("service route driver store must be an object");
  if (compactJsonUtf8ByteLength(value) > MAX_SERVICE_ROUTE_DRIVER_STORE_JSON_BYTES) {
    throw new Error("service route driver store JSON exceeds max bytes");
  }
  if (!hasOnlyKeys(value, ["format", "updated_at", "contains_secret_material", "routes"])) {
    throw new Error("service route driver store has unsupported fields");
  }
  if (value.format !== SERVICE_ROUTE_DRIVER_STORE_FORMAT) {
    throw new Error("service route driver store format is unsupported");
  }
  if (value.contains_secret_material !== false) {
    throw new Error("service route driver store must not contain secret material");
  }
  if (!Array.isArray(value.routes)) {
    throw new Error("service route driver store routes must be an array");
  }
  if (value.routes.length === 0) {
    throw new Error("service route driver store routes must be a non-empty array");
  }
  if (value.routes.length > MAX_SERVICE_ROUTE_DRIVERS) {
    throw new Error("service route driver store has too many routes");
  }
  const routes = value.routes.map(parseRouteDriver);
  rejectDuplicateRoutes(routes);
  return {
    format: SERVICE_ROUTE_DRIVER_STORE_FORMAT,
    updated_at: requireNonNegativeInteger(value.updated_at, "service route driver store updated_at"),
    contains_secret_material: false,
    routes
  };
}

export function createServiceRouteDispatcher(
  store: ServiceRouteDriverStore,
  options: ServiceRouteDriverOptions
): SignerRequestDispatcher {
  const entries: RouteDispatchEntry[] = store.routes.map((route) => ({
    account_id: route.account_id,
    route_type: route.route_type,
    transport: route.transport,
    dispatch: async (request) => exchangeSerialLineRequest({
      path: route.serial_line.path,
      request: request.request,
      openPort: options.openSerialLinePort,
      maxIgnoredLines: route.serial_line.max_ignored_lines,
      responseTimeoutMs: route.serial_line.response_timeout_ms
    })
  }));
  return createRouteDispatcher(entries);
}
