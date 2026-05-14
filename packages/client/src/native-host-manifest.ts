import { isAbsolute } from "node:path";
import { NATIVE_HOST_NAME } from "./service.js";

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

export type NativeHostManifestOptions = {
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
