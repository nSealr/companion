import { describe, expect, it } from "vitest";
import {
  BROWSER_EXTENSION_DESCRIPTION,
  BROWSER_EXTENSION_NAME,
  BROWSER_EXTENSION_VERSION,
  browserExtensionManifestJson,
  buildBrowserExtensionManifest
} from "./manifest.js";

describe("browser extension manifest boundary", () => {
  it("builds a minimal Chromium manifest without page or storage permissions", () => {
    const manifest = buildBrowserExtensionManifest({ target: "chromium" });
    expect(manifest).toEqual({
      manifest_version: 3,
      name: BROWSER_EXTENSION_NAME,
      description: BROWSER_EXTENSION_DESCRIPTION,
      version: BROWSER_EXTENSION_VERSION,
      permissions: ["nativeMessaging"],
      background: {
        service_worker: "background.js",
        type: "module"
      },
      action: {
        default_title: BROWSER_EXTENSION_NAME
      }
    });
    expect("host_permissions" in manifest).toBe(false);
    expect("optional_host_permissions" in manifest).toBe(false);
    expect("content_scripts" in manifest).toBe(false);
    expect(manifest.permissions).not.toContain("storage");
  });

  it("builds a Firefox manifest only with an explicit reviewed extension id", () => {
    const manifest = buildBrowserExtensionManifest({
      target: "firefox",
      firefoxExtensionId: "extension@nsealr.dev"
    });
    expect(manifest).toMatchObject({
      manifest_version: 3,
      permissions: ["nativeMessaging"],
      browser_specific_settings: {
        gecko: {
          id: "extension@nsealr.dev"
        }
      }
    });
    expect("host_permissions" in manifest).toBe(false);
    expect("optional_host_permissions" in manifest).toBe(false);
  });

  it("renders deterministic manifest JSON", () => {
    expect(JSON.parse(browserExtensionManifestJson({ target: "chromium" }))).toEqual(
      buildBrowserExtensionManifest({ target: "chromium" })
    );
  });

  it("rejects ambiguous packaging inputs", () => {
    expect(() => buildBrowserExtensionManifest({
      target: "firefox"
    })).toThrow(/firefox extension id/u);
    expect(() => buildBrowserExtensionManifest({
      target: "chromium",
      name: ""
    })).toThrow(/name/u);
    expect(() => buildBrowserExtensionManifest({
      target: "chromium",
      version: "0.1.0-beta"
    })).toThrow(/version/u);
  });
});
