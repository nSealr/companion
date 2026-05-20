import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Utf8Hex } from "@nsealr/core";
import { build as esbuild, type Plugin } from "esbuild";
import {
  BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE,
  BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE,
  BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE,
  BROWSER_EXTENSION_POPUP_ENTRYPOINT_FILE,
  BROWSER_EXTENSION_POPUP_HTML_FILE
} from "./entrypoints.js";
import {
  assertBrowserExtensionPackagePlan,
  browserExtensionPackagePlanDigest,
  buildBrowserExtensionPackagePlan,
  type BrowserExtensionPackagePlan
} from "./package-plan.js";
import {
  BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
  browserExtensionRouteConfigDigest,
  parseBrowserExtensionRouteConfigApproval,
  parseBrowserExtensionRouteConfig,
  type BrowserExtensionDispatchableRouteType
} from "./route-config.js";
import {
  type BrowserExtensionManifestOptions,
  type BrowserExtensionManifestPermission
} from "./manifest.js";
import {
  isBrowserExtensionOriginMethodAllowed,
  parseBrowserExtensionOriginPermissionStore,
  type BrowserExtensionOriginPermissionStore
} from "./origin-permission-store.js";
import { browserExtensionPopupHtml } from "./popup-html.js";

export const BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT = "nsealr-browser-extension-package-build-v0";
export type BrowserExtensionPackageOriginPermissionMode = "embedded" | "extension_storage";

export type BrowserExtensionPackageBuildOptions = BrowserExtensionManifestOptions & {
  outDir: string;
  packagePlanDigest: string;
  routeConfig: unknown;
  routeConfigApproval: unknown;
  extensionId?: string;
  originPermissionMode?: BrowserExtensionPackageOriginPermissionMode;
  originPermissionStore?: unknown;
  localPairingDigest?: string;
};

export type BrowserExtensionPackageBuildFile = {
  path:
    "manifest.json" |
    typeof BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE |
    typeof BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE |
    typeof BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE |
    typeof BROWSER_EXTENSION_POPUP_ENTRYPOINT_FILE |
    typeof BROWSER_EXTENSION_POPUP_HTML_FILE;
  bytes: number;
  sha256: string;
};

export type BrowserExtensionPackageBuildResult = {
  format: typeof BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT;
  target: BrowserExtensionManifestOptions["target"];
  out_dir: string;
  package_plan_digest: string;
  route_config_digest: string;
  route_account_id: string;
  route_type: BrowserExtensionDispatchableRouteType;
  popup_mode: BrowserExtensionPackagePlan["popup_mode"];
  manifest_permissions: readonly BrowserExtensionManifestPermission[];
  origin_permission_mode: "none" | BrowserExtensionPackageOriginPermissionMode;
  extension_id?: string;
  local_pairing_digest?: string;
  content_script_origins: readonly string[];
  package_digest: string;
  files: readonly BrowserExtensionPackageBuildFile[];
  installs_native_host_manifest: false;
  writes_extension_storage: false;
  stores_production_secrets: false;
  dispatches_signers: false;
  uses_active_tab_permission: boolean;
  embeds_origin_permission_store: boolean;
  uses_extension_origin_permission_storage: boolean;
};

