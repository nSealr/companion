#!/usr/bin/env node
import { writeSync } from "node:fs";
import {
  browserExtensionPackagePlanJson
} from "./package-plan.js";
import {
  type BrowserExtensionManifestOptions,
  type BrowserExtensionTarget
} from "./manifest.js";

type PackagePlanCliOptions = {
  target?: BrowserExtensionTarget;
  firefoxExtensionId?: string;
  contentScriptMatches: string[];
};

function takeOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function packagePlanOptionsFromArgs(args: string[]): BrowserExtensionManifestOptions {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  const options: PackagePlanCliOptions = {
    contentScriptMatches: []
  };

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const arg = normalizedArgs[index];
    if (arg === "--target") {
      if (options.target !== undefined) {
        throw new Error("--target must be specified only once");
      }
      const target = takeOptionValue(normalizedArgs, index, arg);
      if (target !== "chromium" && target !== "firefox") {
        throw new Error("--target must be chromium or firefox");
      }
      options.target = target;
      index += 1;
    } else if (arg === "--firefox-extension-id") {
      if (options.firefoxExtensionId !== undefined) {
        throw new Error("--firefox-extension-id must be specified only once");
      }
      options.firefoxExtensionId = takeOptionValue(normalizedArgs, index, arg);
      index += 1;
    } else if (arg === "--content-script-match") {
      options.contentScriptMatches.push(takeOptionValue(normalizedArgs, index, arg));
      index += 1;
    } else {
      throw new Error(`unsupported browser-extension package-plan option: ${arg}`);
    }
  }

  if (options.target === undefined) {
    throw new Error("--target is required");
  }
  if (options.target === "chromium" && options.firefoxExtensionId !== undefined) {
    throw new Error("--firefox-extension-id is only valid for Firefox package plans");
  }

  return {
    target: options.target,
    ...(options.firefoxExtensionId !== undefined ? { firefoxExtensionId: options.firefoxExtensionId } : {}),
    ...(options.contentScriptMatches.length > 0 ? { contentScriptMatches: options.contentScriptMatches } : {})
  };
}

export function browserExtensionPackagePlanJsonFromArgs(args: string[]): string {
  return browserExtensionPackagePlanJson(packagePlanOptionsFromArgs(args));
}

export function runBrowserExtensionPackagePlanCli(args: string[]): void {
  try {
    writeSync(1, browserExtensionPackagePlanJsonFromArgs(args));
  } catch (error) {
    writeSync(2, `${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBrowserExtensionPackagePlanCli(process.argv.slice(2));
}
