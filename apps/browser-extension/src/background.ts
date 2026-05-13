import {
  type PairableLocalServiceOperation
} from "@nsealr/client";
import {
  type BrowserNativeMessageSender,
  type LocalServiceBrowserProviderBackendOptions
} from "@nsealr/browser-provider";
import {
  handleBrowserExtensionSenderRequest,
  type BrowserExtensionResponse
} from "./handler.js";
import { createBrowserExtensionNativeMessagingProviderSelector } from "./local-service.js";
import {
  requestBrowserExtensionNativeMessagingPairingIntent,
  requestBrowserExtensionNativeMessagingOriginPermissionReview,
  requestBrowserExtensionNativeMessagingPairingReview,
  type BrowserExtensionPairingIntentResult,
  type BrowserExtensionOriginPermissionReviewResult,
  type BrowserExtensionPairingReviewResult,
  type BrowserExtensionNativeMessagingPairingOptions
} from "./pairing.js";
import { type BrowserExtensionClientContext } from "./sender.js";

export type BrowserExtensionBackgroundControllerOptions = {
  sendNativeMessage: BrowserNativeMessageSender;
  routeRequest: LocalServiceBrowserProviderBackendOptions["routeRequest"];
  hostName?: string;
  nextServiceRequestId?: () => string;
  nextSignerRequestId?: () => string;
  signingUnavailableMessage?: string;
  pairingOperations?: readonly PairableLocalServiceOperation[];
  nativeMessageTimeoutMs?: number;
  nativeMessageAbortSignal?: AbortSignal;
};

export type BrowserExtensionBackgroundRequestOptions = {
  nativeMessageAbortSignal?: AbortSignal;
};

export type BrowserExtensionBackgroundController = {
  handleRequest(
    value: unknown,
    sender: unknown,
    requestOptions?: BrowserExtensionBackgroundRequestOptions
  ): Promise<BrowserExtensionResponse>;
  requestPairing(
    sender: unknown,
    requestOptions?: BrowserExtensionBackgroundRequestOptions
  ): Promise<BrowserExtensionPairingIntentResult>;
  requestPairingReview(
    sender: unknown,
    requestOptions?: BrowserExtensionBackgroundRequestOptions
  ): Promise<BrowserExtensionPairingReviewResult>;
  requestOriginPermissionReview(
    sender: unknown,
    requestOptions?: BrowserExtensionBackgroundRequestOptions
  ): Promise<BrowserExtensionOriginPermissionReviewResult>;
};

export function createBrowserExtensionBackgroundController(
  options: BrowserExtensionBackgroundControllerOptions
): BrowserExtensionBackgroundController {
  const providerOptions = {
    sendNativeMessage: options.sendNativeMessage,
    routeRequest: options.routeRequest,
    ...(options.hostName !== undefined ? { hostName: options.hostName } : {}),
    ...(options.nextServiceRequestId !== undefined ? { nextServiceRequestId: options.nextServiceRequestId } : {}),
    ...(options.nextSignerRequestId !== undefined ? { nextSignerRequestId: options.nextSignerRequestId } : {}),
    ...(options.nativeMessageTimeoutMs !== undefined ? { nativeMessageTimeoutMs: options.nativeMessageTimeoutMs } : {}),
    ...(options.nativeMessageAbortSignal !== undefined
      ? { nativeMessageAbortSignal: options.nativeMessageAbortSignal }
      : {}),
    ...(options.signingUnavailableMessage !== undefined
      ? { signingUnavailableMessage: options.signingUnavailableMessage }
      : {})
  };
  const pairingOptions: BrowserExtensionNativeMessagingPairingOptions = {
    sendNativeMessage: options.sendNativeMessage,
    ...(options.hostName !== undefined ? { hostName: options.hostName } : {}),
    ...(options.nextServiceRequestId !== undefined ? { nextServiceRequestId: options.nextServiceRequestId } : {}),
    ...(options.pairingOperations !== undefined ? { requestedOperations: options.pairingOperations } : {}),
    ...(options.nativeMessageTimeoutMs !== undefined ? { nativeMessageTimeoutMs: options.nativeMessageTimeoutMs } : {}),
    ...(options.nativeMessageAbortSignal !== undefined
      ? { nativeMessageAbortSignal: options.nativeMessageAbortSignal }
      : {})
  };
  const providerForClient = createBrowserExtensionNativeMessagingProviderSelector(providerOptions);

  return {
    handleRequest(
      value: unknown,
      sender: unknown,
      requestOptions: BrowserExtensionBackgroundRequestOptions = {}
    ): Promise<BrowserExtensionResponse> {
      if (requestOptions.nativeMessageAbortSignal === undefined) {
        return handleBrowserExtensionSenderRequest(value, sender, { providerForClient });
      }
      return handleBrowserExtensionSenderRequest(value, sender, {
        providerForClient: createBrowserExtensionNativeMessagingProviderSelector({
          ...providerOptions,
          nativeMessageAbortSignal: requestOptions.nativeMessageAbortSignal
        })
      });
    },

    requestPairing(
      sender: unknown,
      requestOptions: BrowserExtensionBackgroundRequestOptions = {}
    ): Promise<BrowserExtensionPairingIntentResult> {
      return requestBrowserExtensionNativeMessagingPairingIntent(sender, {
        ...pairingOptions,
        ...(requestOptions.nativeMessageAbortSignal !== undefined
          ? { nativeMessageAbortSignal: requestOptions.nativeMessageAbortSignal }
          : {})
      });
    },

    requestPairingReview(
      sender: unknown,
      requestOptions: BrowserExtensionBackgroundRequestOptions = {}
    ): Promise<BrowserExtensionPairingReviewResult> {
      return requestBrowserExtensionNativeMessagingPairingReview(sender, {
        ...pairingOptions,
        ...(requestOptions.nativeMessageAbortSignal !== undefined
          ? { nativeMessageAbortSignal: requestOptions.nativeMessageAbortSignal }
          : {})
      });
    },

    requestOriginPermissionReview(
      sender: unknown,
      requestOptions: BrowserExtensionBackgroundRequestOptions = {}
    ): Promise<BrowserExtensionOriginPermissionReviewResult> {
      return requestBrowserExtensionNativeMessagingOriginPermissionReview(sender, {
        ...pairingOptions,
        ...(requestOptions.nativeMessageAbortSignal !== undefined
          ? { nativeMessageAbortSignal: requestOptions.nativeMessageAbortSignal }
          : {})
      });
    }
  };
}

export type { BrowserExtensionClientContext };
