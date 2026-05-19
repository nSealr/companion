import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  browserExtensionPackageBuildJsonFromArgs
} from "./package-build-cli.js";
import { BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT } from "./package-build.js";
import {
  BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
  approveBrowserExtensionRouteConfigReview,
  createBrowserExtensionRouteConfigReview
} from "./route-config.js";

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

describe("browser extension package-build CLI", () => {
  it("writes a Chromium package build from explicit args", async () => {
    const temp = tempBuildRoot();
    try {
      const approvalPath = join(temp.root, "route-config-approval.json");
      writeRouteConfigApproval(approvalPath);
      const result = JSON.parse(await browserExtensionPackageBuildJsonFromArgs([
        "--target",
        "chromium",
        "--out-dir",
        temp.outDir,
        "--route-account-id",
        "esp32-usb-slot-0",
        "--route-type",
        "esp32_usb_nip46",
        "--route-config-approval",
        approvalPath,
        "--content-script-match",
        "https://example.com/*"
      ]));

      expect(result).toMatchObject({
        format: BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT,
        target: "chromium",
        out_dir: temp.outDir,
        package_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
        installs_native_host_manifest: false,
        writes_extension_storage: false,
        stores_production_secrets: false,
        dispatches_signers: false
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
      "--route-account-id",
      "esp32-usb-slot-0"
    ])).rejects.toThrow(/route-config-approval/u);
    try {
      const approvalPath = join(temp.root, "route-config-approval.json");
      writeRouteConfigApproval(approvalPath);
      await expect(browserExtensionPackageBuildJsonFromArgs([
        "--target",
        "chromium",
        "--target",
        "firefox",
        "--out-dir",
        temp.outDir,
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
        "--route-account-id",
        "esp32-usb-slot-0",
        "--route-type",
        "esp32_usb_nip46",
        "--route-config-approval",
        approvalPath,
        "--content-script-match",
        "<all_urls>"
      ])).rejects.toThrow(/content script match/u);
    } finally {
      temp.cleanup();
    }
  });
});
