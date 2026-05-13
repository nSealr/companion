export const BROWSER_EXTENSION_NAME = "nSealr";
export const BROWSER_EXTENSION_DESCRIPTION = "nSealr browser bridge for external Nostr signers";
export const BROWSER_EXTENSION_VERSION = "0.1.0";

export type BrowserExtensionTarget = "chromium" | "firefox";

export type BrowserExtensionManifestOptions = {
  target: BrowserExtensionTarget;
  name?: string;
  description?: string;
  version?: string;
  firefoxExtensionId?: string;
};

export type BrowserExtensionManifest = {
  manifest_version: 3;
  name: string;
  description: string;
  version: string;
  permissions: ["nativeMessaging"];
  background: {
    service_worker: "background.js";
    type: "module";
  };
  action: {
    default_title: string;
  };
  browser_specific_settings?: {
    gecko: {
      id: string;
    };
  };
};

function requireName(value: string | undefined): string {
  const name = value ?? BROWSER_EXTENSION_NAME;
  if (name.length === 0 || name.length > 45) {
    throw new Error("browser extension name is invalid");
  }
  return name;
}

function requireDescription(value: string | undefined): string {
  const description = value ?? BROWSER_EXTENSION_DESCRIPTION;
  if (description.length === 0 || description.length > 132) {
    throw new Error("browser extension description is invalid");
  }
  return description;
}

function requireVersion(value: string | undefined): string {
  const version = value ?? BROWSER_EXTENSION_VERSION;
  if (!/^[0-9]+(?:\.[0-9]+){0,3}$/u.test(version)) {
    throw new Error("browser extension version is invalid");
  }
  return version;
}

function requireFirefoxExtensionId(value: string | undefined): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._@+-]{1,128}$/u.test(value)) {
    throw new Error("firefox extension id is invalid");
  }
  return value;
}

export function buildBrowserExtensionManifest(options: BrowserExtensionManifestOptions): BrowserExtensionManifest {
  const name = requireName(options.name);
  const manifest: BrowserExtensionManifest = {
    manifest_version: 3,
    name,
    description: requireDescription(options.description),
    version: requireVersion(options.version),
    permissions: ["nativeMessaging"],
    background: {
      service_worker: "background.js",
      type: "module"
    },
    action: {
      default_title: name
    }
  };

  if (options.target === "chromium") {
    return manifest;
  }
  if (options.target === "firefox") {
    return {
      ...manifest,
      browser_specific_settings: {
        gecko: {
          id: requireFirefoxExtensionId(options.firefoxExtensionId)
        }
      }
    };
  }
  throw new Error("browser extension target is unsupported");
}

export function browserExtensionManifestJson(options: BrowserExtensionManifestOptions): string {
  return `${JSON.stringify(buildBrowserExtensionManifest(options), null, 2)}\n`;
}
