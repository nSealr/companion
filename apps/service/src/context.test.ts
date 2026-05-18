import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSpecsRoot } from "@nsealr/fixtures";
import { encodeSerialFrame } from "@nsealr/framing";
import {
  clientIdForIdentity,
  createLocalGrantStore,
  decodeNativeMessage,
  encodeNativeMessage,
  serializeLocalGrantStore,
  type LocalClientGrant,
  type LocalClientIdentity
} from "@nsealr/client";
import { runServiceOnce, runServiceOnceAsync } from "./index.js";
import {
  SERVICE_ACCOUNT_STORE_FORMAT,
  contextArgsFromCliArgs,
  loadServiceContextFromFiles,
  parseServiceAccountStore
} from "./context.js";
import { SERVICE_ROUTE_DRIVER_STORE_FORMAT } from "./drivers.js";

const specsRoot = resolveSpecsRoot();
const account = JSON.parse(readFileSync(
  resolve(specsRoot, "vectors/accounts/raspberry-qr-nip06-account-0.json"),
  "utf8"
));
const esp32Account = JSON.parse(readFileSync(
  resolve(specsRoot, "vectors/accounts/esp32-usb-device-slot-0.json"),
  "utf8"
));
const request = JSON.parse(readFileSync(resolve(specsRoot, "examples/request-kind-1-basic.json"), "utf8"));
const response = JSON.parse(readFileSync(resolve(specsRoot, "examples/response-kind-1-basic.json"), "utf8"));
const client: LocalClientIdentity = {
  surface: "browser_extension",
  origin: "extension:nsealr-context-test",
  app_name: "nSealr context test"
};
const grant: LocalClientGrant = {
  client_id: clientIdForIdentity(client),
  origin: client.origin,
  surface: client.surface,
  allowed_operations: ["select_account_route", "validate_signer_request"],
  approved_at: 1_900_000_000,
  expires_at: 2_000_000_000
};
const dispatchGrant: LocalClientGrant = {
  ...grant,
  allowed_operations: ["dispatch_signer_request"]
};

function accountStore(accounts = [account]): Record<string, unknown> {
  return {
    format: SERVICE_ACCOUNT_STORE_FORMAT,
    updated_at: 1_900_000_000,
    accounts,
    contains_secret_material: false
  };
}

function routeDriverStore(): Record<string, unknown> {
  return {
    format: SERVICE_ROUTE_DRIVER_STORE_FORMAT,
    updated_at: 1_900_000_000,
    contains_secret_material: false,
    routes: [{
      account_id: "acct-esp32-usb-slot-0",
      route_type: "esp32_usb_nip46",
      transport: "usb",
      driver: "serial_line",
      serial_line: {
        path: "/dev/cu.usbmodem-test",
        response_timeout_ms: 1000
      }
    }]
  };
}

