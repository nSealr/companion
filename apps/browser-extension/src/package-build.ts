import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
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
  buildBrowserExtensionPackagePlan,
  type BrowserExtensionPackagePlan
} from "./package-plan.js";
import {
  BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
  browserExtensionRouteConfigDigest,
  parseBrowserExtensionRouteConfigApproval,
  parseBrowserExtensionRouteConfig
} from "./route-config.js";
import { type BrowserExtensionManifestOptions } from "./manifest.js";
import {
  isBrowserExtensionOriginMethodAllowed,
  parseBrowserExtensionOriginPermissionStore,
  type BrowserExtensionOriginPermissionStore
} from "./origin-permission-store.js";
import { browserExtensionPopupHtml } from "./popup-html.js";

export const BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT = "nsealr-browser-extension-package-build-v0";

export type BrowserExtensionPackageBuildOptions = BrowserExtensionManifestOptions & {
  outDir: string;
  routeConfig: unknown;
  routeConfigApproval: unknown;
  extensionId?: string;
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
  package_digest: string;
  files: readonly BrowserExtensionPackageBuildFile[];
  installs_native_host_manifest: false;
  writes_extension_storage: false;
  stores_production_secrets: false;
  dispatches_signers: false;
  embeds_origin_permission_store: boolean;
};

const PACKAGE_OUTPUT_DIR = "browser-extension-package";
const COMPANION_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const PACKAGE_DIGEST_INPUT_FORMAT = "nsealr-browser-extension-package-digest-v0";
const nodeBufferReference = /(?:\bBuffer\s*(?:\.|\[)|new\s+Buffer\b|typeof\s+Buffer|globalThis\.Buffer)/u;
const nodeProcessReference = /(?:\bprocess\s*(?:\.|\[)|typeof\s+process|globalThis\.process)/u;
const textEncoder = new TextEncoder();

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
  route_type?: string;
} {
  const parsed = parseBrowserExtensionRouteConfig(value);
  return {
    format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
    account_id: parsed.route_request.account_id,
    ...(parsed.route_request.route_type !== undefined ? { route_type: parsed.route_request.route_type } : {})
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
  store: BrowserExtensionOriginPermissionStore;
  localPairingDigest: string;
  extensionId: string;
};

function originPermissionsForPackage(
  options: BrowserExtensionPackageBuildOptions,
  plan: BrowserExtensionPackagePlan
): BrowserExtensionPackageOriginPermissions | undefined {
  const origins = packagedContentScriptOrigins(plan);
  const hasOriginPermissionInput =
    options.originPermissionStore !== undefined || options.localPairingDigest !== undefined;
  if (origins.length === 0) {
    if (hasOriginPermissionInput) {
      throw new Error("browser extension package origin permissions require content-script matches");
    }
    return undefined;
  }
  if (options.originPermissionStore === undefined || options.localPairingDigest === undefined) {
    throw new Error("browser extension package origin permission store is required for content-script builds");
  }
  const extensionId = packageExtensionId(options);
  if (extensionId === undefined) {
    throw new Error("browser extension package extensionId is required for origin-permission gated content scripts");
  }
  const store = parseBrowserExtensionOriginPermissionStore(options.originPermissionStore);
  const localPairingDigest = requireLowerHex64(
    options.localPairingDigest,
    "browser extension package localPairingDigest"
  );
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
  return { store, localPairingDigest, extensionId };
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
  const backgroundOptionsJson = JSON.stringify({
    routeConfig,
    ...(originPermissions !== undefined ? {
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
        contents: `
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
        contents: `
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
  const plan = assertBrowserExtensionPackagePlan(buildBrowserExtensionPackagePlan(options));
  const originPermissions = originPermissionsForPackage(options, plan);
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
  await mkdir(outDir);
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
    package_digest: packageDigest(plan.target, files),
    files,
    installs_native_host_manifest: false,
    writes_extension_storage: false,
    stores_production_secrets: false,
    dispatches_signers: false,
    embeds_origin_permission_store: originPermissions !== undefined
  });
}
