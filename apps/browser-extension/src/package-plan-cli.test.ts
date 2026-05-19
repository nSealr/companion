import { describe, expect, it } from "vitest";
import {
  BROWSER_EXTENSION_PACKAGE_PLAN_FORMAT
} from "./package-plan.js";
import {
  browserExtensionPackagePlanJsonFromArgs
} from "./package-plan-cli.js";

describe("browser extension package-plan CLI", () => {
  it("renders a deterministic Chromium package plan from args", () => {
    const plan = JSON.parse(browserExtensionPackagePlanJsonFromArgs([
      "--target",
      "chromium",
      "--content-script-match",
      "https://example.com/*"
    ]));

    expect(plan).toMatchObject({
      format: BROWSER_EXTENSION_PACKAGE_PLAN_FORMAT,
      target: "chromium",
      installs_native_host_manifest: false,
      writes_extension_storage: false,
      stores_production_secrets: false,
      dispatches_signers: false
    });
    expect(plan.manifest.content_scripts).toEqual([{
      matches: ["https://example.com/*"],
      js: ["nsealr-content-script-entrypoint.js"],
      run_at: "document_start",
      all_frames: false,
      match_about_blank: false
    }]);
    expect(plan.manifest.web_accessible_resources).toEqual([{
      resources: ["nsealr-page-script-entrypoint.js"],
      matches: ["https://example.com/*"]
    }]);
    expect(plan.manifest.action.default_popup).toBe("nsealr-popup.html");
  });

  it("renders a Firefox package plan only with an explicit extension id", () => {
    const plan = JSON.parse(browserExtensionPackagePlanJsonFromArgs([
      "--target",
      "firefox",
      "--firefox-extension-id",
      "extension@nsealr.dev"
    ]));

    expect(plan.target).toBe("firefox");
    expect(plan.manifest.browser_specific_settings.gecko.id).toBe("extension@nsealr.dev");
  });

  it("rejects unsupported or incomplete package-plan args before JSON output", () => {
    expect(() => browserExtensionPackagePlanJsonFromArgs([])).toThrow(/target is required/u);
    expect(() => browserExtensionPackagePlanJsonFromArgs([
      "--target",
      "safari"
    ])).toThrow(/chromium or firefox/u);
    expect(() => browserExtensionPackagePlanJsonFromArgs([
      "--target",
      "chromium",
      "--content-script-match"
    ])).toThrow(/requires a value/u);
    expect(() => browserExtensionPackagePlanJsonFromArgs([
      "--target",
      "chromium",
      "--content-script-match",
      "<all_urls>"
    ])).toThrow(/content script match/u);
    expect(() => browserExtensionPackagePlanJsonFromArgs([
      "--target",
      "chromium",
      "--target",
      "firefox"
    ])).toThrow(/specified only once/u);
    expect(() => browserExtensionPackagePlanJsonFromArgs([
      "--target",
      "chromium",
      "--firefox-extension-id",
      "extension@nsealr.dev"
    ])).toThrow(/only valid for Firefox/u);
    expect(() => browserExtensionPackagePlanJsonFromArgs([
      "--target",
      "firefox",
      "--firefox-extension-id",
      "extension@nsealr.dev",
      "--firefox-extension-id",
      "other@nsealr.dev"
    ])).toThrow(/specified only once/u);
    expect(() => browserExtensionPackagePlanJsonFromArgs([
      "--target",
      "chromium",
      "--write"
    ])).toThrow(/unsupported/u);
  });
});
