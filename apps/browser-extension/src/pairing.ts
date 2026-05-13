import {
  createBrowserNativeMessagingLocalServiceClient,
  type BrowserNativeMessageSender
} from "@nsealr/browser-provider";
import {
  reviewPairingIntent,
  type LocalPairingReview,
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
  nativeMessageTimeoutMs?: number;
};

export type BrowserExtensionPairingIntentResult = {
  context: BrowserExtensionClientContext;
  response: LocalServiceResponse;
};

export type BrowserExtensionPairingReviewResult = BrowserExtensionPairingIntentResult & {
  review: LocalPairingReview;
};

export async function requestBrowserExtensionNativeMessagingPairingIntent(
  sender: unknown,
  options: BrowserExtensionNativeMessagingPairingOptions
): Promise<BrowserExtensionPairingIntentResult> {
  const context = browserExtensionClientContextFromSender(sender);
  const service = createBrowserNativeMessagingLocalServiceClient({
    sendNativeMessage: options.sendNativeMessage,
    ...(options.hostName !== undefined ? { hostName: options.hostName } : {}),
    ...(options.nextServiceRequestId !== undefined ? { nextRequestId: options.nextServiceRequestId } : {}),
    ...(options.nativeMessageTimeoutMs !== undefined ? { timeoutMs: options.nativeMessageTimeoutMs } : {})
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

export async function requestBrowserExtensionNativeMessagingPairingReview(
  sender: unknown,
  options: BrowserExtensionNativeMessagingPairingOptions
): Promise<BrowserExtensionPairingReviewResult> {
  const result = await requestBrowserExtensionNativeMessagingPairingIntent(sender, options);
  if (result.response.ok !== true || !("pairing_intent" in result.response.result)) {
    throw new Error("browser extension pairing response did not include a pairing intent");
  }
  return {
    ...result,
    review: reviewPairingIntent(result.response.result.pairing_intent)
  };
}
