import { describe, expect, it } from "vitest";
import {
  NATIVE_HOST_INSTALL_APPROVAL_FORMAT,
  NATIVE_HOST_DESCRIPTION,
  NATIVE_HOST_INSTALL_PLAN_FORMAT,
  NATIVE_HOST_NAME,
  approveNativeHostInstallPlan,
  buildNativeHostInstallPlan,
  buildNativeHostManifest,
  parseNativeHostInstallApproval,
  parseNativeHostInstallPlan
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

    const plan = buildNativeHostInstallPlan({
      browser: "chromium",
      hostPath,
      extensionIds: [chromiumExtensionId],
      manifestPath
    });

    expect(plan).toEqual({
      format: NATIVE_HOST_INSTALL_PLAN_FORMAT,
      install_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
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
    expect(parseNativeHostInstallPlan(plan)).toEqual(plan);
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

  it("rejects native-host install plan tampering", () => {
    const plan = buildNativeHostInstallPlan({
      browser: "chromium",
      hostPath,
      extensionIds: [chromiumExtensionId],
      manifestPath
    });

    expect(() => parseNativeHostInstallPlan({
      ...plan,
      writes_files: true
    })).toThrow(/must not write/u);
    expect(() => parseNativeHostInstallPlan({
      ...plan,
      manifest: {
        ...plan.manifest,
        description: "tampered native host"
      }
    })).toThrow(/digest mismatch/u);
    expect(() => parseNativeHostInstallPlan({
      ...plan,
      would_write_files: [{
        ...plan.would_write_files[0],
        access: "overwrite"
      }]
    })).toThrow(/write intent/u);
  });

  it("creates native-host install approval artifacts only after digest confirmation", () => {
    const plan = buildNativeHostInstallPlan({
      browser: "chromium",
      hostPath,
      extensionIds: [chromiumExtensionId],
      manifestPath
    });
    const approval = approveNativeHostInstallPlan(plan, {
      reviewedInstallDigest: plan.install_digest,
      approvedAt: 1_900_000_000
    });

    expect(approval).toEqual({
      format: NATIVE_HOST_INSTALL_APPROVAL_FORMAT,
      install_digest: plan.install_digest,
      approved_at: 1_900_000_000,
      plan,
      requires_user_approval: true,
      writes_files: false,
      stores_production_secrets: false
    });
    expect(parseNativeHostInstallApproval(approval)).toEqual(approval);
    expect(() => approveNativeHostInstallPlan(plan, {
      reviewedInstallDigest: "0".repeat(64),
      approvedAt: 1_900_000_000
    })).toThrow(/digest does not match/u);
    expect(() => approveNativeHostInstallPlan(plan, {
      reviewedInstallDigest: plan.install_digest,
      approvedAt: Number.MAX_SAFE_INTEGER + 1
    })).toThrow(/approvedAt/u);
    expect(() => parseNativeHostInstallApproval({
      ...approval,
      plan: {
        ...plan,
        install_digest: "0".repeat(64)
      }
    })).toThrow(/digest mismatch/u);
  });
});
