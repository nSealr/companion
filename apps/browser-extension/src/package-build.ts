import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Utf8Hex } from "@nsealr/core";
import { build as esbuild, type Plugin } from "esbuild";
import {
  BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE,
  BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE,
  BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE
} from "./entrypoints.js";
import {
  assertBrowserExtensionPackagePlan,
  buildBrowserExtensionPackagePlan,
  type BrowserExtensionPackagePlan
} from "./package-plan.js";
import {
  BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
  parseBrowserExtensionRouteConfig
} from "./route-config.js";
import { type BrowserExtensionManifestOptions } from "./manifest.js";

export const BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT = "nsealr-browser-extension-package-build-v0";

export type BrowserExtensionPackageBuildOptions = BrowserExtensionManifestOptions & {
  outDir: string;
  routeConfig: unknown;
};

export type BrowserExtensionPackageBuildFile = {
  path:
    "manifest.json" |
    typeof BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE |
    typeof BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE |
    typeof BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE;
  bytes: number;
  sha256: string;
};

export type BrowserExtensionPackageBuildResult = {
  format: typeof BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT;
  target: BrowserExtensionManifestOptions["target"];
  out_dir: string;
  package_digest: string;
  files: readonly [
    BrowserExtensionPackageBuildFile,
    BrowserExtensionPackageBuildFile,
    BrowserExtensionPackageBuildFile,
    BrowserExtensionPackageBuildFile
  ];
  installs_native_host_manifest: false;
  writes_extension_storage: false;
  stores_production_secrets: false;
  dispatches_signers: false;
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

function virtualEntrypointPlugin(routeConfig: unknown): Plugin {
  const routeConfigJson = JSON.stringify(routeConfig);
  return {
    name: "nsealr-browser-extension-package-entrypoints",
    setup(build): void {
      build.onResolve({ filter: /^nsealr:browser-extension\/(background|content-script|page-script)$/ }, (args) => ({
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
            routeConfig: ${routeConfigJson}
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
    bundleFile(BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE),
    bundleFile(BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE),
    bundleFile(BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE)
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
  const plan = assertBrowserExtensionPackagePlan(buildBrowserExtensionPackagePlan(options));
  const buildResult = await esbuild({
    absWorkingDir: COMPANION_ROOT,
    bundle: true,
    entryNames: "[name]",
    entryPoints: [
      { in: "nsealr:browser-extension/background", out: BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE.replace(/\.js$/u, "") },
      { in: "nsealr:browser-extension/content-script", out: BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE.replace(/\.js$/u, "") },
      { in: "nsealr:browser-extension/page-script", out: BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE.replace(/\.js$/u, "") }
    ],
    format: "iife",
    legalComments: "none",
    logLevel: "silent",
    outdir: PACKAGE_OUTPUT_DIR,
    platform: "browser",
    plugins: [virtualEntrypointPlugin(routeConfig)],
    sourcemap: false,
    target: "es2022",
    treeShaking: true,
    write: false
  });
  const bundles = bundleOutputByFile(buildResult.outputFiles ?? []);
  assertBundleOutputs(bundles, plan);

  const manifestJson = `${JSON.stringify(plan.manifest, null, 2)}\n`;
  const files = buildPackageFileManifest(manifestJson, bundles);
  await mkdir(outDir);
  await writeFile(join(outDir, "manifest.json"), manifestJson);
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
    dispatches_signers: false
  });
}
