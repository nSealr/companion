import {
  buildNativeHostManifest,
  type NativeHostBrowser,
  type NativeHostManifest
} from "@nsealr/client";

export {
  NATIVE_HOST_DESCRIPTION,
  NATIVE_HOST_NAME,
  buildNativeHostManifest,
  type ChromiumNativeHostManifest,
  type FirefoxNativeHostManifest,
  type NativeHostBrowser,
  type NativeHostManifest,
  type NativeHostManifestOptions
} from "@nsealr/client";

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
