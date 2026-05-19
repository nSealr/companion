import {
  createBrowserExtensionPopupPendingRequestControls,
  type BrowserExtensionPopupControlOptions,
  type BrowserExtensionPopupPendingRequestControls
} from "./popup-control.js";
import {
  requireBrowserExtensionPopupRuntimeGlobal,
  type BrowserExtensionPackagedGlobalScope
} from "./browser-globals.js";

export type NsealrPopupEntrypointOptions = Omit<
  BrowserExtensionPopupControlOptions,
  "runtime"
> & {
  globalScope: BrowserExtensionPackagedGlobalScope;
};

export function createNsealrPopupEntrypoint(
  options: NsealrPopupEntrypointOptions
): BrowserExtensionPopupPendingRequestControls {
  return createBrowserExtensionPopupPendingRequestControls({
    runtime: requireBrowserExtensionPopupRuntimeGlobal(options.globalScope),
    ...(options.nextRequestId !== undefined ? { nextRequestId: options.nextRequestId } : {}),
    ...(options.abortSignal !== undefined ? { abortSignal: options.abortSignal } : {})
  });
}
