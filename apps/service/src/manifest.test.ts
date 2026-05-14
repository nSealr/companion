import { describe, expect, it } from "vitest";
import {
  NATIVE_HOST_NAME,
  nativeHostManifestJsonFromArgs
} from "./manifest.js";

const chromiumExtensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("native host manifest CLI args", () => {
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
    expect(() => nativeHostManifestJsonFromArgs([
      "--native-host-manifest",
      "chromium",
      "--host-path"
    ])).toThrow(/host-path requires/u);
    expect(() => nativeHostManifestJsonFromArgs([
      "--native-host-manifest",
      "chromium",
      "--host-path",
      "/Applications/nSealr/nsealr-service",
      "--extension-id",
      "bad-extension"
    ])).toThrow(/chromium extension id/u);
  });
});
