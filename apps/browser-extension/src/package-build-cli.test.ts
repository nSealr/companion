import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  browserExtensionPackageBuildJsonFromArgs
} from "./package-build-cli.js";
import { BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT } from "./package-build.js";

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

describe("browser extension package-build CLI", () => {
  it("writes a Chromium package build from explicit args", async () => {
    const temp = tempBuildRoot();
    try {
      const result = JSON.parse(await browserExtensionPackageBuildJsonFromArgs([
        "--target",
        "chromium",
        "--out-dir",
        temp.outDir,
        "--route-account-id",
        "esp32-usb-slot-0",
        "--route-type",
        "esp32_usb_nip46",
        "--content-script-match",
        "https://example.com/*"
      ]));

      expect(result).toMatchObject({
        format: BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT,
        target: "chromium",
        out_dir: temp.outDir,
        installs_native_host_manifest: false,
        writes_extension_storage: false,
        stores_production_secrets: false,
        dispatches_signers: false
      });
      expect(existsSync(join(temp.outDir, "manifest.json"))).toBe(true);
    } finally {
      temp.cleanup();
    }
  });

  it("rejects unsupported or incomplete package-build args before output", async () => {
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
      "--target",
      "firefox",
      "--out-dir",
      "/tmp/nsealr-unused",
      "--route-account-id",
      "esp32-usb-slot-0"
    ])).rejects.toThrow(/specified only once/u);
    await expect(browserExtensionPackageBuildJsonFromArgs([
      "--target",
      "chromium",
      "--out-dir",
      "/tmp/nsealr-unused",
      "--route-account-id",
      "esp32-usb-slot-0",
      "--content-script-match",
      "<all_urls>"
    ])).rejects.toThrow(/content script match/u);
  });
});
