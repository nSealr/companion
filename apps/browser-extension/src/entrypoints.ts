export const BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE = "nsealr-background-entrypoint.js";
export const BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE = "nsealr-content-script-entrypoint.js";
export const BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE = "nsealr-page-script-entrypoint.js";

const INTERNAL_MODULE_FILENAMES = new Set([
  "background.js",
  "content-script.js",
  "page-script.js"
]);

function requireEntrypointFilename(value: string, label: string): string {
  if (!/^[A-Za-z0-9._-]{1,64}\.js$/u.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  if (INTERNAL_MODULE_FILENAMES.has(value)) {
    throw new Error(`${label} collides with an internal browser-extension module`);
  }
  return value;
}

export type BrowserExtensionPackagedEntrypointFiles = {
  backgroundServiceWorker: typeof BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE;
  contentScript: typeof BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE;
  pageScript: typeof BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE;
};

export function browserExtensionPackagedEntrypointFiles(): BrowserExtensionPackagedEntrypointFiles {
  const backgroundServiceWorker = requireEntrypointFilename(
    BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE,
    "browser extension background entrypoint file"
  ) as typeof BROWSER_EXTENSION_BACKGROUND_ENTRYPOINT_FILE;
  const contentScript = requireEntrypointFilename(
    BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE,
    "browser extension content-script entrypoint file"
  ) as typeof BROWSER_EXTENSION_CONTENT_SCRIPT_ENTRYPOINT_FILE;
  const pageScript = requireEntrypointFilename(
    BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE,
    "browser extension page-script entrypoint file"
  ) as typeof BROWSER_EXTENSION_PAGE_SCRIPT_ENTRYPOINT_FILE;

  if (new Set([backgroundServiceWorker, contentScript, pageScript]).size !== 3) {
    throw new Error("browser extension packaged entrypoint files must be unique");
  }
  return Object.freeze({
    backgroundServiceWorker,
    contentScript,
    pageScript
  });
}
