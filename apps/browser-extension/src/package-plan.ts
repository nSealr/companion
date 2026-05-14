import {
  BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE,
  BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE,
  BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE
} from "./entrypoints.js";
import {
  buildBrowserExtensionManifest,
  type BrowserExtensionManifest,
  type BrowserExtensionManifestOptions
} from "./manifest.js";

export const BROWSER_EXTENSION_PACKAGE_PLAN_FORMAT = "nsealr-browser-extension-package-plan-v0";
export const BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_SOURCE =
  "apps/browser-extension/src/nsealr-background-entrypoint.ts";
export const BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_SOURCE =
  "apps/browser-extension/src/nsealr-content-script-entrypoint.ts";
export const BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_SOURCE =
  "apps/browser-extension/src/nsealr-page-script-entrypoint.ts";

export type BrowserExtensionPackageEntrypointRole =
  "background_service_worker" |
  "content_script" |
  "page_script";

export type BrowserExtensionPackageEntrypoint = {
  role: BrowserExtensionPackageEntrypointRole;
  source: string;
  output: string;
};

export type BrowserExtensionPackagePlan = {
  format: typeof BROWSER_EXTENSION_PACKAGE_PLAN_FORMAT;
  target: BrowserExtensionManifestOptions["target"];
  manifest: BrowserExtensionManifest;
  entrypoints: readonly [
    BrowserExtensionPackageEntrypoint,
    BrowserExtensionPackageEntrypoint,
    BrowserExtensionPackageEntrypoint
  ];
  installs_native_host_manifest: false;
  writes_extension_storage: false;
  stores_production_secrets: false;
  dispatches_signers: false;
};

function packageEntrypoints(): BrowserExtensionPackagePlan["entrypoints"] {
  return Object.freeze([
    Object.freeze({
      role: "background_service_worker" as const,
      source: BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_SOURCE,
      output: BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE
    }),
    Object.freeze({
      role: "content_script" as const,
      source: BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_SOURCE,
      output: BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE
    }),
    Object.freeze({
      role: "page_script" as const,
      source: BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_SOURCE,
      output: BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE
    })
  ]);
}

function entrypointByRole(
  plan: BrowserExtensionPackagePlan,
  role: BrowserExtensionPackageEntrypointRole
): BrowserExtensionPackageEntrypoint {
  const entrypoint = plan.entrypoints.find((candidate) => candidate.role === role);
  if (entrypoint === undefined) {
    throw new Error(`browser extension package plan is missing ${role} entrypoint`);
  }
  return entrypoint;
}

function assertEntrypoint(
  entrypoint: BrowserExtensionPackageEntrypoint,
  role: BrowserExtensionPackageEntrypointRole,
  source: string,
  output: string
): void {
  if (entrypoint.role !== role || entrypoint.source !== source || entrypoint.output !== output) {
    throw new Error(`browser extension package plan ${role} entrypoint is invalid`);
  }
}

function assertNoHostOrStoragePermissions(manifest: BrowserExtensionManifest): void {
  if ((manifest.permissions as readonly string[]).includes("storage")) {
    throw new Error("browser extension package plan must not request storage permission");
  }
  if ("host_permissions" in manifest || "optional_host_permissions" in manifest) {
    throw new Error("browser extension package plan must not request host permissions");
  }
}

export function assertBrowserExtensionPackagePlan(
  plan: BrowserExtensionPackagePlan
): BrowserExtensionPackagePlan {
  if (plan.format !== BROWSER_EXTENSION_PACKAGE_PLAN_FORMAT) {
    throw new Error("browser extension package plan format is unsupported");
  }
  if (plan.installs_native_host_manifest !== false) {
    throw new Error("browser extension package plan must not install native-host manifests");
  }
  if (plan.writes_extension_storage !== false) {
    throw new Error("browser extension package plan must not write extension storage");
  }
  if (plan.stores_production_secrets !== false) {
    throw new Error("browser extension package plan must not store production secrets");
  }
  if (plan.dispatches_signers !== false) {
    throw new Error("browser extension package plan must not dispatch signers");
  }
  assertNoHostOrStoragePermissions(plan.manifest);

  const background = entrypointByRole(plan, "background_service_worker");
  assertEntrypoint(
    background,
    "background_service_worker",
    BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_SOURCE,
    BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE
  );
  if (plan.manifest.background.service_worker !== background.output) {
    throw new Error("browser extension package plan background output does not match manifest");
  }
  const contentScript = entrypointByRole(plan, "content_script");
  assertEntrypoint(
    contentScript,
    "content_script",
    BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_SOURCE,
    BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE
  );
  if (plan.manifest.content_scripts !== undefined) {
    for (const manifestContentScript of plan.manifest.content_scripts) {
      if (manifestContentScript.js[0] !== contentScript.output) {
        throw new Error("browser extension package plan content-script output does not match manifest");
      }
    }
  }
  const pageScript = entrypointByRole(plan, "page_script");
  assertEntrypoint(
    pageScript,
    "page_script",
    BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_SOURCE,
    BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE
  );
  if (plan.manifest.content_scripts !== undefined) {
    const webAccessibleResources = plan.manifest.web_accessible_resources;
    if (webAccessibleResources === undefined || webAccessibleResources.length !== 1) {
      throw new Error("browser extension package plan must expose packaged page script for content-script injection");
    }
    if (webAccessibleResources[0].resources[0] !== pageScript.output) {
      throw new Error("browser extension package plan page-script output does not match web-accessible resources");
    }
  }
  return plan;
}

export function buildBrowserExtensionPackagePlan(
  options: BrowserExtensionManifestOptions
): BrowserExtensionPackagePlan {
  return assertBrowserExtensionPackagePlan(Object.freeze({
    format: BROWSER_EXTENSION_PACKAGE_PLAN_FORMAT,
    target: options.target,
    manifest: buildBrowserExtensionManifest(options),
    entrypoints: packageEntrypoints(),
    installs_native_host_manifest: false,
    writes_extension_storage: false,
    stores_production_secrets: false,
    dispatches_signers: false
  }));
}

export function browserExtensionPackagePlanJson(options: BrowserExtensionManifestOptions): string {
  return `${JSON.stringify(buildBrowserExtensionPackagePlan(options), null, 2)}\n`;
}
