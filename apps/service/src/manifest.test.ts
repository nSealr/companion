import { describe, expect, it } from "vitest";
import {
  NATIVE_HOST_NAME,
  buildNativeHostManifest,
  nativeHostManifestJsonFromArgs
} from "./manifest.js";

const chromiumExtensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("native host manifest", () => {
  it("builds a deterministic Chromium native-messaging manifest", () => {
    expect(buildNativeHostManifest({
      browser: "chromium",
      hostPath: "/Applications/nSealr/nsealr-service",
      extensionIds: [chromiumExtensionId, chromiumExtensionId]
    })).toEqual({
      name: NATIVE_HOST_NAME,
      description: "nSealr companion native messaging host",
      path: "/Applications/nSealr/nsealr-service",
      type: "stdio",
      allowed_origins: [`chrome-extension://${chromiumExtensionId}/`]
    });
  });

  it("builds a deterministic Firefox native-messaging manifest", () => {
    expect(buildNativeHostManifest({
      browser: "firefox",
      hostPath: "/Applications/nSealr/nsealr-service",
      extensionIds: ["extension@nsealr.dev"]
    })).toEqual({
      name: NATIVE_HOST_NAME,
      description: "nSealr companion native messaging host",
      path: "/Applications/nSealr/nsealr-service",
      type: "stdio",
      allowed_extensions: ["extension@nsealr.dev"]
    });
  });

  it("renders manifest JSON from service CLI arguments", () => {
    expect(JSON.parse(nativeHostManifestJsonFromArgs([
      "--",
      "--native-host-manifest",
      "chromium",
      "--host-path",
      "/Applications/nSealr/nsealr-service",
      "--extension-id",
      chromiumExtensionId
    ]))).toEqual({
      name: NATIVE_HOST_NAME,
      description: "nSealr companion native messaging host",
      path: "/Applications/nSealr/nsealr-service",
      type: "stdio",
      allowed_origins: [`chrome-extension://${chromiumExtensionId}/`]
    });
  });

  it("rejects unsafe or ambiguous manifest inputs", () => {
    expect(() => buildNativeHostManifest({
      browser: "chromium",
      hostPath: "relative-service",
      extensionIds: [chromiumExtensionId]
    })).toThrow(/path must be absolute/u);
    expect(() => buildNativeHostManifest({
      browser: "chromium",
      hostPath: "/Applications/nSealr/nsealr-service",
      extensionIds: ["bad-extension"]
    })).toThrow(/chromium extension id/u);
    expect(() => buildNativeHostManifest({
      browser: "firefox",
      hostPath: "/Applications/nSealr/nsealr-service",
      extensionIds: []
    })).toThrow(/at least one extension/u);
    expect(() => nativeHostManifestJsonFromArgs([
      "--native-host-manifest",
      "chromium",
      "--host-path"
    ])).toThrow(/host-path requires/u);
  });
});
