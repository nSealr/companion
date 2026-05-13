import {
  type BrowserExtensionBackgroundRequestOptions
} from "./background.js";
import { type BrowserExtensionRequest } from "./messages.js";
import {
  handleBrowserExtensionPageBridgeRequest,
  type BrowserExtensionPageBridgeResponse
} from "./page-bridge.js";

export type BrowserExtensionContentScriptBackgroundRequester = (
  request: BrowserExtensionRequest,
  sender: unknown,
  options: BrowserExtensionBackgroundRequestOptions
) => Promise<unknown> | unknown;

export type BrowserExtensionContentScriptBridgeOptions = {
  sender: unknown;
  requestBackground: BrowserExtensionContentScriptBackgroundRequester;
  abortSignal?: AbortSignal;
};

export async function handleBrowserExtensionContentScriptBridgeMessage(
  value: unknown,
  options: BrowserExtensionContentScriptBridgeOptions
): Promise<BrowserExtensionPageBridgeResponse> {
  return handleBrowserExtensionPageBridgeRequest(value, {
    ...(options.abortSignal !== undefined ? { abortSignal: options.abortSignal } : {}),
    requestBackground: (request, requestOptions) => options.requestBackground(request, options.sender, {
      ...(requestOptions.abortSignal !== undefined
        ? { nativeMessageAbortSignal: requestOptions.abortSignal }
        : {})
    })
  });
}
