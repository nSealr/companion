import { describe, expect, it } from "vitest";
import {
  NATIVE_HOST_DESCRIPTION,
  NATIVE_HOST_NAME,
  buildNativeHostManifest
} from "./index.js";

const chromiumExtensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const hostPath = "/Applications/nSealr/nsealr-service";

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
});
