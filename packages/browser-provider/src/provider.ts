import {
  type EventTemplate,
  type SignEventRequest,
  type SignEventResponse,
  type SignedEvent,
  verifySignedEventResponse
} from "@nsealr/core";
import { validateRequest, validateResponse } from "@nsealr/protocol";

export type Nip07Provider = {
  getPublicKey(): Promise<string>;
  signEvent(eventTemplate: EventTemplate): Promise<SignedEvent>;
};

export type BrowserProviderBackend = {
  getPublicKey(): Promise<unknown>;
  signEventRequest(request: SignEventRequest): Promise<unknown>;
};

export type BrowserProviderOptions = {
  backend: BrowserProviderBackend;
  nextRequestId?: () => string;
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

export function createNip07Provider(options: BrowserProviderOptions): Nip07Provider {
  const nextRequestId = options.nextRequestId ?? defaultRequestIdFactory();
  return {
    async getPublicKey(): Promise<string> {
      const publicKey = await options.backend.getPublicKey();
      assertLowerHex(publicKey, 64, "NIP-07 public key");
      return publicKey;
    },

    async signEvent(eventTemplate: EventTemplate): Promise<SignedEvent> {
      const request = signerRequestForTemplate(nextRequestId(), eventTemplate);
      const response = await options.backend.signEventRequest(request);
      return signedEventFromResponse(request, response);
    }
  };
}
