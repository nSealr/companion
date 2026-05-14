#!/usr/bin/env node
import { writeSync } from "node:fs";
import {
  BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT,
  buildBrowserExtensionPackage
} from "./package-build.js";
import {
  BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT
} from "./route-config.js";
import {
  type BrowserExtensionManifestOptions,
  type BrowserExtensionTarget
} from "./manifest.js";

type PackageBuildCliOptions = {
  target?: BrowserExtensionTarget;
  outDir?: string;
  firefoxExtensionId?: string;
  contentScriptMatches: string[];
  routeAccountId?: string;
  routeType?: string;
};

function takeOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function parsePackageBuildArgs(args: string[]): PackageBuildCliOptions {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  const options: PackageBuildCliOptions = {
    contentScriptMatches: []
  };

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const arg = normalizedArgs[index];
    if (arg === "--target") {
      if (options.target !== undefined) throw new Error("--target must be specified only once");
      const target = takeOptionValue(normalizedArgs, index, arg);
      if (target !== "chromium" && target !== "firefox") throw new Error("--target must be chromium or firefox");
      options.target = target;
      index += 1;
    } else if (arg === "--out-dir") {
      if (options.outDir !== undefined) throw new Error("--out-dir must be specified only once");
      options.outDir = takeOptionValue(normalizedArgs, index, arg);
      index += 1;
    } else if (arg === "--firefox-extension-id") {
      if (options.firefoxExtensionId !== undefined) throw new Error("--firefox-extension-id must be specified only once");
      options.firefoxExtensionId = takeOptionValue(normalizedArgs, index, arg);
      index += 1;
    } else if (arg === "--content-script-match") {
      options.contentScriptMatches.push(takeOptionValue(normalizedArgs, index, arg));
      index += 1;
    } else if (arg === "--route-account-id") {
      if (options.routeAccountId !== undefined) throw new Error("--route-account-id must be specified only once");
      options.routeAccountId = takeOptionValue(normalizedArgs, index, arg);
      index += 1;
    } else if (arg === "--route-type") {
      if (options.routeType !== undefined) throw new Error("--route-type must be specified only once");
      options.routeType = takeOptionValue(normalizedArgs, index, arg);
      index += 1;
    } else {
      throw new Error(`unsupported browser-extension package-build option: ${arg}`);
    }
  }

  return options;
}

function manifestOptionsFromCli(options: PackageBuildCliOptions): BrowserExtensionManifestOptions {
  if (options.target === undefined) throw new Error("--target is required");
  if (options.target === "chromium" && options.firefoxExtensionId !== undefined) {
    throw new Error("--firefox-extension-id is only valid for Firefox package builds");
  }
  return {
    target: options.target,
    ...(options.firefoxExtensionId !== undefined ? { firefoxExtensionId: options.firefoxExtensionId } : {}),
    ...(options.contentScriptMatches.length > 0 ? { contentScriptMatches: options.contentScriptMatches } : {})
  };
}

function routeConfigFromCli(options: PackageBuildCliOptions): unknown {
  if (options.routeAccountId === undefined) throw new Error("--route-account-id is required");
  return {
    format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
    account_id: options.routeAccountId,
    ...(options.routeType !== undefined ? { route_type: options.routeType } : {})
  };
}

export async function browserExtensionPackageBuildJsonFromArgs(args: string[]): Promise<string> {
  const options = parsePackageBuildArgs(args);
  if (options.outDir === undefined) throw new Error("--out-dir is required");
  const result = await buildBrowserExtensionPackage({
    ...manifestOptionsFromCli(options),
    outDir: options.outDir,
    routeConfig: routeConfigFromCli(options)
  });
  return `${JSON.stringify(result, null, 2)}\n`;
}

export async function runBrowserExtensionPackageBuildCli(args: string[]): Promise<void> {
  try {
    const resultJson = await browserExtensionPackageBuildJsonFromArgs(args);
    const result = JSON.parse(resultJson) as { format?: string };
    if (result.format !== BROWSER_EXTENSION_PACKAGE_BUILD_FORMAT) {
      throw new Error("browser extension package build returned unsupported output");
    }
    writeSync(1, resultJson);
  } catch (error) {
    writeSync(2, `${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runBrowserExtensionPackageBuildCli(process.argv.slice(2));
}
