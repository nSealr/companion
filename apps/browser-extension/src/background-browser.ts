import {
  type BrowserNativeMessageSender,
  type LocalServiceBrowserProviderBackendOptions
} from "@nsealr/browser-provider";
import {
  createBrowserExtensionBackgroundController,
  type BrowserExtensionBackgroundController
} from "./background.js";
import {
  installBrowserExtensionRuntimeMessageListener,
  type BrowserExtensionRuntimeMessageEventTarget,
  type BrowserExtensionRuntimeMessageListenerHandle
} from "./runtime-message.js";
import {
  parseBrowserExtensionRouteConfig
} from "./route-config.js";

export type BrowserExtensionBackgroundBrowserRuntimeApi = {
  onMessage: BrowserExtensionRuntimeMessageEventTarget;
  sendNativeMessage(hostName: string, message: unknown): Promise<unknown> | unknown;
};

export type BrowserExtensionBackgroundBrowserEntrypointOptions = {
  runtime: BrowserExtensionBackgroundBrowserRuntimeApi;
  routeRequest?: LocalServiceBrowserProviderBackendOptions["routeRequest"];
  routeConfig?: unknown;
  hostName?: string;
  extensionId?: string;
  appName?: string;
  nextServiceRequestId?: () => string;
  nextSignerRequestId?: () => string;
  signingUnavailableMessage?: string;
  nativeMessageTimeoutMs?: number;
  nativeMessageAbortSignal?: AbortSignal;
  onError?: (error: unknown) => void;
};

export type BrowserExtensionBackgroundBrowserEntrypointHandle =
  BrowserExtensionRuntimeMessageListenerHandle & {
    controller: BrowserExtensionBackgroundController;
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireBrowserRuntime(
  value: BrowserExtensionBackgroundBrowserRuntimeApi
): BrowserExtensionBackgroundBrowserRuntimeApi {
  if (
    !isRecord(value) ||
    !isRecord(value.onMessage) ||
    typeof value.onMessage.addListener !== "function" ||
    typeof value.onMessage.removeListener !== "function" ||
    typeof value.sendNativeMessage !== "function"
  ) {
    throw new Error("browser background runtime is invalid");
  }
  return value;
}

function routeRequestFromOptions(
  options: BrowserExtensionBackgroundBrowserEntrypointOptions
): LocalServiceBrowserProviderBackendOptions["routeRequest"] {
  if ((options.routeRequest === undefined) === (options.routeConfig === undefined)) {
    throw new Error("browser background route configuration is invalid");
  }
  return options.routeRequest ?? parseBrowserExtensionRouteConfig(options.routeConfig).route_request;
}

export function createBrowserExtensionBackgroundBrowserNativeMessageSender(
  runtime: BrowserExtensionBackgroundBrowserRuntimeApi
): BrowserNativeMessageSender {
  const browserRuntime = requireBrowserRuntime(runtime);
  return (hostName, message, options) => {
    if (options.abortSignal?.aborted === true) {
      throw new Error("browser background native-message request was cancelled");
    }
    return browserRuntime.sendNativeMessage(hostName, message);
  };
}

export function installBrowserExtensionBackgroundBrowserEntrypoint(
  options: BrowserExtensionBackgroundBrowserEntrypointOptions
): BrowserExtensionBackgroundBrowserEntrypointHandle {
  const runtime = requireBrowserRuntime(options.runtime);
  const routeRequest = routeRequestFromOptions(options);
  const controller = createBrowserExtensionBackgroundController({
    sendNativeMessage: createBrowserExtensionBackgroundBrowserNativeMessageSender(runtime),
    routeRequest,
    ...(options.hostName !== undefined ? { hostName: options.hostName } : {}),
    ...(options.nextServiceRequestId !== undefined ? { nextServiceRequestId: options.nextServiceRequestId } : {}),
    ...(options.nextSignerRequestId !== undefined ? { nextSignerRequestId: options.nextSignerRequestId } : {}),
    ...(options.signingUnavailableMessage !== undefined
      ? { signingUnavailableMessage: options.signingUnavailableMessage }
      : {}),
    ...(options.nativeMessageTimeoutMs !== undefined ? { nativeMessageTimeoutMs: options.nativeMessageTimeoutMs } : {}),
    ...(options.nativeMessageAbortSignal !== undefined
      ? { nativeMessageAbortSignal: options.nativeMessageAbortSignal }
      : {})
  });
  const listener = installBrowserExtensionRuntimeMessageListener({
    runtimeOnMessage: runtime.onMessage,
    controller,
    ...(options.extensionId !== undefined ? { extensionId: options.extensionId } : {}),
    ...(options.appName !== undefined ? { appName: options.appName } : {}),
    ...(options.nativeMessageAbortSignal !== undefined
      ? { nativeMessageAbortSignal: options.nativeMessageAbortSignal }
      : {}),
    ...(options.onError !== undefined ? { onError: options.onError } : {})
  });
  return Object.freeze({
    controller,
    dispose(): void {
      listener.dispose();
    }
  });
}
