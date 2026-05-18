import { describe, expect, it } from "vitest";
import {
  NATIVE_HOST_INSTALL_PLAN_FORMAT,
  NATIVE_HOST_NAME,
  nativeHostInstallPlanJsonFromArgs,
  nativeHostManifestJsonFromArgs
} from "./manifest.js";

const chromiumExtensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const hostPath = "/Applications/nSealr/nsealr-service";
const manifestPath = "/Users/example/Library/Application Support/Google/Chrome/NativeMessagingHosts/dev.nsealr.companion.json";

describe("native host manifest CLI args", () => {
  it("renders manifest JSON from service CLI arguments", () => {
    expect(JSON.parse(nativeHostManifestJsonFromArgs([
      "--",
      "--native-host-manifest",
      "chromium",
      "--host-path",
      hostPath,
      "--extension-id",
      chromiumExtensionId
    ]))).toEqual({
      name: NATIVE_HOST_NAME,
      description: "nSealr companion native messaging host",
      path: hostPath,
      type: "stdio",
      allowed_origins: [`chrome-extension://${chromiumExtensionId}/`]
    });
  });

  it("renders dry-run native-host install plans from service CLI arguments", () => {
    const plan = JSON.parse(nativeHostInstallPlanJsonFromArgs([
      "--",
      "--native-host-install-plan",
      "chromium",
      "--host-path",
      hostPath,
      "--manifest-path",
      manifestPath,
      "--extension-id",
      chromiumExtensionId
    ]));

    expect(plan).toEqual({
      format: NATIVE_HOST_INSTALL_PLAN_FORMAT,
      browser: "chromium",
      manifest_path: manifestPath,
      manifest: {
        name: NATIVE_HOST_NAME,
        description: "nSealr companion native messaging host",
        path: hostPath,
        type: "stdio",
        allowed_origins: [`chrome-extension://${chromiumExtensionId}/`]
      },
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

  it("rejects unsafe or ambiguous manifest inputs", () => {
    expect(() => nativeHostManifestJsonFromArgs([
      "--native-host-manifest",
      "chromium",
      "--host-path"
    ])).toThrow(/host-path requires/u);
    expect(() => nativeHostManifestJsonFromArgs([
      "--native-host-manifest",
      "chromium",
      "--host-path",
      hostPath,
      "--extension-id",
      "bad-extension"
    ])).toThrow(/chromium extension id/u);
    expect(() => nativeHostInstallPlanJsonFromArgs([
      "--native-host-install-plan",
      "chromium",
      "--host-path",
      hostPath,
      "--manifest-path",
      "/Users/example/native-host.txt",
      "--extension-id",
      chromiumExtensionId
    ])).toThrow(/must end with .json/u);
  });
});
