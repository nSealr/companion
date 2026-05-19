import {
  createBrowserExtensionPopupControls,
  type BrowserExtensionPopupControlOptions,
  type BrowserExtensionPopupControls
} from "./popup-control.js";
import {
  requireBrowserExtensionPopupDocumentGlobal,
  requireBrowserExtensionPopupRuntimeGlobal,
  type BrowserExtensionPackagedGlobalScope
} from "./browser-globals.js";
import {
  installBrowserExtensionPopupView,
  type BrowserExtensionPopupViewHandle
} from "./popup-view.js";

export type NsealrPopupEntrypointOptions = Omit<
  BrowserExtensionPopupControlOptions,
  "runtime"
> & {
  globalScope: BrowserExtensionPackagedGlobalScope;
};

export function createNsealrPopupEntrypoint(
  options: NsealrPopupEntrypointOptions
): BrowserExtensionPopupControls {
  return createBrowserExtensionPopupControls({
    runtime: requireBrowserExtensionPopupRuntimeGlobal(options.globalScope),
    ...(options.nextRequestId !== undefined ? { nextRequestId: options.nextRequestId } : {}),
    ...(options.abortSignal !== undefined ? { abortSignal: options.abortSignal } : {})
  });
}

export function installNsealrPopupEntrypoint(
  options: NsealrPopupEntrypointOptions & {
    onError?: (error: unknown) => void;
  }
): BrowserExtensionPopupViewHandle {
  return installBrowserExtensionPopupView({
    document: requireBrowserExtensionPopupDocumentGlobal(options.globalScope),
    controls: createNsealrPopupEntrypoint(options),
    ...(options.onError !== undefined ? { onError: options.onError } : {})
  });
}
