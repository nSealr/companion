import { describe, expect, it } from "vitest";
import {
  BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
  BROWSER_EXTENSION_ROUTE_CONFIG_METHOD,
  parseBrowserExtensionRouteConfig
} from "./route-config.js";

describe("browser extension selected-route config", () => {
  it("parses a secretless selected account route into a sign_event route request", () => {
    expect(parseBrowserExtensionRouteConfig({
      format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
      account_id: "esp32-usb-slot-0",
      route_type: "esp32_usb_nip46"
    })).toEqual({
      format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
      route_request: {
        account_id: "esp32-usb-slot-0",
        method: BROWSER_EXTENSION_ROUTE_CONFIG_METHOD,
        route_type: "esp32_usb_nip46"
      },
      stores_production_secrets: false
    });
  });

  it("allows route type to be omitted for account-only route selection", () => {
    expect(parseBrowserExtensionRouteConfig({
      format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
      account_id: "selected-account"
    }).route_request).toEqual({
      account_id: "selected-account",
      method: "sign_event"
    });
  });

  it("rejects malformed, unsupported, or secret-looking route config fields", () => {
    expect(() => parseBrowserExtensionRouteConfig(null)).toThrow(/object/u);
    expect(() => parseBrowserExtensionRouteConfig({
      format: "nsealr-wrong-format",
      account_id: "selected-account"
    })).toThrow(/format/u);
    expect(() => parseBrowserExtensionRouteConfig({
      format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
      account_id: "selected-account",
      route_type: "unknown"
    })).toThrow(/route_type/u);
    expect(() => parseBrowserExtensionRouteConfig({
      format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
      account_id: "selected-account",
      nsec: "nsec1..."
    })).toThrow(/unsupported fields/u);
    expect(() => parseBrowserExtensionRouteConfig({
      format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
      account_id: "",
      route_type: "esp32_usb_nip46"
    })).toThrow(/account_id/u);
  });
});
