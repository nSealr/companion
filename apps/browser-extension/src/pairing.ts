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
import { BROWSER_EXTENSION_NAME } from "./manifest.js";

export const BROWSER_EXTENSION_DEFAULT_PAIRING_OPERATIONS = [
  "select_account_route",
  "validate_signer_request"
] as const satisfies readonly PairableLocalServiceOperation[];
export const BROWSER_EXTENSION_ORIGIN_PERMISSION_REVIEW_FORMAT = "nsealr-browser-origin-permission-review-v0";

export type BrowserExtensionNativeMessagingPairingOptions = {
  sendNativeMessage: BrowserNativeMessageSender;
  hostName?: string;
  nextServiceRequestId?: () => string;
  requestedOperations?: readonly PairableLocalServiceOperation[];
  nativeMessageTimeoutMs?: number;
  nativeMessageAbortSignal?: AbortSignal;
};

export type BrowserExtensionPairingIntentResult = {
  context: BrowserExtensionClientContext;
  response: LocalServiceResponse;
};

export type BrowserExtensionPairingReviewResult = BrowserExtensionPairingIntentResult & {
  review: LocalPairingReview;
};

export type BrowserExtensionOriginPermissionMethod = {
  method: "get_public_key" | "sign_event";
  label: string;
  effect: string;
};

export type BrowserExtensionOriginPermissionReview = {
  format: typeof BROWSER_EXTENSION_ORIGIN_PERMISSION_REVIEW_FORMAT;
  origin: string;
  app_name: string;
  extension_id: string;
  requested_methods: BrowserExtensionOriginPermissionMethod[];
  local_pairing_digest: string;
  requires_user_approval: true;
  stores_production_secrets: false;
  creates_grants: false;
  injects_provider: false;
};

export type BrowserExtensionOriginPermissionReviewResult = BrowserExtensionPairingReviewResult & {
  originReview: BrowserExtensionOriginPermissionReview;
};

const BROWSER_EXTENSION_METHOD_REVIEWS: Record<
  BrowserExtensionOriginPermissionMethod["method"],
  Omit<BrowserExtensionOriginPermissionMethod, "method">
> = {
  get_public_key: {
    label: "Read public key",
    effect: "The page can read the selected account public key through the browser provider."
  },
  sign_event: {
    label: "Request event signatures",
    effect: "The page can ask for Nostr event signatures; the selected signer route still enforces review, approval, and policy."
  }
};

function originPermissionMethods(review: LocalPairingReview): BrowserExtensionOriginPermissionMethod[] {
  const operations = new Set(review.requested_operations.map((operation) => operation.operation));
  const methods: BrowserExtensionOriginPermissionMethod[] = [];
  if (operations.has("select_account_route")) {
    methods.push({
      method: "get_public_key",
      ...BROWSER_EXTENSION_METHOD_REVIEWS.get_public_key
    });
  }
  if (operations.has("validate_signer_request")) {
    methods.push({
      method: "sign_event",
      ...BROWSER_EXTENSION_METHOD_REVIEWS.sign_event
    });
  }
  if (methods.length === 0) {
    throw new Error("browser extension origin permission review has no page-visible methods");
  }
  return methods;
}

export function projectBrowserExtensionOriginPermissionReview(
  result: BrowserExtensionPairingReviewResult
): BrowserExtensionOriginPermissionReview {
  return {
    format: BROWSER_EXTENSION_ORIGIN_PERMISSION_REVIEW_FORMAT,
    origin: result.context.client.origin,
    app_name: result.context.client.app_name ?? `${BROWSER_EXTENSION_NAME} Browser Extension`,
    extension_id: result.context.extension_id,
    requested_methods: originPermissionMethods(result.review),
    local_pairing_digest: result.review.pairing_digest,
    requires_user_approval: true,
    stores_production_secrets: false,
    creates_grants: false,
    injects_provider: false
  };
}

export async function requestBrowserExtensionNativeMessagingPairingIntent(
  sender: unknown,
  options: BrowserExtensionNativeMessagingPairingOptions
): Promise<BrowserExtensionPairingIntentResult> {
  const context = browserExtensionClientContextFromSender(sender);
  const service = createBrowserNativeMessagingLocalServiceClient({
    sendNativeMessage: options.sendNativeMessage,
    ...(options.hostName !== undefined ? { hostName: options.hostName } : {}),
    ...(options.nextServiceRequestId !== undefined ? { nextRequestId: options.nextServiceRequestId } : {}),
    ...(options.nativeMessageTimeoutMs !== undefined ? { timeoutMs: options.nativeMessageTimeoutMs } : {}),
    ...(options.nativeMessageAbortSignal !== undefined ? { abortSignal: options.nativeMessageAbortSignal } : {})
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

export async function requestBrowserExtensionNativeMessagingOriginPermissionReview(
  sender: unknown,
  options: BrowserExtensionNativeMessagingPairingOptions
): Promise<BrowserExtensionOriginPermissionReviewResult> {
  const result = await requestBrowserExtensionNativeMessagingPairingReview(sender, options);
  return {
    ...result,
    originReview: projectBrowserExtensionOriginPermissionReview(result)
  };
}
