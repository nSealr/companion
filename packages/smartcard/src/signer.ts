import {
  bytesToHex,
  computeEventId,
  hexToBytes,
  verifySchnorrSignature,
  verifySignedEventResponse,
  type SignEventRequest,
  type SignEventResponse
} from "../../core/src/nostr.js";
import { validateRequest } from "../../protocol/src/protocol.js";
import { CommandApdu, GET_PUBLIC_KEY_INS, NOSTRSEAL_CLA, ResponseApdu, SIGN_EVENT_ID_INS, SW_NO_ERROR } from "./apdu.js";

export type SmartcardApduTransport = {
  exchange(command: CommandApdu): Promise<ResponseApdu>;
};

export type SmartcardReviewAcknowledgement = {
  acknowledged: true;
  source: "external-review";
  approvalDigest?: string;
};

function assertSignEventRequest(request: SignEventRequest): void {
  const validation = validateRequest(request);
  if (!validation.ok) throw new Error(validation.error);
  if (request.version !== 1 || request.method !== "sign_event" || !request.params?.event_template) {
    throw new Error("SmartcardSigner only supports v0 sign_event requests");
  }
}

function assertReviewAcknowledged(acknowledgement?: SmartcardReviewAcknowledgement): asserts acknowledgement is SmartcardReviewAcknowledgement {
  if (acknowledgement?.acknowledged !== true) {
    throw new Error("smartcard signing requires explicit review acknowledgement");
  }
  if (acknowledgement.source !== "external-review") {
    throw new Error("display-less smartcard signing requires external review acknowledgement");
  }
}

function assertSuccessfulApdu(response: ResponseApdu, expectedDataLength: number, label: string): void {
  if (response.statusWord !== SW_NO_ERROR) {
    throw new Error(`${label} APDU failed with status ${response.statusWordHex()}`);
  }
  if (response.data.length !== expectedDataLength) {
    throw new Error(`${label} APDU returned ${response.data.length} bytes, expected ${expectedDataLength}`);
  }
}

export class SmartcardSigner {
  constructor(private readonly transport: SmartcardApduTransport) {}

  async getPublicKey(): Promise<string> {
    const response = await this.transport.exchange(new CommandApdu(NOSTRSEAL_CLA, GET_PUBLIC_KEY_INS));
    assertSuccessfulApdu(response, 32, "get_public_key");
    return bytesToHex(response.data);
  }

  async signEventRequest(
    request: SignEventRequest,
    acknowledgement?: SmartcardReviewAcknowledgement
  ): Promise<SignEventResponse> {
    assertSignEventRequest(request);
    assertReviewAcknowledged(acknowledgement);

    const pubkey = await this.getPublicKey();
    const eventWithoutSignature = {
      ...request.params.event_template,
      pubkey
    };
    const id = computeEventId(eventWithoutSignature);
    const signatureResponse = await this.transport.exchange(
      new CommandApdu(NOSTRSEAL_CLA, SIGN_EVENT_ID_INS, 0, 0, Uint8Array.from(hexToBytes(id)))
    );
    assertSuccessfulApdu(signatureResponse, 64, "sign_event_id");

    const sig = bytesToHex(signatureResponse.data);
    if (!verifySchnorrSignature(pubkey, id, sig)) {
      throw new Error("smartcard Schnorr signature is invalid");
    }

    const response: SignEventResponse = {
      version: 1,
      request_id: request.request_id,
      ok: true,
      result: {
        event: {
          ...request.params.event_template,
          pubkey,
          id,
          sig
        }
      }
    };
    const verification = verifySignedEventResponse(request, response);
    if (!verification.ok) throw new Error(verification.error);
    return response;
  }
}
