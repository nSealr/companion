import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { sha256Utf8Hex } from "@nsealr/core";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT,
  buildBrowserExtensionPackage
} from "./package-build.js";
import {
  approveBrowserExtensionRouteConfigReview,
  createBrowserExtensionRouteConfigReview
} from "./route-config.js";
import {
  approveBrowserExtensionOriginPermissionReview
} from "./pairing.js";
import {
  createBrowserExtensionOriginPermissionStore
} from "./origin-permission-store.js";
import {
  browserExtensionPackagePlanDigest,
  buildBrowserExtensionPackagePlan
} from "./package-plan.js";
import {
  BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE,
  BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE,
  BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE,
  BROWSER_EXTENSION_POPUP_ENTRYPOINT_FILE,
  BROWSER_EXTENSION_POPUP_HTML_FILE
} from "./entrypoints.js";
import { BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT } from "./route-config.js";

function tempOutDir(): { root: string; outDir: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "nsealr-browser-extension-build-"));
  return {
    root,
    outDir: join(root, "extension"),
    cleanup(): void {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

const companionRoot = fileURLToPath(new URL("../../..", import.meta.url));

const routeConfig = {
  format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
  account_id: "esp32-usb-slot-0",
  route_type: "esp32_usb_nip46"
};
const routeConfigReview = createBrowserExtensionRouteConfigReview(routeConfig);
const routeConfigApproval = approveBrowserExtensionRouteConfigReview(routeConfigReview, {
  reviewedRouteConfigDigest: routeConfigReview.route_config_digest,
  approvedAt: 1_900_000_000
});
const chromiumExtensionId = "abcdefghijklmnopabcdefghijklmnop";
const localPairingDigest = "d".repeat(64);
const chromiumNoOriginPackagePlanDigest = browserExtensionPackagePlanDigest(buildBrowserExtensionPackagePlan({
  target: "chromium"
}));
const chromiumPackagePlanDigest = browserExtensionPackagePlanDigest(buildBrowserExtensionPackagePlan({
  target: "chromium",
  contentScriptMatches: ["https://example.com/*"]
}));
const chromiumExtensionStoragePackagePlanDigest = browserExtensionPackagePlanDigest(buildBrowserExtensionPackagePlan({
  target: "chromium",
  popupMode: "origin_permission_approval",
  originPermissionStorageMode: "extension",
  contentScriptMatches: ["https://example.com/*"]
}));
const firefoxPackagePlanDigest = browserExtensionPackagePlanDigest(buildBrowserExtensionPackagePlan({
  target: "firefox",
  firefoxExtensionId: "extension@nsealr.dev"
}));

function originPermissionStore(methods: Array<"get_public_key" | "sign_event"> = ["get_public_key", "sign_event"]): unknown {
  const requestedMethods = methods.map((method) => {
    if (method === "get_public_key") {
      return {
        method,
        label: "Read public key",
        effect: "The page can read the selected account public key through the browser provider."
      };
    }
    return {
      method,
      label: "Request event signatures",
      effect: "The page can ask for Nostr event signatures; the selected signer route still enforces review, approval, and policy."
    };
  });
  return createBrowserExtensionOriginPermissionStore([
    approveBrowserExtensionOriginPermissionReview({
      format: "nsealr-browser-origin-permission-review-v0",
      origin: "https://example.com",
      app_name: "nSealr Browser Extension",
      extension_id: chromiumExtensionId,
      requested_methods: requestedMethods,
      local_pairing_digest: localPairingDigest,
      requires_user_approval: true,
      stores_production_secrets: false,
      creates_grants: false,
      injects_provider: false
    }, {
      reviewedLocalPairingDigest: localPairingDigest,
      approvedAt: 1_900_000_001
    })
  ], {
    updatedAt: 1_900_000_002
  });
}

describe("browser extension package build", () => {
  it("writes a deterministic secretless package artifact to a new output directory", async () => {
    const temp = tempOutDir();
    try {
      const result = await buildBrowserExtensionPackage({
        target: "chromium",
        outDir: temp.outDir,
        packagePlanDigest: chromiumPackagePlanDigest,
        routeConfig,
        routeConfigApproval,
        contentScriptMatches: ["https://example.com/*"],
        extensionId: chromiumExtensionId,
        originPermissionStore: originPermissionStore(),
        localPairingDigest
      });

      expect(result).toEqual({
        format: BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT,
        target: "chromium",
        out_dir: temp.outDir,
        package_plan_digest: chromiumPackagePlanDigest,
        route_config_digest: routeConfigReview.route_config_digest,
        route_account_id: "esp32-usb-slot-0",
        route_type: "esp32_usb_nip46",
        popup_mode: "pending_requests",
        origin_permission_mode: "embedded",
        extension_id: chromiumExtensionId,
        local_pairing_digest: localPairingDigest,
        content_script_origins: ["https://example.com"],
        package_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
        files: [
          expect.objectContaining({ path: "manifest.json", sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) }),
          expect.objectContaining({
            path: BROWSER_EXTENSION_POPUP_HTML_FILE,
            sha256: expect.stringMatching(/^[0-9a-f]{64}$/u)
          }),
          expect.objectContaining({
            path: BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE,
            sha256: expect.stringMatching(/^[0-9a-f]{64}$/u)
          }),
          expect.objectContaining({
            path: BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE,
            sha256: expect.stringMatching(/^[0-9a-f]{64}$/u)
          }),
          expect.objectContaining({
            path: BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE,
            sha256: expect.stringMatching(/^[0-9a-f]{64}$/u)
          }),
          expect.objectContaining({
            path: BROWSER_EXTENSION_POPUP_ENTRYPOINT_FILE,
            sha256: expect.stringMatching(/^[0-9a-f]{64}$/u)
          })
        ],
        installs_native_host_manifest: false,
        writes_extension_storage: false,
        stores_production_secrets: false,
        dispatches_signers: false,
        uses_active_tab_permission: false,
        embeds_origin_permission_store: true,
        uses_extension_origin_permission_storage: false
      });
      for (const file of result.files) {
        const path = join(temp.outDir, file.path);
        expect(existsSync(path)).toBe(true);
        const source = readFileSync(path, "utf8");
        expect(file.bytes).toBe(new TextEncoder().encode(source).byteLength);
        expect(file.sha256).toBe(sha256Utf8Hex(source));
      }
      expect(result.package_digest).toBe(sha256Utf8Hex(JSON.stringify({
        format: "nsealr-browser-extension-package-digest-v0",
        target: "chromium",
        files: result.files
      })));

      const manifest = JSON.parse(readFileSync(join(temp.outDir, "manifest.json"), "utf8"));
      expect(manifest.permissions).toEqual(["nativeMessaging"]);
      expect("host_permissions" in manifest).toBe(false);
      expect(manifest.action.default_popup).toBe(BROWSER_EXTENSION_POPUP_HTML_FILE);
      expect(manifest.content_scripts[0].matches).toEqual(["https://example.com/*"]);
      expect(manifest.web_accessible_resources).toEqual([{
        resources: [BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE],
        matches: ["https://example.com/*"]
      }]);

      const background = readFileSync(join(temp.outDir, BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE), "utf8");
      expect(background).toContain("esp32-usb-slot-0");
      expect(background).toContain(localPairingDigest);
      expect(background).not.toMatch(/(?:\bprocess\s*(?:\.|\[)|typeof\s+process|globalThis\.process)/u);
      expect(background).not.toMatch(/(?:\bBuffer\s*(?:\.|\[)|new\s+Buffer\b|typeof\s+Buffer|globalThis\.Buffer)/u);
      const popupHtml = readFileSync(join(temp.outDir, BROWSER_EXTENSION_POPUP_HTML_FILE), "utf8");
      expect(popupHtml).toContain(BROWSER_EXTENSION_POPUP_ENTRYPOINT_FILE);
      expect(popupHtml).toContain("nsealr-popup-root");
    } finally {
      temp.cleanup();
    }
  });

  it("writes a Firefox package artifact with explicit browser settings", async () => {
    const temp = tempOutDir();
    try {
      const firefoxExtensionId = "extension@nsealr.dev";
      const result = await buildBrowserExtensionPackage({
        target: "firefox",
        outDir: temp.outDir,
        packagePlanDigest: firefoxPackagePlanDigest,
        routeConfig,
        routeConfigApproval,
        firefoxExtensionId
      });

      expect(result).toMatchObject({
        format: BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT,
        target: "firefox",
        out_dir: temp.outDir,
        package_plan_digest: firefoxPackagePlanDigest,
        route_config_digest: routeConfigReview.route_config_digest,
        route_account_id: "esp32-usb-slot-0",
        route_type: "esp32_usb_nip46",
        popup_mode: "pending_requests",
        origin_permission_mode: "none",
        content_script_origins: [],
        installs_native_host_manifest: false,
        writes_extension_storage: false,
        stores_production_secrets: false,
        dispatches_signers: false,
        uses_active_tab_permission: false,
        embeds_origin_permission_store: false,
        uses_extension_origin_permission_storage: false
      });
      expect("extension_id" in result).toBe(false);
      expect("local_pairing_digest" in result).toBe(false);
      const manifest = JSON.parse(readFileSync(join(temp.outDir, "manifest.json"), "utf8"));
      expect(manifest.permissions).toEqual(["nativeMessaging"]);
      expect(manifest.browser_specific_settings).toEqual({
        gecko: {
          id: firefoxExtensionId
        }
      });
      expect("content_scripts" in manifest).toBe(false);
      expect("host_permissions" in manifest).toBe(false);
    } finally {
      temp.cleanup();
    }
  });

  it("allows reviewed release-artifact package output inside the repo", async () => {
    const outDir = join(companionRoot, "release-artifacts", "browser-extension", `package-build-test-${process.pid}`);
    rmSync(outDir, { recursive: true, force: true });
    try {
      const result = await buildBrowserExtensionPackage({
        target: "firefox",
        outDir,
        packagePlanDigest: firefoxPackagePlanDigest,
        routeConfig,
        routeConfigApproval,
        firefoxExtensionId: "extension@nsealr.dev"
      });

      expect(result.out_dir).toBe(outDir);
      expect(existsSync(join(outDir, "manifest.json"))).toBe(true);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("writes an explicit storage-backed origin approval package artifact", async () => {
    const temp = tempOutDir();
    try {
      const result = await buildBrowserExtensionPackage({
        target: "chromium",
        outDir: temp.outDir,
        packagePlanDigest: chromiumExtensionStoragePackagePlanDigest,
        routeConfig,
        routeConfigApproval,
        contentScriptMatches: ["https://example.com/*"],
        extensionId: chromiumExtensionId,
        originPermissionMode: "extension_storage",
        localPairingDigest
      });

      expect(result).toMatchObject({
        format: BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT,
        target: "chromium",
        out_dir: temp.outDir,
        package_plan_digest: chromiumExtensionStoragePackagePlanDigest,
        route_config_digest: routeConfigReview.route_config_digest,
        route_account_id: "esp32-usb-slot-0",
        route_type: "esp32_usb_nip46",
        popup_mode: "origin_permission_approval",
        origin_permission_mode: "extension_storage",
        extension_id: chromiumExtensionId,
        local_pairing_digest: localPairingDigest,
        content_script_origins: ["https://example.com"],
        installs_native_host_manifest: false,
        writes_extension_storage: false,
        stores_production_secrets: false,
        dispatches_signers: false,
        uses_active_tab_permission: true,
        embeds_origin_permission_store: false,
        uses_extension_origin_permission_storage: true
      });
      const manifest = JSON.parse(readFileSync(join(temp.outDir, "manifest.json"), "utf8"));
      expect(manifest.permissions).toEqual(["nativeMessaging", "activeTab", "storage"]);
      expect("host_permissions" in manifest).toBe(false);
      expect("optional_host_permissions" in manifest).toBe(false);
      const background = readFileSync(join(temp.outDir, BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE), "utf8");
      const popup = readFileSync(join(temp.outDir, BROWSER_EXTENSION_POPUP_ENTRYPOINT_FILE), "utf8");
      expect(background).toContain("originPermissionStorage");
      expect(background).toContain(localPairingDigest);
      expect(popup).toContain("active_tab");
      expect(popup).toContain(chromiumExtensionId);
    } finally {
      temp.cleanup();
    }
  });

  it("rejects ambiguous or unsafe package builds before writing output", async () => {
    const existing = tempOutDir();
    const invalidRoute = tempOutDir();
    try {
      await buildBrowserExtensionPackage({
        target: "chromium",
        outDir: existing.outDir,
        packagePlanDigest: chromiumNoOriginPackagePlanDigest,
        routeConfig,
        routeConfigApproval
      });
      await expect(buildBrowserExtensionPackage({
        target: "chromium",
        outDir: existing.outDir,
        packagePlanDigest: chromiumNoOriginPackagePlanDigest,
        routeConfig,
        routeConfigApproval
      })).rejects.toThrow(/already exists/u);

      await expect(buildBrowserExtensionPackage({
        target: "chromium",
        outDir: invalidRoute.outDir,
        packagePlanDigest: chromiumNoOriginPackagePlanDigest,
        routeConfig: {
          format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
          account_id: "bad account id",
          route_type: "esp32_usb_nip46"
        },
        routeConfigApproval
      })).rejects.toThrow(/account_id/u);
      expect(existsSync(invalidRoute.outDir)).toBe(false);
      await expect(buildBrowserExtensionPackage({
        target: "chromium",
        outDir: invalidRoute.outDir,
        packagePlanDigest: chromiumNoOriginPackagePlanDigest,
        routeConfig: {
          format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
          account_id: "esp32-qr-account-0",
          route_type: "esp32_qr_vault"
        },
        routeConfigApproval
      })).rejects.toThrow(/browser-dispatchable/u);
      expect(existsSync(invalidRoute.outDir)).toBe(false);
      await expect(buildBrowserExtensionPackage({
        target: "chromium",
        outDir: invalidRoute.outDir,
        packagePlanDigest: chromiumPackagePlanDigest,
        routeConfig,
        routeConfigApproval,
        contentScriptMatches: ["https://example.com/*"]
      })).rejects.toThrow(/origin permission store/u);
      expect(existsSync(invalidRoute.outDir)).toBe(false);
      await expect(buildBrowserExtensionPackage({
        target: "chromium",
        outDir: invalidRoute.outDir,
        packagePlanDigest: chromiumExtensionStoragePackagePlanDigest,
        routeConfig,
        routeConfigApproval,
        popupMode: "origin_permission_approval",
        contentScriptMatches: ["https://example.com/*"],
        extensionId: chromiumExtensionId,
        originPermissionStore: originPermissionStore(),
        localPairingDigest
      })).rejects.toThrow(/extension-storage origin permission mode/u);
      expect(existsSync(invalidRoute.outDir)).toBe(false);
      await expect(buildBrowserExtensionPackage({
        target: "chromium",
        outDir: invalidRoute.outDir,
        packagePlanDigest: chromiumExtensionStoragePackagePlanDigest,
        routeConfig,
        routeConfigApproval,
        contentScriptMatches: ["https://example.com/*"],
        extensionId: chromiumExtensionId,
        originPermissionMode: "extension_storage",
        popupMode: "pending_requests",
        localPairingDigest
      })).rejects.toThrow(/origin approval popup/u);
      expect(existsSync(invalidRoute.outDir)).toBe(false);
      await expect(buildBrowserExtensionPackage({
        target: "chromium",
        outDir: invalidRoute.outDir,
        packagePlanDigest: chromiumExtensionStoragePackagePlanDigest,
        routeConfig,
        routeConfigApproval,
        contentScriptMatches: ["https://example.com/*"],
        extensionId: chromiumExtensionId,
        originPermissionMode: "extension_storage",
        originPermissionStore: originPermissionStore(),
        localPairingDigest
      })).rejects.toThrow(/start from browser storage/u);
      expect(existsSync(invalidRoute.outDir)).toBe(false);
      await expect(buildBrowserExtensionPackage({
        target: "chromium",
        outDir: invalidRoute.outDir,
        packagePlanDigest: chromiumPackagePlanDigest,
        routeConfig,
        routeConfigApproval,
        contentScriptMatches: ["https://example.com/*"],
        extensionId: "extension@nsealr.dev",
        originPermissionStore: originPermissionStore(),
        localPairingDigest
      })).rejects.toThrow(/Chromium extension id/u);
      expect(existsSync(invalidRoute.outDir)).toBe(false);
      await expect(buildBrowserExtensionPackage({
        target: "chromium",
        outDir: invalidRoute.outDir,
        packagePlanDigest: chromiumPackagePlanDigest,
        routeConfig,
        routeConfigApproval,
        contentScriptMatches: ["https://example.com/*"],
        extensionId: chromiumExtensionId,
        originPermissionStore: originPermissionStore(["get_public_key"]),
        localPairingDigest
      })).rejects.toThrow(/sign_event/u);
      expect(existsSync(invalidRoute.outDir)).toBe(false);
      await expect(buildBrowserExtensionPackage({
        target: "chromium",
        outDir: invalidRoute.outDir,
        packagePlanDigest: chromiumNoOriginPackagePlanDigest,
        routeConfig,
        routeConfigApproval: {
          ...routeConfigApproval,
          route_config_digest: "0".repeat(64)
        }
      })).rejects.toThrow(/digest mismatch/u);
      expect(existsSync(invalidRoute.outDir)).toBe(false);
      const sourceTreeOutDir = join(companionRoot, "apps", "browser-extension", "src", "generated-extension");
      await expect(buildBrowserExtensionPackage({
        target: "chromium",
        outDir: sourceTreeOutDir,
        packagePlanDigest: chromiumNoOriginPackagePlanDigest,
        routeConfig,
        routeConfigApproval
      })).rejects.toThrow(/outside the companion source tree/u);
      expect(existsSync(sourceTreeOutDir)).toBe(false);
    } finally {
      existing.cleanup();
      invalidRoute.cleanup();
    }
  });
});
