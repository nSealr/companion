import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decidePolicyRequest,
  parseAccountDescriptor,
  parseGrantDescriptor,
  parsePolicyProfile,
  selectAccountRoute
} from "./policy.js";

const specsRoot = resolveSpecsRoot();

function resolveSpecsRoot(preferredRoot = resolve("../specs")): string {
  if (existsSync(resolve(preferredRoot, "vectors")) && existsSync(resolve(preferredRoot, "examples"))) {
    return preferredRoot;
  }
  const fallbackRoot = resolve(process.cwd(), "tests/fixtures/specs");
  if (existsSync(resolve(fallbackRoot, "vectors")) && existsSync(resolve(fallbackRoot, "examples"))) {
    return fallbackRoot;
  }
  return preferredRoot;
}

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("identity, recovery, and policy contracts", () => {
  it("parses shared account, policy, and grant descriptors", () => {
    const account = parseAccountDescriptor(
      loadJson(resolve(specsRoot, "vectors/accounts/raspberry-qr-nip06-account-0.json"))
    );
    const policy = parsePolicyProfile(loadJson(resolve(specsRoot, "vectors/policies/manual-only-qr-vault.json")));
    const grant = parseGrantDescriptor(loadJson(resolve(specsRoot, "vectors/grants/esp32-usb-kind-1-session.json")));

    expect(account.signer_route.type).toBe("raspberry_qr_vault");
    expect(account.capabilities.persistent_grants).toBe(false);
    expect(policy.mode).toBe("manual_only");
    expect(policy.grants_allowed).toBe(false);
    expect(grant.route_type).toBe("esp32_usb_nip46");
    expect(grant.permission).toEqual({ method: "sign_event", parameter: "1", event_kind: 1 });
  });

  it("rejects account descriptors that embed recoverable secret material", () => {
    const account = loadJson(resolve(specsRoot, "vectors/accounts/raspberry-qr-nip06-account-0.json")) as {
      recovery: Record<string, unknown>;
    };
    account.recovery.mnemonic = "leader monkey parrot ring guide accident before fence cannon height naive bean";

    expect(() => parseAccountDescriptor(account)).toThrow(/secret field recovery.mnemonic/u);
  });

  it("rejects QR vault policy automation", () => {
    const policy = loadJson(resolve(specsRoot, "vectors/policies/manual-only-qr-vault.json")) as Record<string, unknown>;
    policy.mode = "scoped_automation";
    policy.grants_allowed = true;

    expect(() => parsePolicyProfile(policy)).toThrow(/QR vault routes must remain manual_only/u);
  });

  it("rejects wildcard grants and stateless QR vault grant targets", () => {
    const grant = loadJson(resolve(specsRoot, "vectors/grants/esp32-usb-kind-1-session.json")) as {
      route_type: string;
      permission: Record<string, unknown>;
    };
    grant.route_type = "esp32_qr_vault";
    grant.permission.method = "*";

    expect(() => parseGrantDescriptor(grant)).toThrow(/stateless QR vault/u);
    expect(() => parseGrantDescriptor({ ...grant, route_type: "esp32_usb_nip46" })).toThrow(/wildcard/u);
  });

  it("rejects decrypt grants because decrypt operations require manual review", () => {
    const grant = loadJson(resolve(specsRoot, "vectors/grants/esp32-usb-kind-1-session.json")) as {
      permission: Record<string, unknown>;
    };
    grant.permission = { method: "nip44_decrypt" };

    expect(() => parseGrantDescriptor(grant)).toThrow(/decrypt grant permissions require manual review/u);
  });

  it("matches shared policy decision vectors without a persistent grant store", () => {
    const policy = parsePolicyProfile(loadJson(resolve(specsRoot, "vectors/policies/scoped-automation-daily-use.json")));
    const grant = parseGrantDescriptor(loadJson(resolve(specsRoot, "vectors/grants/esp32-usb-kind-1-session.json")));
    const vectorNames = [
      "export-secret-denied",
      "grant-sign-event-kind-1-allowed",
      "grant-sign-event-kind-1-expired",
      "grant-sign-event-kind-1-revoked",
      "nip44-decrypt-manual-review",
      "unknown-method-manual-review"
    ];

    for (const name of vectorNames) {
      const vector = loadJson(resolve(specsRoot, `vectors/policy-decisions/${name}.json`)) as {
        request: Parameters<typeof decidePolicyRequest>[0]["request"];
        decision: ReturnType<typeof decidePolicyRequest>;
      };

      expect(decidePolicyRequest({
        policy,
        grants: [grant],
        request: vector.request
      })).toEqual(vector.decision);
    }
  });

  it("matches shared route-selection vectors without signer dispatch", () => {
    const accounts = readdirSync(resolve(specsRoot, "vectors/accounts"))
      .filter((name) => name.endsWith(".json"))
      .map((name) => parseAccountDescriptor(loadJson(resolve(specsRoot, "vectors/accounts", name))));
    const vectorNames = readdirSync(resolve(specsRoot, "vectors/route-selections"))
      .filter((name) => name.endsWith(".json"))
      .sort();

    expect(vectorNames.length).toBeGreaterThan(0);
    for (const name of vectorNames) {
      const vector = loadJson(resolve(specsRoot, "vectors/route-selections", name)) as {
        request: Parameters<typeof selectAccountRoute>[1];
        selection: ReturnType<typeof selectAccountRoute>;
      };

      expect(selectAccountRoute(accounts, vector.request)).toEqual(vector.selection);
    }
  });

  it("rejects ambiguous or unsupported route selections before signer IO", () => {
    const account = parseAccountDescriptor(loadJson(resolve(specsRoot, "vectors/accounts/raspberry-qr-nip06-account-0.json")));

    expect(() => selectAccountRoute([account], undefined as never)).toThrow(/request must be an object/u);
    expect(() => selectAccountRoute([], {
      account_id: account.account_id,
      method: "sign_event"
    })).toThrow(/account_id is unknown/u);
    expect(() => selectAccountRoute([account, account], {
      account_id: account.account_id,
      method: "sign_event"
    })).toThrow(/account_id is ambiguous/u);
    expect(() => selectAccountRoute([account], {
      account_id: account.account_id,
      method: "get_public_key"
    })).toThrow(/method is unsupported/u);
    expect(() => selectAccountRoute([account], {
      account_id: account.account_id,
      method: "sign_event",
      route_type: "esp32_usb_nip46"
    })).toThrow(/route_type does not match/u);
  });
});
