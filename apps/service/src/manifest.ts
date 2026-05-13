import { isAbsolute } from "node:path";
import { NATIVE_HOST_NAME as CLIENT_NATIVE_HOST_NAME } from "@nsealr/client";

export const NATIVE_HOST_NAME = CLIENT_NATIVE_HOST_NAME;
export const NATIVE_HOST_DESCRIPTION = "nSealr companion native messaging host";

export type NativeHostBrowser = "chromium" | "firefox";

export type ChromiumNativeHostManifest = {
  name: string;
  description: string;
  path: string;
  type: "stdio";
  allowed_origins: string[];
};

export type FirefoxNativeHostManifest = {
  name: string;
  description: string;
  path: string;
  type: "stdio";
  allowed_extensions: string[];
};

export type NativeHostManifest = ChromiumNativeHostManifest | FirefoxNativeHostManifest;

type NativeHostManifestOptions = {
  browser: NativeHostBrowser;
  hostPath: string;
  extensionIds: string[];
  name?: string;
  description?: string;
};

function requireHostName(value: string | undefined): string {
  const name = value ?? NATIVE_HOST_NAME;
  if (!/^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/u.test(name) || name.length > 128) {
    throw new Error("native host name is invalid");
  }
  return name;
}

function requireDescription(value: string | undefined): string {
  const description = value ?? NATIVE_HOST_DESCRIPTION;
  if (description.length === 0 || description.length > 160) {
    throw new Error("native host description is invalid");
  }
  return description;
}

function requireHostPath(value: string): string {
  if (value.length === 0 || !isAbsolute(value)) {
    throw new Error("native host path must be absolute");
  }
  return value;
}

function uniqueExtensionIds(extensionIds: string[]): string[] {
  if (extensionIds.length === 0) {
    throw new Error("at least one extension id is required");
  }
  return [...new Set(extensionIds)];
}

function chromiumOrigin(extensionId: string): string {
  if (!/^[a-p]{32}$/u.test(extensionId)) {
    throw new Error("chromium extension id is invalid");
  }
  return `chrome-extension://${extensionId}/`;
}

function firefoxExtensionId(extensionId: string): string {
  if (!/^[A-Za-z0-9._@+-]{1,128}$/u.test(extensionId)) {
    throw new Error("firefox extension id is invalid");
  }
  return extensionId;
}

export function buildNativeHostManifest(options: NativeHostManifestOptions): NativeHostManifest {
  const base = {
    name: requireHostName(options.name),
    description: requireDescription(options.description),
    path: requireHostPath(options.hostPath),
    type: "stdio" as const
  };
  const extensionIds = uniqueExtensionIds(options.extensionIds);

  if (options.browser === "chromium") {
    return {
      ...base,
      allowed_origins: extensionIds.map(chromiumOrigin)
    };
  }
  if (options.browser === "firefox") {
    return {
      ...base,
      allowed_extensions: extensionIds.map(firefoxExtensionId)
    };
  }
  throw new Error("native host browser is unsupported");
}

function takeOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

export function nativeHostManifestFromArgs(args: string[]): NativeHostManifest {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  let browser: NativeHostBrowser | undefined;
  let hostPath: string | undefined;
  let name: string | undefined;
  let description: string | undefined;
  const extensionIds: string[] = [];

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const arg = normalizedArgs[index];
    if (arg === "--native-host-manifest") {
      const value = takeOptionValue(normalizedArgs, index, arg);
      if (value !== "chromium" && value !== "firefox") {
        throw new Error("native host manifest browser must be chromium or firefox");
      }
      browser = value;
      index += 1;
    } else if (arg === "--host-path") {
      hostPath = takeOptionValue(normalizedArgs, index, arg);
      index += 1;
    } else if (arg === "--extension-id") {
      extensionIds.push(takeOptionValue(normalizedArgs, index, arg));
      index += 1;
    } else if (arg === "--host-name") {
      name = takeOptionValue(normalizedArgs, index, arg);
      index += 1;
    } else if (arg === "--description") {
      description = takeOptionValue(normalizedArgs, index, arg);
      index += 1;
    } else {
      throw new Error(`unsupported service option: ${arg}`);
    }
  }

  if (browser === undefined) throw new Error("--native-host-manifest is required");
  if (hostPath === undefined) throw new Error("--host-path is required");
  return buildNativeHostManifest({
    browser,
    hostPath,
    extensionIds,
    name,
    description
  });
}

export function nativeHostManifestJsonFromArgs(args: string[]): string {
  return `${JSON.stringify(nativeHostManifestFromArgs(args), null, 2)}\n`;
}
