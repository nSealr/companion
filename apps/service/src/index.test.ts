import { describe, expect, it } from "vitest";
import { decodeNativeMessage, encodeNativeMessage } from "@nsealr/client";
import { runServiceOnce } from "./index.js";

describe("local companion service app", () => {
  it("handles one native-messaging service request", () => {
    const output = runServiceOnce(encodeNativeMessage({
      version: 1,
      request_id: "svc-status-1",
      operation: "service_status"
    }));

    expect(decodeNativeMessage(output)).toMatchObject({
      version: 1,
      request_id: "svc-status-1",
      ok: true,
      result: {
        service: {
          protocol: "nsealr-local-service-v0",
          stores_production_secrets: false
        }
      }
    });
  });
});
