import { describe, expect, it } from "vitest";
import {
  BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE,
  BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE,
  BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE
} from "./entrypoints.js";
import {
  BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_SOURCE,
  BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_SOURCE,
  BROWSER_EXTENSION_PACKAGE_PLAN_FORMAT,
  BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_SOURCE,
  assertBrowserExtensionPackagePlan,
  browserExtensionPackagePlanJson,
  buildBrowserExtensionPackagePlan,
  type BrowserExtensionPackagePlan
} from "./package-plan.js";

function tamperedPlan(value: unknown): BrowserExtensionPackagePlan {
  return value as BrowserExtensionPackagePlan;
}

describe("browser extension package plan", () => {
  it("builds a secretless Chromium package plan without installing anything", () => {
    const plan = buildBrowserExtensionPackagePlan({ target: "chromium" });

    expect(plan).toMatchObject({
      format: BROWSER_EXTENSION_PACKAGE_PLAN_FORMAT,
      target: "chromium",
      installs_native_host_manifest: false,
      writes_extension_storage: false,
      stores_production_secrets: false,
      dispatches_signers: false
    });
    expect(plan.manifest.background.service_worker).toBe(BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE);
    expect(plan.manifest.permissions).toEqual(["nativeMessaging"]);
    expect("content_scripts" in plan.manifest).toBe(false);
    expect("host_permissions" in plan.manifest).toBe(false);
    expect(plan.entrypoints).toEqual([
      {
        role: "background_service_worker",
        source: BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_SOURCE,
        output: BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE
      },
      {
        role: "content_script",
        source: BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_SOURCE,
        output: BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE
      },
      {
        role: "page_script",
        source: BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_SOURCE,
        output: BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE
      }
    ]);
  });

  it("keeps explicit content-script manifests aligned with the packaged output", () => {
    const plan = buildBrowserExtensionPackagePlan({
      target: "chromium",
      contentScriptMatches: ["https://example.com/*"]
    });

    expect(plan.manifest.content_scripts).toEqual([{
      matches: ["https://example.com/*"],
      js: [BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE],
      run_at: "document_start",
      all_frames: false,
      match_about_blank: false
    }]);
    expect(assertBrowserExtensionPackagePlan(plan)).toBe(plan);
  });

  it("renders deterministic package-plan JSON", () => {
    expect(JSON.parse(browserExtensionPackagePlanJson({ target: "chromium" }))).toEqual(
      buildBrowserExtensionPackagePlan({ target: "chromium" })
    );
  });

  it("rejects package-plan drift before a bundle can be treated as reviewed", () => {
    const plan = buildBrowserExtensionPackagePlan({
      target: "chromium",
      contentScriptMatches: ["https://example.com/*"]
    });

    expect(() => assertBrowserExtensionPackagePlan(tamperedPlan({
      ...plan,
      writes_extension_storage: true
    }))).toThrow(/extension storage/u);
    expect(() => assertBrowserExtensionPackagePlan(tamperedPlan({
      ...plan,
      manifest: {
        ...plan.manifest,
        background: {
          service_worker: "background.js",
          type: "module"
        }
      }
    }))).toThrow(/background output/u);
    expect(() => assertBrowserExtensionPackagePlan(tamperedPlan({
      ...plan,
      manifest: {
        ...plan.manifest,
        permissions: ["nativeMessaging", "storage"]
      }
    }))).toThrow(/storage permission/u);
    expect(() => assertBrowserExtensionPackagePlan(tamperedPlan({
      ...plan,
      manifest: {
        ...plan.manifest,
        content_scripts: [{
          ...plan.manifest.content_scripts![0],
          js: ["content-script.js"]
        }]
      }
    }))).toThrow(/content-script output/u);
    expect(() => assertBrowserExtensionPackagePlan(tamperedPlan({
      ...plan,
      entrypoints: [
        plan.entrypoints[0],
        plan.entrypoints[1],
        {
          ...plan.entrypoints[2],
          source: "apps/browser-extension/src/page-script.ts"
        }
      ]
    }))).toThrow(/page_script entrypoint/u);
  });
});
