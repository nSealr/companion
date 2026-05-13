#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { decodeNativeMessage, encodeNativeMessage, handleLocalServiceRequest } from "@nsealr/client";

export function runServiceOnce(input: Uint8Array): Uint8Array {
  try {
    return encodeNativeMessage(handleLocalServiceRequest(decodeNativeMessage(input)));
  } catch (error) {
    return encodeNativeMessage(handleLocalServiceRequest({
      version: 1,
      request_id: "invalid-service-request",
      operation: "invalid",
      params: {
        error: error instanceof Error ? error.message : String(error)
      }
    }));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(1, runServiceOnce(readFileSync(0)));
}