const PACKAGE_OUTPUT_DIR = "browser-extension-package";
const COMPANION_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const REVIEWED_REPO_OUTPUT_ROOT = resolve(COMPANION_ROOT, "release-artifacts/browser-extension");
const PACKAGE_DIGEST_INPUT_FORMAT = "nsealr-browser-extension-package-digest-v0";
const nodeBufferReference = /(?:\bBuffer\s*(?:\.|\[)|new\s+Buffer\b|typeof\s+Buffer|globalThis\.Buffer)/u;
const nodeProcessReference = /(?:\bprocess\s*(?:\.|\[)|typeof\s+process|globalThis\.process)/u;
const textEncoder = new TextEncoder();

function isPathInside(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function isReviewedRepoOutputPath(outDir: string): boolean {
  const relativePath = relative(REVIEWED_REPO_OUTPUT_ROOT, outDir);
  return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function requireOutDir(value: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("browser extension package out-dir is required");
  }
  const outDir = resolve(value);
  if (outDir === "/" || outDir === process.cwd()) {
    throw new Error("browser extension package out-dir is unsafe");
  }
  if (isPathInside(COMPANION_ROOT, outDir) && !isReviewedRepoOutputPath(outDir)) {
    throw new Error(
      "browser extension package out-dir must be outside the companion source tree or a child of release-artifacts/browser-extension/"
    );
  }
  return outDir;
}

function requireLowerHex64(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be 32-byte lowercase hex`);
  }
  return value;
}

function requireExtensionId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._@+-]{1,128}$/u.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function requireChromiumExtensionId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-p]{32}$/u.test(value)) {
    throw new Error(`${label} must be a Chromium extension id`);
  }
  return value;
}

function normalizedRouteConfig(value: unknown): {
  format: typeof BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT;
  account_id: string;
  route_type: BrowserExtensionDispatchableRouteType;
} {
  const parsed = parseBrowserExtensionRouteConfig(value);
  return {
    format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
    account_id: parsed.route_request.account_id,
    route_type: parsed.route_request.route_type
  };
}

function contentScriptMatchOrigin(match: string): string {
  const wildcardSuffix = "/*";
  if (!match.endsWith(wildcardSuffix)) {
    throw new Error("browser extension package content-script match is unsupported");
  }
  const origin = match.slice(0, -wildcardSuffix.length);
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.origin === "null") {
      throw new Error("invalid origin");
    }
    return origin;
  } catch {
    throw new Error("browser extension package content-script match origin is invalid");
  }
}

function packagedContentScriptOrigins(plan: BrowserExtensionPackagePlan): string[] {
  return [...new Set((plan.manifest.content_scripts ?? []).flatMap((script) => (
    script.matches.map(contentScriptMatchOrigin)
  )))].sort();
}

function packageExtensionId(options: BrowserExtensionPackageBuildOptions): string | undefined {
  if (options.extensionId !== undefined) {
    const extensionId = options.target === "chromium"
      ? requireChromiumExtensionId(options.extensionId, "browser extension package extensionId")
      : requireExtensionId(options.extensionId, "browser extension package extensionId");
    if (
      options.target === "firefox" &&
      options.firefoxExtensionId !== undefined &&
      options.firefoxExtensionId !== extensionId
    ) {
      throw new Error("browser extension package extensionId must match firefoxExtensionId");
    }
    return extensionId;
  }
  if (options.target === "firefox" && options.firefoxExtensionId !== undefined) {
    return requireExtensionId(options.firefoxExtensionId, "browser extension package firefoxExtensionId");
  }
  return undefined;
}

type BrowserExtensionPackageOriginPermissions = {
  mode: BrowserExtensionPackageOriginPermissionMode;
  store?: BrowserExtensionOriginPermissionStore;
  localPairingDigest: string;
  extensionId: string;
};

function requireOriginPermissionMode(
  value: BrowserExtensionPackageOriginPermissionMode | undefined
): BrowserExtensionPackageOriginPermissionMode {
  const mode = value ?? "embedded";
  if (mode !== "embedded" && mode !== "extension_storage") {
    throw new Error("browser extension package origin permission mode is unsupported");
  }
  return mode;
}

function requirePackageManifestProfile(
  options: BrowserExtensionPackageBuildOptions,
  originPermissionMode: BrowserExtensionPackageOriginPermissionMode
): void {
  if (originPermissionMode === "extension_storage") {
    if (options.popupMode !== undefined && options.popupMode !== "origin_permission_approval") {
      throw new Error("browser extension package extension-storage origin permissions require origin approval popup");
    }
    if (options.originPermissionStorageMode !== undefined && options.originPermissionStorageMode !== "extension") {
      throw new Error("browser extension package extension-storage origin permissions require extension storage mode");
    }
    return;
  }
  if (options.popupMode === "origin_permission_approval" || options.originPermissionStorageMode === "extension") {
    throw new Error("browser extension package origin approval popup requires extension-storage origin permission mode");
  }
}

function originPermissionsForPackage(
  options: BrowserExtensionPackageBuildOptions,
  plan: BrowserExtensionPackagePlan
): BrowserExtensionPackageOriginPermissions | undefined {
  const origins = packagedContentScriptOrigins(plan);
  const originPermissionMode = requireOriginPermissionMode(options.originPermissionMode);
  const hasOriginPermissionInput =
    options.originPermissionStore !== undefined ||
    options.localPairingDigest !== undefined ||
    options.originPermissionMode !== undefined;
  if (origins.length === 0) {
    if (hasOriginPermissionInput) {
      throw new Error("browser extension package origin permissions require content-script matches");
    }
    return undefined;
  }
  if (options.originPermissionStore === undefined || options.localPairingDigest === undefined) {
    if (originPermissionMode === "embedded") {
      throw new Error("browser extension package origin permission store is required for content-script builds");
    }
    if (options.localPairingDigest === undefined) {
      throw new Error("browser extension package localPairingDigest is required for extension-storage origin permissions");
    }
  }
  const extensionId = packageExtensionId(options);
  if (extensionId === undefined) {
    throw new Error("browser extension package extensionId is required for origin-permission gated content scripts");
  }
  const localPairingDigest = requireLowerHex64(
    options.localPairingDigest,
    "browser extension package localPairingDigest"
  );
  if (originPermissionMode === "extension_storage") {
    if (plan.popup_mode !== "origin_permission_approval" || !plan.uses_extension_storage) {
      throw new Error("browser extension package extension-storage origin permissions require popup approval storage");
    }
    if (options.originPermissionStore !== undefined) {
      throw new Error("browser extension package extension-storage origin permissions must start from browser storage");
    }
    return { mode: "extension_storage", localPairingDigest, extensionId };
  }
  const store = parseBrowserExtensionOriginPermissionStore(options.originPermissionStore);
  for (const origin of origins) {
    for (const method of ["get_public_key", "sign_event"] as const) {
      if (!isBrowserExtensionOriginMethodAllowed(store, {
        origin,
        extensionId,
        localPairingDigest,
        method
      })) {
        throw new Error(`browser extension package origin permission is missing ${method} for ${origin}`);
      }
    }
  }
  return { mode: "embedded", store, localPairingDigest, extensionId };
}

function requireApprovedRouteConfig(routeConfig: unknown, approval: unknown): void {
  const routeConfigDigest = browserExtensionRouteConfigDigest(routeConfig);
  const parsedApproval = parseBrowserExtensionRouteConfigApproval(approval);
  if (parsedApproval.route_config_digest !== routeConfigDigest) {
    throw new Error("browser extension package route config approval digest mismatch");
  }
  if (parsedApproval.review.route_config_digest !== routeConfigDigest) {
    throw new Error("browser extension package route config review digest mismatch");
  }
}

function virtualEntrypointPlugin(
  routeConfig: unknown,
  originPermissions: BrowserExtensionPackageOriginPermissions | undefined
): Plugin {
  const usesExtensionOriginPermissionStorage = originPermissions?.mode === "extension_storage";
  const backgroundOptionsJson = JSON.stringify({
    routeConfig,
    ...(originPermissions?.mode === "embedded" ? {
      extensionId: originPermissions.extensionId,
      originPermissions: {
        store: originPermissions.store,
        localPairingDigest: originPermissions.localPairingDigest
      }
    } : {})
  });
  return {
    name: "nsealr-browser-extension-package-entrypoints",
    setup(build): void {
      build.onResolve({ filter: /^nsealr:browser-extension\/(background|content-script|page-script|popup)$/ }, (args) => ({
        path: args.path,
        namespace: "nsealr-browser-extension"
      }));
      build.onLoad({ filter: /background$/, namespace: "nsealr-browser-extension" }, () => ({
        loader: "ts",
        resolveDir: COMPANION_ROOT,
        contents: usesExtensionOriginPermissionStorage
          ? `
            import { installNsealrBackgroundEntrypoint } from "./apps/browser-extension/src/nsealr-background-entrypoint.ts";
            import { requireBrowserExtensionOriginPermissionStorageGlobal } from "./apps/browser-extension/src/browser-globals.ts";
            import { readBrowserExtensionOriginPermissionStoreFromStorage } from "./apps/browser-extension/src/origin-permission-storage.ts";
            const originPermissionStorage = requireBrowserExtensionOriginPermissionStorageGlobal(globalThis);
            installNsealrBackgroundEntrypoint({
              globalScope: globalThis,
              ...${backgroundOptionsJson},
              originPermissions: {
                loadStore: () => readBrowserExtensionOriginPermissionStoreFromStorage(originPermissionStorage),
                localPairingDigest: ${JSON.stringify(originPermissions?.localPairingDigest)}
              },
              originPermissionStorage
            });
          `
          : `
            import { installNsealrBackgroundEntrypoint } from "./apps/browser-extension/src/nsealr-background-entrypoint.ts";
            installNsealrBackgroundEntrypoint({
              globalScope: globalThis,
              ...${backgroundOptionsJson}
            });
          `
      }));
      build.onLoad({ filter: /content-script$/, namespace: "nsealr-browser-extension" }, () => ({
        loader: "ts",
        resolveDir: COMPANION_ROOT,
        contents: `
          import { installNsealrContentScriptEntrypoint } from "./apps/browser-extension/src/nsealr-content-script-entrypoint.ts";
          installNsealrContentScriptEntrypoint({
            globalScope: globalThis
          });
        `
      }));
      build.onLoad({ filter: /page-script$/, namespace: "nsealr-browser-extension" }, () => ({
        loader: "ts",
        resolveDir: COMPANION_ROOT,
        contents: `
          import { installNsealrPageScriptEntrypoint } from "./apps/browser-extension/src/nsealr-page-script-entrypoint.ts";
          installNsealrPageScriptEntrypoint({
            globalScope: globalThis
          });
        `
      }));
      build.onLoad({ filter: /popup$/, namespace: "nsealr-browser-extension" }, () => ({
        loader: "ts",
        resolveDir: COMPANION_ROOT,
        contents: usesExtensionOriginPermissionStorage
          ? `
            import { installNsealrPopupOriginPermissionEntrypoint } from "./apps/browser-extension/src/nsealr-popup-entrypoint.ts";
            installNsealrPopupOriginPermissionEntrypoint({
              globalScope: globalThis
            });
          `
          : `
            import { installNsealrPopupEntrypoint } from "./apps/browser-extension/src/nsealr-popup-entrypoint.ts";
            installNsealrPopupEntrypoint({
              globalScope: globalThis
            });
          `
      }));
    }
  };
}

function bundleOutputByFile(outputs: readonly { path: string; contents: Uint8Array }[]): Map<string, Uint8Array> {
  const bundles = new Map<string, Uint8Array>();
  for (const output of outputs) {
    bundles.set(basename(output.path), output.contents);
  }
  return bundles;
}

function assertBundleOutputs(bundles: Map<string, Uint8Array>, plan: BrowserExtensionPackagePlan): void {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const entrypoint of plan.entrypoints) {
    const bundle = bundles.get(entrypoint.output);
    if (bundle === undefined) {
      throw new Error(`browser extension package build missing ${entrypoint.output}`);
    }
    const source = decoder.decode(bundle);
    if (nodeBufferReference.test(source) || nodeProcessReference.test(source) || /node:/u.test(source)) {
      throw new Error(`browser extension package build ${entrypoint.output} contains Node runtime references`);
    }
  }
}

function packageFile(path: BrowserExtensionPackageBuildFile["path"], source: string): BrowserExtensionPackageBuildFile {
  return Object.freeze({
    path,
    bytes: textEncoder.encode(source).byteLength,
    sha256: sha256Utf8Hex(source)
  });
}

function buildPackageFileManifest(
  manifestJson: string,
  popupHtml: string,
  bundles: Map<string, Uint8Array>
): BrowserExtensionPackageBuildResult["files"] {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  function bundleFile(path: BrowserExtensionPackageBuildFile["path"]): BrowserExtensionPackageBuildFile {
    const contents = bundles.get(path);
    if (contents === undefined) {
      throw new Error(`browser extension package build missing ${path}`);
    }
    return packageFile(path, decoder.decode(contents));
  }
  return Object.freeze([
    packageFile("manifest.json", manifestJson),
    packageFile(BROWSER_EXTENSION_POPUP_HTML_FILE, popupHtml),
    bundleFile(BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE),
    bundleFile(BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE),
    bundleFile(BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE),
    bundleFile(BROWSER_EXTENSION_POPUP_ENTRYPOINT_FILE)
  ]);
}

function packageDigest(target: BrowserExtensionManifestOptions["target"], files: BrowserExtensionPackageBuildResult["files"]): string {
  return sha256Utf8Hex(JSON.stringify({
    format: PACKAGE_DIGEST_INPUT_FORMAT,
    target,
    files
  }));
}

export async function buildBrowserExtensionPackage(
  options: BrowserExtensionPackageBuildOptions
): Promise<BrowserExtensionPackageBuildResult> {
  const outDir = requireOutDir(options.outDir);
  if (await pathExists(outDir)) {
    throw new Error("browser extension package out-dir already exists");
  }
  const routeConfig = normalizedRouteConfig(options.routeConfig);
  requireApprovedRouteConfig(routeConfig, options.routeConfigApproval);
  const originPermissionMode = requireOriginPermissionMode(options.originPermissionMode);
  requirePackageManifestProfile(options, originPermissionMode);
  const plan = assertBrowserExtensionPackagePlan(buildBrowserExtensionPackagePlan({
    ...options,
    ...(originPermissionMode === "extension_storage"
      ? {
          popupMode: "origin_permission_approval",
          originPermissionStorageMode: "extension"
        }
      : {})
  }));
  const packagePlanDigest = browserExtensionPackagePlanDigest(plan);
  const reviewedPackagePlanDigest = requireLowerHex64(
    options.packagePlanDigest,
    "browser extension package plan digest"
  );
  if (reviewedPackagePlanDigest !== packagePlanDigest) {
    throw new Error("browser extension package plan digest mismatch");
  }
  const originPermissions = originPermissionsForPackage(options, plan);
  const contentScriptOrigins = packagedContentScriptOrigins(plan);
  const buildResult = await esbuild({
    absWorkingDir: COMPANION_ROOT,
    bundle: true,
    entryNames: "[name]",
    entryPoints: [
      { in: "nsealr:browser-extension/background", out: BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE.replace(/\.js$/u, "") },
      { in: "nsealr:browser-extension/content-script", out: BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE.replace(/\.js$/u, "") },
      { in: "nsealr:browser-extension/page-script", out: BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE.replace(/\.js$/u, "") },
      { in: "nsealr:browser-extension/popup", out: BROWSER_EXTENSION_POPUP_ENTRYPOINT_FILE.replace(/\.js$/u, "") }
    ],
    format: "iife",
    legalComments: "none",
    logLevel: "silent",
    outdir: PACKAGE_OUTPUT_DIR,
    platform: "browser",
    plugins: [virtualEntrypointPlugin(routeConfig, originPermissions)],
    sourcemap: false,
    target: "es2022",
    treeShaking: true,
    write: false
  });
  const bundles = bundleOutputByFile(buildResult.outputFiles ?? []);
  assertBundleOutputs(bundles, plan);

  const manifestJson = `${JSON.stringify(plan.manifest, null, 2)}\n`;
  const popupHtml = browserExtensionPopupHtml();
  const files = buildPackageFileManifest(manifestJson, popupHtml, bundles);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "manifest.json"), manifestJson);
  await writeFile(join(outDir, BROWSER_EXTENSION_POPUP_HTML_FILE), popupHtml);
  for (const entrypoint of plan.entrypoints) {
    const contents = bundles.get(entrypoint.output);
    if (contents === undefined) {
      throw new Error(`browser extension package build missing ${entrypoint.output}`);
    }
    await writeFile(join(outDir, entrypoint.output), contents);
  }

  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (totalBytes <= 0) {
    throw new Error("browser extension package build produced empty output");
  }

  return Object.freeze({
    format: BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT,
    target: plan.target,
    out_dir: outDir,
    package_plan_digest: packagePlanDigest,
    route_config_digest: browserExtensionRouteConfigDigest(routeConfig),
    route_account_id: routeConfig.account_id,
    route_type: routeConfig.route_type,
    popup_mode: plan.popup_mode,
    manifest_permissions: Object.freeze([...plan.manifest.permissions]),
    origin_permission_mode: originPermissions?.mode ?? "none",
    ...(originPermissions?.extensionId !== undefined ? { extension_id: originPermissions.extensionId } : {}),
    ...(originPermissions?.localPairingDigest !== undefined
      ? { local_pairing_digest: originPermissions.localPairingDigest }
      : {}),
    content_script_origins: Object.freeze(contentScriptOrigins),
    package_digest: packageDigest(plan.target, files),
    files,
    installs_native_host_manifest: false,
    writes_extension_storage: false,
    stores_production_secrets: false,
    dispatches_signers: false,
    uses_active_tab_permission: plan.uses_active_tab_permission,
    embeds_origin_permission_store: originPermissions?.mode === "embedded",
    uses_extension_origin_permission_storage: originPermissions?.mode === "extension_storage"
  });
}
