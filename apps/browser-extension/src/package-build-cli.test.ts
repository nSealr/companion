import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  browserExtensionPackageBuildJsonFromArgs
} from "./package-build-cli.js";
import {
  browserExtensionPackageVerifyJsonFromArgs
} from "./package-verify-cli.js";
import { BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT } from "./package-build.js";
import {
  BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
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

function tempBuildRoot(): { root: string; outDir: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "nsealr-browser-extension-cli-"));
  return {
    root,
    outDir: join(root, "extension"),
    cleanup(): void {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

function writeRouteConfigApproval(path: string): void {
  const review = createBrowserExtensionRouteConfigReview({
    format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
    account_id: "esp32-usb-slot-0",
    route_type: "esp32_usb_nip46"
  });
  const approval = approveBrowserExtensionRouteConfigReview(review, {
    reviewedRouteConfigDigest: review.route_config_digest,
    approvedAt: 1_900_000_000
  });
  writeFileSync(path, `${JSON.stringify(approval, null, 2)}\n`, "utf8");
}

const localPairingDigest = "d".repeat(64);
const chromiumExtensionId = "abcdefghijklmnopabcdefghijklmnop";
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

function writeOriginPermissionStore(path: string): void {
  const store = createBrowserExtensionOriginPermissionStore([
    approveBrowserExtensionOriginPermissionReview({
      format: "nsealr-browser-origin-permission-review-v0",
      origin: "https://example.com",
      app_name: "nSealr Browser Extension",
      extension_id: chromiumExtensionId,
      requested_methods: [
        {
          method: "get_public_key",
          label: "Read public key",
          effect: "The page can read the selected account public key through the browser provider."
        },
        {
          method: "sign_event",
          label: "Request event signatures",
          effect: "The page can ask for Nostr event signatures; the selected signer route still enforces review, approval, and policy."
        }
      ],
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
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

describe("browser extension package-build CLI", () => {
  it("writes a Chromium package build from explicit args", async () => {
    const temp = tempBuildRoot();
    try {
      const approvalPath = join(temp.root, "route-config-approval.json");
      const originStorePath = join(temp.root, "origin-permission-store.json");
      writeRouteConfigApproval(approvalPath);
      writeOriginPermissionStore(originStorePath);
      const result = JSON.parse(await browserExtensionPackageBuildJsonFromArgs([
        "--target",
        "chromium",
        "--out-dir",
        temp.outDir,
        "--package-plan-digest",
        chromiumPackagePlanDigest,
        "--route-account-id",
        "esp32-usb-slot-0",
        "--route-type",
        "esp32_usb_nip46",
        "--route-config-approval",
        approvalPath,
        "--extension-id",
        chromiumExtensionId,
        "--origin-permission-store",
        originStorePath,
        "--local-pairing-digest",
        localPairingDigest,
        "--content-script-match",
        "https://example.com/*"
      ]));

      expect(result).toMatchObject({
        format: BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT,
        target: "chromium",
        out_dir: temp.outDir,
        route_account_id: "esp32-usb-slot-0",
        route_type: "esp32_usb_nip46",
        popup_mode: "pending_requests",
        manifest_permissions: ["nativeMessaging"],
        origin_permission_mode: "embedded",
        extension_id: chromiumExtensionId,
        local_pairing_digest: localPairingDigest,
        content_script_origins: ["https://example.com"],
        package_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
        package_plan_digest: chromiumPackagePlanDigest,
        installs_native_host_manifest: false,
        writes_extension_storage: false,
        stores_production_secrets: false,
        dispatches_signers: false,
        uses_active_tab_permission: false,
        embeds_origin_permission_store: true,
        uses_extension_origin_permission_storage: false
      });
      expect(result.files).toEqual([
        expect.objectContaining({ path: "manifest.json", sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) }),
        expect.objectContaining({
          path: "nsealr-popup.html",
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/u)
        }),
        expect.objectContaining({
          path: "nsealr-background-entrypoint.js",
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/u)
        }),
        expect.objectContaining({
          path: "nsealr-content-script-entrypoint.js",
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/u)
        }),
        expect.objectContaining({
          path: "nsealr-page-script-entrypoint.js",
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/u)
        }),
        expect.objectContaining({
          path: "nsealr-popup-entrypoint.js",
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/u)
        })
      ]);
      expect(existsSync(join(temp.outDir, "manifest.json"))).toBe(true);
      const buildResultPath = join(temp.root, "package-build-result.json");
      writeFileSync(buildResultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
      await expect(browserExtensionPackageVerifyJsonFromArgs([
        "--build-result",
        buildResultPath
      ])).resolves.toBe(`${JSON.stringify(result, null, 2)}\n`);
    } finally {
      temp.cleanup();
    }
  });

  it("writes a Chromium package build with extension-storage origin approval", async () => {
    const temp = tempBuildRoot();
    try {
      const approvalPath = join(temp.root, "route-config-approval.json");
      writeRouteConfigApproval(approvalPath);
      const result = JSON.parse(await browserExtensionPackageBuildJsonFromArgs([
        "--target",
        "chromium",
        "--out-dir",
        temp.outDir,
        "--package-plan-digest",
        chromiumExtensionStoragePackagePlanDigest,
        "--route-account-id",
        "esp32-usb-slot-0",
        "--route-type",
        "esp32_usb_nip46",
        "--route-config-approval",
        approvalPath,
        "--origin-permission-mode",
        "extension-storage",
        "--local-pairing-digest",
        localPairingDigest,
        "--content-script-match",
        "https://example.com/*"
      ]));

      expect(result).toMatchObject({
        format: BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT,
        target: "chromium",
        route_account_id: "esp32-usb-slot-0",
        route_type: "esp32_usb_nip46",
        popup_mode: "origin_permission_approval",
        manifest_permissions: ["nativeMessaging", "activeTab", "storage"],
        origin_permission_mode: "extension_storage",
        package_plan_digest: chromiumExtensionStoragePackagePlanDigest,
        local_pairing_digest: localPairingDigest,
        content_script_origins: ["https://example.com"],
        uses_active_tab_permission: true,
        embeds_origin_permission_store: false,
        uses_extension_origin_permission_storage: true
      });
      expect("extension_id" in result).toBe(false);
      expect(existsSync(join(temp.outDir, "manifest.json"))).toBe(true);
    } finally {
      temp.cleanup();
    }
  });

  it("writes a Firefox package build from explicit args", async () => {
    const temp = tempBuildRoot();
    try {
      const approvalPath = join(temp.root, "route-config-approval.json");
      writeRouteConfigApproval(approvalPath);
      const result = JSON.parse(await browserExtensionPackageBuildJsonFromArgs([
        "--target",
        "firefox",
        "--firefox-extension-id",
        "extension@nsealr.dev",
        "--out-dir",
        temp.outDir,
        "--package-plan-digest",
        firefoxPackagePlanDigest,
        "--route-account-id",
        "esp32-usb-slot-0",
        "--route-type",
        "esp32_usb_nip46",
        "--route-config-approval",
        approvalPath
      ]));

      expect(result).toMatchObject({
        format: BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT,
        target: "firefox",
        route_account_id: "esp32-usb-slot-0",
        route_type: "esp32_usb_nip46",
        popup_mode: "pending_requests",
        manifest_permissions: ["nativeMessaging"],
        origin_permission_mode: "none",
        package_plan_digest: firefoxPackagePlanDigest,
        content_script_origins: [],
        uses_active_tab_permission: false,
        embeds_origin_permission_store: false,
        uses_extension_origin_permission_storage: false
      });
      expect(existsSync(join(temp.outDir, "manifest.json"))).toBe(true);
    } finally {
      temp.cleanup();
    }
  });

  it("rejects unsupported or incomplete package-build args before output", async () => {
    const temp = tempBuildRoot();
    await expect(browserExtensionPackageBuildJsonFromArgs([])).rejects.toThrow(/out-dir is required|target is required/u);
    await expect(browserExtensionPackageBuildJsonFromArgs([
      "--target",
      "chromium",
      "--out-dir",
      "/tmp/nsealr-unused",
      "--install"
    ])).rejects.toThrow(/unsupported/u);
    await expect(browserExtensionPackageBuildJsonFromArgs([
      "--target",
      "chromium",
      "--out-dir",
      "/tmp/nsealr-unused",
      "--package-plan-digest",
      "0".repeat(64),
      "--route-account-id",
      "esp32-usb-slot-0"
    ])).rejects.toThrow(/route-config-approval/u);
    try {
      const approvalPath = join(temp.root, "route-config-approval.json");
      const originStorePath = join(temp.root, "origin-permission-store.json");
      writeRouteConfigApproval(approvalPath);
      writeOriginPermissionStore(originStorePath);
      await expect(browserExtensionPackageBuildJsonFromArgs([
        "--target",
        "chromium",
        "--out-dir",
        temp.outDir,
        "--route-account-id",
        "esp32-usb-slot-0",
        "--route-type",
        "esp32_usb_nip46",
        "--route-config-approval",
        approvalPath
      ])).rejects.toThrow(/package-plan-digest/u);
      await expect(browserExtensionPackageBuildJsonFromArgs([
        "--target",
        "chromium",
        "--target",
        "firefox",
        "--out-dir",
        temp.outDir,
        "--package-plan-digest",
        chromiumPackagePlanDigest,
        "--route-account-id",
        "esp32-usb-slot-0",
        "--route-config-approval",
        approvalPath
      ])).rejects.toThrow(/specified only once/u);
      await expect(browserExtensionPackageBuildJsonFromArgs([
        "--target",
        "chromium",
        "--out-dir",
        temp.outDir,
        "--package-plan-digest",
        chromiumPackagePlanDigest,
        "--route-account-id",
        "esp32-usb-slot-0",
        "--route-config-approval",
        approvalPath
      ])).rejects.toThrow(/route-type/u);
      await expect(browserExtensionPackageVerifyJsonFromArgs([])).rejects.toThrow(/build-result is required/u);
      await expect(browserExtensionPackageVerifyJsonFromArgs([
        "--build-result",
        "/tmp/missing-package-build-result.json",
        "--build-result",
        "/tmp/other-package-build-result.json"
      ])).rejects.toThrow(/specified only once/u);
      await expect(browserExtensionPackageBuildJsonFromArgs([
        "--target",
        "chromium",
        "--out-dir",
        temp.outDir,
        "--package-plan-digest",
        chromiumPackagePlanDigest,
        "--route-account-id",
        "esp32-qr-account-0",
        "--route-type",
        "esp32_qr_vault",
        "--route-config-approval",
        approvalPath
      ])).rejects.toThrow(/browser-dispatchable/u);
      await expect(browserExtensionPackageBuildJsonFromArgs([
        "--target",
        "chromium",
        "--out-dir",
        temp.outDir,
        "--package-plan-digest",
        chromiumPackagePlanDigest,
        "--route-account-id",
        "esp32-usb-slot-0",
        "--route-type",
        "esp32_usb_nip46",
        "--route-config-approval",
        approvalPath,
        "--content-script-match",
        "<all_urls>"
      ])).rejects.toThrow(/content script match/u);
      await expect(browserExtensionPackageBuildJsonFromArgs([
        "--target",
        "chromium",
        "--out-dir",
        temp.outDir,
        "--package-plan-digest",
        chromiumPackagePlanDigest,
        "--route-account-id",
        "esp32-usb-slot-0",
        "--route-type",
        "esp32_usb_nip46",
        "--route-config-approval",
        approvalPath,
        "--origin-permission-store",
        originStorePath,
        "--local-pairing-digest",
        localPairingDigest,
        "--content-script-match",
        "https://example.com/*"
      ])).rejects.toThrow(/extensionId is required for embedded origin-permission/u);
      await expect(browserExtensionPackageBuildJsonFromArgs([
        "--target",
        "chromium",
        "--out-dir",
        temp.outDir,
        "--package-plan-digest",
        "0".repeat(64),
        "--route-account-id",
        "esp32-usb-slot-0",
        "--route-type",
        "esp32_usb_nip46",
        "--route-config-approval",
        approvalPath,
        "--extension-id",
        chromiumExtensionId,
        "--origin-permission-store",
        originStorePath,
        "--local-pairing-digest",
        localPairingDigest,
        "--content-script-match",
        "https://example.com/*"
      ])).rejects.toThrow(/package plan digest mismatch/u);
    } finally {
      temp.cleanup();
    }
  });
});
