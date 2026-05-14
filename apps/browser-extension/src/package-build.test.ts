import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT,
  buildBrowserExtensionPackage
} from "./package-build.js";
import {
  BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE,
  BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE,
  BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE
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

const routeConfig = {
  format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
  account_id: "esp32-usb-slot-0",
  route_type: "esp32_usb_nip46"
};

describe("browser extension package build", () => {
  it("writes a deterministic secretless package artifact to a new output directory", async () => {
    const temp = tempOutDir();
    try {
      const result = await buildBrowserExtensionPackage({
        target: "chromium",
        outDir: temp.outDir,
        routeConfig,
        contentScriptMatches: ["https://example.com/*"]
      });

      expect(result).toEqual({
        format: BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT,
        target: "chromium",
        out_dir: temp.outDir,
        files: [
          "manifest.json",
          BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE,
          BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE,
          BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE
        ],
        installs_native_host_manifest: false,
        writes_extension_storage: false,
        stores_production_secrets: false,
        dispatches_signers: false
      });
      for (const file of result.files) {
        expect(existsSync(join(temp.outDir, file))).toBe(true);
      }

      const manifest = JSON.parse(readFileSync(join(temp.outDir, "manifest.json"), "utf8"));
      expect(manifest.permissions).toEqual(["nativeMessaging"]);
      expect("host_permissions" in manifest).toBe(false);
      expect(manifest.content_scripts[0].matches).toEqual(["https://example.com/*"]);
      expect(manifest.web_accessible_resources).toEqual([{
        resources: [BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE],
        matches: ["https://example.com/*"]
      }]);

      const background = readFileSync(join(temp.outDir, BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE), "utf8");
      expect(background).toContain("esp32-usb-slot-0");
      expect(background).not.toMatch(/(?:\bprocess\s*(?:\.|\[)|typeof\s+process|globalThis\.process)/u);
      expect(background).not.toMatch(/(?:\bBuffer\s*(?:\.|\[)|new\s+Buffer\b|typeof\s+Buffer|globalThis\.Buffer)/u);
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
        routeConfig
      });
      await expect(buildBrowserExtensionPackage({
        target: "chromium",
        outDir: existing.outDir,
        routeConfig
      })).rejects.toThrow(/already exists/u);

      await expect(buildBrowserExtensionPackage({
        target: "chromium",
        outDir: invalidRoute.outDir,
        routeConfig: {
          format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
          account_id: "bad account id"
        }
      })).rejects.toThrow(/account_id/u);
      expect(existsSync(invalidRoute.outDir)).toBe(false);
    } finally {
      existing.cleanup();
      invalidRoute.cleanup();
    }
  });
});
