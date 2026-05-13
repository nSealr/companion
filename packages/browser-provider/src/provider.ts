import {
  type EventTemplate,
  type SignEventRequest,
  type SignEventResponse,
  type SignedEvent,
  verifySignedEventResponse
} from "@nsealr/core";
import {
  type LocalClientIdentity,
  type LocalServiceClient,
  type LocalServiceRequest,
  type LocalServiceResponse
} from "@nsealr/client";
import { validateRequest, validateResponse } from "@nsealr/protocol";

export type Nip07Provider = {
  getPublicKey(): Promise<string>;
  signEvent(eventTemplate: EventTemplate): Promise<SignedEvent>;
};

export type BrowserProviderBackend = {
  getPublicKey(client: LocalClientIdentity): Promise<unknown>;
  signEventRequest(request: SignEventRequest, client: LocalClientIdentity): Promise<unknown>;
};

export type BrowserProviderOptions = {
  backend: BrowserProviderBackend;
  client: LocalClientIdentity;
  nextRequestId?: () => string;
};

export type LocalServiceBrowserProviderBackendOptions = {
  service: Pick<LocalServiceClient, "selectAccountRoute" | "validateSignerRequest">;
  routeRequest: Extract<LocalServiceRequest, { operation: "select_account_route" }>["params"]["route_request"];
  signingUnavailableMessage?: string;
};

function defaultRequestIdFactory(): () => string {
  let sequence = 0;
  return () => {
    sequence += 1;
    return `nip07-sign-event-${sequence}`;
  };
}

function assertLowerHex(value: unknown, length: number, label: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${label} is invalid`);
  }
  if (!new RegExp(`^[0-9a-f]{${length}}$`, "u").test(value)) {
    throw new Error(`${label} is invalid`);
  }
}

function signerRequestForTemplate(requestId: string, eventTemplate: EventTemplate): SignEventRequest {
  const request: SignEventRequest = {
    version: 1,
    request_id: requestId,
    method: "sign_event",
    params: {
      event_template: eventTemplate
    }
  };
  const validation = validateRequest(request);
  if (!validation.ok) {
    throw new Error(`NIP-07 signEvent input invalid: ${validation.error}`);
  }
  return request;
}

function signedEventFromResponse(request: SignEventRequest, response: unknown): SignedEvent {
  const validation = validateResponse(response);
  if (!validation.ok) {
    throw new Error(`NIP-07 signEvent response invalid: ${validation.error}`);
  }
  const typedResponse = response as SignEventResponse | {
    version: 1;
    request_id: string;
    ok: false;
    error: {
      code: string;
      message: string;
      retryable: boolean;
    };
  };
  if (typedResponse.request_id !== request.request_id) {
    throw new Error("NIP-07 signEvent response request_id does not match request");
  }
  if (typedResponse.ok === false) {
    throw new Error(`NIP-07 signEvent rejected: ${typedResponse.error.message}`);
  }
  const verification = verifySignedEventResponse(request, typedResponse);
  if (!verification.ok) {
    throw new Error(`NIP-07 signEvent response invalid: ${verification.error}`);
  }
  return typedResponse.result.event;
}

function localServiceErrorMessage(response: LocalServiceResponse, label: string): string {
  if (response.ok === false) {
    return `${label}: ${response.error.message}`;
  }
  return `${label}: unexpected local service result`;
}

function localServiceProtocolError(request: SignEventRequest, code: string, message: string): {
  version: 1;
  request_id: string;
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: false;
  };
} {
  return {
    version: 1,
    request_id: request.request_id,
    ok: false,
    error: {
      code,
      message,
      retryable: false
    }
  };
}

export function createLocalServiceBrowserProviderBackend(
  options: LocalServiceBrowserProviderBackendOptions
): BrowserProviderBackend {
  const unavailableMessage = options.signingUnavailableMessage ?? "Signer dispatch is not configured";
  return {
    async getPublicKey(client: LocalClientIdentity): Promise<string> {
      const response = await options.service.selectAccountRoute(client, options.routeRequest);
      if (response.ok !== true || !("route_selection" in response.result)) {
        throw new Error(localServiceErrorMessage(response, "NIP-07 route selection failed"));
      }
      return response.result.route_selection.public_key;
    },

    async signEventRequest(request: SignEventRequest, client: LocalClientIdentity): Promise<unknown> {
      const validationResponse = await options.service.validateSignerRequest(client, request);
      if (validationResponse.ok !== true || !("validation" in validationResponse.result)) {
        throw new Error(localServiceErrorMessage(validationResponse, "NIP-07 signer-request validation failed"));
      }
      if (!validationResponse.result.validation.valid) {
        return localServiceProtocolError(
          request,
          "invalid_signer_request",
          validationResponse.result.validation.error ?? "signer request is invalid"
        );
      }
      const routeResponse = await options.service.selectAccountRoute(client, options.routeRequest);
      if (routeResponse.ok !== true || !("route_selection" in routeResponse.result)) {
        throw new Error(localServiceErrorMessage(routeResponse, "NIP-07 route selection failed"));
      }
      return localServiceProtocolError(request, "signer_route_unavailable", unavailableMessage);
    }
  };
}

export function createNip07Provider(options: BrowserProviderOptions): Nip07Provider {
  const nextRequestId = options.nextRequestId ?? defaultRequestIdFactory();
  return {
    async getPublicKey(): Promise<string> {
      const publicKey = await options.backend.getPublicKey(options.client);
      assertLowerHex(publicKey, 64, "NIP-07 public key");
      return publicKey;
    },

    async signEvent(eventTemplate: EventTemplate): Promise<SignedEvent> {
      const request = signerRequestForTemplate(nextRequestId(), eventTemplate);
      const response = await options.backend.signEventRequest(request, options.client);
      return signedEventFromResponse(request, response);
    }
  };
}
