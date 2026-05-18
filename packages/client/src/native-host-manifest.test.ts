import { describe, expect, it } from "vitest";
import {
  NATIVE_HOST_DESCRIPTION,
  NATIVE_HOST_INSTALL_PLAN_FORMAT,
  NATIVE_HOST_NAME,
  buildNativeHostInstallPlan,
  buildNativeHostManifest
} from "./index.js";

const chromiumExtensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const hostPath = "/Applications/nSealr/nsealr-service";
const manifestPath = "/Users/example/Library/Application Support/Google/Chrome/NativeMessagingHosts/dev.nsealr.companion.json";

describe("native host manifest contract", () => {
  it("builds a deterministic Chromium native-messaging manifest", () => {
    expect(buildNativeHostManifest({
      browser: "chromium",
      hostPath,
      extensionIds: [chromiumExtensionId, chromiumExtensionId]
    })).toEqual({
      name: NATIVE_HOST_NAME,
      description: NATIVE_HOST_DESCRIPTION,
      path: hostPath,
      type: "stdio",
      allowed_origins: [`chrome-extension://${chromiumExtensionId}/`]
    });
  });

  it("builds a deterministic Firefox native-messaging manifest", () => {
    expect(buildNativeHostManifest({
      browser: "firefox",
      hostPath,
      extensionIds: ["extension@nsealr.dev"]
    })).toEqual({
      name: NATIVE_HOST_NAME,
      description: NATIVE_HOST_DESCRIPTION,
      path: hostPath,
      type: "stdio",
      allowed_extensions: ["extension@nsealr.dev"]
    });
  });

  it("rejects unsafe native-host manifest inputs", () => {
    expect(() => buildNativeHostManifest({
      browser: "chromium",
      hostPath: "relative-service",
      extensionIds: [chromiumExtensionId]
    })).toThrow(/path must be absolute/u);
    expect(() => buildNativeHostManifest({
      browser: "chromium",
      hostPath,
      extensionIds: ["bad-extension"]
    })).toThrow(/chromium extension id/u);
    expect(() => buildNativeHostManifest({
      browser: "firefox",
      hostPath,
      extensionIds: []
    })).toThrow(/at least one extension/u);
  });

  it("builds a dry-run native-host install plan without writing files", () => {
    const manifest = buildNativeHostManifest({
      browser: "chromium",
      hostPath,
      extensionIds: [chromiumExtensionId]
    });

    expect(buildNativeHostInstallPlan({
      browser: "chromium",
      hostPath,
      extensionIds: [chromiumExtensionId],
      manifestPath
    })).toEqual({
      format: NATIVE_HOST_INSTALL_PLAN_FORMAT,
      browser: "chromium",
      manifest_path: manifestPath,
      manifest,
      would_write_files: [{
        purpose: "native_host_manifest",
        path: manifestPath,
        access: "write_new",
        contains_secret_material: false
      }],
      requires_user_approval: true,
      writes_files: false,
      stores_production_secrets: false
    });
  });

  it("rejects unsafe native-host install plan paths", () => {
    expect(() => buildNativeHostInstallPlan({
      browser: "chromium",
      hostPath,
      extensionIds: [chromiumExtensionId],
      manifestPath: "NativeMessagingHosts/dev.nsealr.companion.json"
    })).toThrow(/manifest path must be absolute/u);
    expect(() => buildNativeHostInstallPlan({
      browser: "chromium",
      hostPath,
      extensionIds: [chromiumExtensionId],
      manifestPath: "~/Library/Application Support/Google/Chrome/NativeMessagingHosts/dev.nsealr.companion.json"
    })).toThrow(/expanded/u);
    expect(() => buildNativeHostInstallPlan({
      browser: "chromium",
      hostPath,
      extensionIds: [chromiumExtensionId],
      manifestPath: "/Users/example/../NativeMessagingHosts/dev.nsealr.companion.json"
    })).toThrow(/relative segments/u);
    expect(() => buildNativeHostInstallPlan({
      browser: "chromium",
      hostPath,
      extensionIds: [chromiumExtensionId],
      manifestPath: "/Users/example/NativeMessagingHosts/dev.nsealr.companion.txt"
    })).toThrow(/must end with .json/u);
  });
});