function withTempFiles(files: Record<string, string>, fn: (paths: Record<string, string>) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "nsealr-service-context-"));
  try {
    const paths: Record<string, string> = {};
    for (const [name, contents] of Object.entries(files)) {
      paths[name] = join(dir, name);
      writeFileSync(paths[name], contents);
    }
    fn(paths);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function withTempFilesAsync(
  files: Record<string, string>,
  fn: (paths: Record<string, string>) => Promise<void>
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "nsealr-service-context-"));
  try {
    const paths: Record<string, string> = {};
    for (const [name, contents] of Object.entries(files)) {
      paths[name] = join(dir, name);
      writeFileSync(paths[name], contents);
    }
    await fn(paths);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("service context loading", () => {
  it("loads explicit secretless grant and account files for local-service requests", () => {
    withTempFiles({
      "grants.json": serializeLocalGrantStore(createLocalGrantStore([grant], { updatedAt: 1_900_000_000 })),
      "accounts.json": `${JSON.stringify(accountStore(), null, 2)}\n`
    }, (paths) => {
      const context = loadServiceContextFromFiles({
        grantStorePath: paths["grants.json"],
        accountStorePath: paths["accounts.json"],
        now: 1_900_000_000
      });

      const output = runServiceOnce(encodeNativeMessage({
        version: 1,
        request_id: "ctx-route-1",
        operation: "select_account_route",
        params: {
          client,
          route_request: {
            account_id: "acct-raspberry-qr-nip06-account-0",
            method: "sign_event"
          }
        }
      }), context);

      expect(decodeNativeMessage(output)).toMatchObject({
        request_id: "ctx-route-1",
        ok: true,
        result: {
          route_selection: {
            account_id: "acct-raspberry-qr-nip06-account-0",
            contains_secret_material: false
          }
        }
      });
    });
  });

  it("keeps loaded context reusable for signer-request validation", () => {
    withTempFiles({
      "grants.json": serializeLocalGrantStore(createLocalGrantStore([grant], { updatedAt: 1_900_000_000 }))
    }, (paths) => {
      const context = loadServiceContextFromFiles({
        grantStorePath: paths["grants.json"],
        now: 1_900_000_000
      });

      const output = runServiceOnce(encodeNativeMessage({
        version: 1,
        request_id: "ctx-validate-1",
        operation: "validate_signer_request",
        params: {
          client,
          request
        }
      }), context);

      expect(decodeNativeMessage(output)).toMatchObject({
        request_id: "ctx-validate-1",
        ok: true,
        result: {
          validation: { valid: true }
        }
      });
    });
  });

  it("keeps loaded context secretless when dispatch is authorized but unavailable", () => {
    withTempFiles({
      "grants.json": serializeLocalGrantStore(createLocalGrantStore([dispatchGrant], { updatedAt: 1_900_000_000 })),
      "accounts.json": `${JSON.stringify(accountStore(), null, 2)}\n`
    }, (paths) => {
      const context = loadServiceContextFromFiles({
        grantStorePath: paths["grants.json"],
        accountStorePath: paths["accounts.json"],
        now: 1_900_000_000
      });

      const output = runServiceOnce(encodeNativeMessage({
        version: 1,
        request_id: "ctx-dispatch-unavailable",
        operation: "dispatch_signer_request",
        params: {
          client,
          route_request: {
            account_id: "acct-raspberry-qr-nip06-account-0",
            method: "sign_event"
          },
          request
        }
      }), context);

      expect(decodeNativeMessage(output)).toMatchObject({
        request_id: "ctx-dispatch-unavailable",
        ok: false,
        error: {
          code: "signer_route_unavailable",
          message: "signer dispatch is not configured"
        }
      });
    });
  });

  it("loads explicit route-driver files for async dispatch only when an opener is injected", async () => {
    const written: string[] = [];
    await withTempFilesAsync({
      "grants.json": serializeLocalGrantStore(createLocalGrantStore([dispatchGrant], { updatedAt: 1_900_000_000 })),
      "accounts.json": `${JSON.stringify(accountStore([esp32Account]), null, 2)}\n`,
      "drivers.json": `${JSON.stringify(routeDriverStore(), null, 2)}\n`
    }, async (paths) => {
      expect(() => loadServiceContextFromFiles({
        grantStorePath: paths["grants.json"],
        accountStorePath: paths["accounts.json"],
        routeDriverStorePath: paths["drivers.json"],
        now: 1_900_000_000
      })).toThrow(/requires an explicit serial-line opener/u);

      const context = loadServiceContextFromFiles({
        grantStorePath: paths["grants.json"],
        accountStorePath: paths["accounts.json"],
        routeDriverStorePath: paths["drivers.json"],
        now: 1_900_000_000,
        openSerialLinePort: (path) => {
          expect(path).toBe("/dev/cu.usbmodem-test");
          return {
            writeLine: async (line) => {
              written.push(line);
            },
            readLine: async () => encodeSerialFrame({ type: "response", payload: response })
          };
        }
      });

      const output = await runServiceOnceAsync(encodeNativeMessage({
        version: 1,
        request_id: "ctx-dispatch-serial",
        operation: "dispatch_signer_request",
        params: {
          client,
          route_request: {
            account_id: "acct-esp32-usb-slot-0",
            method: "sign_event",
            route_type: "esp32_usb_nip46"
          },
          request
        }
      }), context);

      expect(decodeNativeMessage(output)).toMatchObject({
        request_id: "ctx-dispatch-serial",
        ok: true,
        result: {
          signer_response: response
        }
      });
    });
    expect(written[0]).toMatch(/^nsealr1f:request:/u);
  });

  it("rejects account stores that contain secret material", () => {
    expect(() => parseServiceAccountStore({
      ...accountStore(),
      contains_secret_material: true
    })).toThrow(/must not contain secret material/u);

    expect(() => parseServiceAccountStore(accountStore([{
      ...account,
      mnemonic: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
    }]))).toThrow(/secret field mnemonic/u);
  });

  it("rejects malformed account-store structure", () => {
    expect(() => parseServiceAccountStore({
      ...accountStore(),
      unexpected: true
    })).toThrow(/unsupported fields/u);

    expect(() => parseServiceAccountStore({
      ...accountStore(),
      accounts: new Array(257).fill({})
    })).toThrow(/too many accounts/u);

    expect(() => parseServiceAccountStore(accountStore([account, account]))).toThrow(
      /account_id is duplicated/u
    );
  });

  it("parses explicit context CLI args without accepting implicit defaults", () => {
    expect(contextArgsFromCliArgs([
      "--",
      "--grant-store",
      "/tmp/grants.json",
      "--account-store",
      "/tmp/accounts.json",
      "--route-driver-store",
      "/tmp/drivers.json",
      "--now",
      "1900000000"
    ])).toEqual({
      grantStorePath: "/tmp/grants.json",
      accountStorePath: "/tmp/accounts.json",
      routeDriverStorePath: "/tmp/drivers.json",
      now: 1_900_000_000
    });

    expect(() => contextArgsFromCliArgs(["--grant-store"])).toThrow(/--grant-store requires a value/u);
    expect(() => contextArgsFromCliArgs(["--now", "not-a-number"])).toThrow(/--now must be a non-negative integer/u);
    expect(() => contextArgsFromCliArgs([
      "--grant-store",
      "/tmp/one.json",
      "--grant-store",
      "/tmp/two.json"
    ])).toThrow(/--grant-store is duplicated/u);
    expect(() => contextArgsFromCliArgs([
      "--route-driver-store",
      "/tmp/one.json",
      "--route-driver-store",
      "/tmp/two.json"
    ])).toThrow(/--route-driver-store is duplicated/u);
    expect(() => contextArgsFromCliArgs(["--unknown"])).toThrow(/unsupported service option/u);
  });
});
