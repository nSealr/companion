import {
  createBrowserNativeMessagingLocalServiceClient,
  type BrowserNativeMessageSender
} from "@nsealr/browser-provider";
import {
  type LocalServiceResponse,
  type PairableLocalServiceOperation
} from "@nsealr/client";
import {
  browserExtensionClientContextFromSender,
  type BrowserExtensionClientContext
} from "./sender.js";

export const BROWSER_EXTENSION_DEFAULT_PAIRING_OPERATIONS = [
  "select_account_route",
  "validate_signer_request"
] as const satisfies readonly PairableLocalServiceOperation[];

export type BrowserExtensionNativeMessagingPairingOptions = {
  sendNativeMessage: BrowserNativeMessageSender;
  hostName?: string;
  nextServiceRequestId?: () => string;
  requestedOperations?: readonly PairableLocalServiceOperation[];
};

export type BrowserExtensionPairingIntentResult = {
  context: BrowserExtensionClientContext;
  response: LocalServiceResponse;
};

export async function requestBrowserExtensionNativeMessagingPairingIntent(
  sender: unknown,
  options: BrowserExtensionNativeMessagingPairingOptions
): Promise<BrowserExtensionPairingIntentResult> {
  const context = browserExtensionClientContextFromSender(sender);
  const service = createBrowserNativeMessagingLocalServiceClient({
    sendNativeMessage: options.sendNativeMessage,
    ...(options.hostName !== undefined ? { hostName: options.hostName } : {}),
    ...(options.nextServiceRequestId !== undefined ? { nextRequestId: options.nextServiceRequestId } : {})
  });
  const response = await service.requestPairing(
    context.client,
    [...(options.requestedOperations ?? BROWSER_EXTENSION_DEFAULT_PAIRING_OPERATIONS)]
  );

  return {
    context,
    response
  };
}
