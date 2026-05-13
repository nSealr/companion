#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import {
  decodeNativeMessage,
  encodeNativeMessage,
  handleLocalServiceRequest,
  type LocalServiceContext,
  type LocalServiceResponse
} from "@nsealr/client";

function nativeMessageError(message: string): LocalServiceResponse {
  return {
    version: 1,
    request_id: "invalid-service-request",
    ok: false,
    error: {
      code: "invalid_native_message",
      message,
      retryable: false
    }
  };
}

export function runServiceOnce(input: Uint8Array, context: LocalServiceContext = {}): Uint8Array {
  try {
    return encodeNativeMessage(handleLocalServiceRequest(decodeNativeMessage(input), context));
  } catch (error) {
    return encodeNativeMessage(nativeMessageError(error instanceof Error ? error.message : String(error)));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(1, runServiceOnce(readFileSync(0)));
}
