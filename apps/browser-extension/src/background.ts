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
  type BrowserExtensionPairingIntentResult
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
};

export type BrowserExtensionBackgroundController = {
  handleRequest(value: unknown, sender: unknown): Promise<BrowserExtensionResponse>;
  requestPairing(sender: unknown): Promise<BrowserExtensionPairingIntentResult>;
};

export function createBrowserExtensionBackgroundController(
  options: BrowserExtensionBackgroundControllerOptions
): BrowserExtensionBackgroundController {
  const providerForClient = createBrowserExtensionNativeMessagingProviderSelector({
    sendNativeMessage: options.sendNativeMessage,
    routeRequest: options.routeRequest,
    ...(options.hostName !== undefined ? { hostName: options.hostName } : {}),
    ...(options.nextServiceRequestId !== undefined ? { nextServiceRequestId: options.nextServiceRequestId } : {}),
    ...(options.nextSignerRequestId !== undefined ? { nextSignerRequestId: options.nextSignerRequestId } : {}),
    ...(options.signingUnavailableMessage !== undefined
      ? { signingUnavailableMessage: options.signingUnavailableMessage }
      : {})
  });

  return {
    handleRequest(value: unknown, sender: unknown): Promise<BrowserExtensionResponse> {
      return handleBrowserExtensionSenderRequest(value, sender, { providerForClient });
    },

    requestPairing(sender: unknown): Promise<BrowserExtensionPairingIntentResult> {
      return requestBrowserExtensionNativeMessagingPairingIntent(sender, {
        sendNativeMessage: options.sendNativeMessage,
        ...(options.hostName !== undefined ? { hostName: options.hostName } : {}),
        ...(options.nextServiceRequestId !== undefined ? { nextServiceRequestId: options.nextServiceRequestId } : {}),
        ...(options.pairingOperations !== undefined ? { requestedOperations: options.pairingOperations } : {})
      });
    }
  };
}

export type { BrowserExtensionClientContext };
