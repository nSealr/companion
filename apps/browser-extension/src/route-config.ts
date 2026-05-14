import {
  parseRouteSelectionRequest,
  type RouteSelectionRequest
} from "@nsealr/policy";

export const BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT = "nsealr-browser-extension-route-config-v0";
export const BROWSER_EXTENSION_ROUTE_CONFIG_METHOD = "sign_event";

export type BrowserExtensionRouteConfig = {
  format: typeof BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT;
  account_id: string;
  route_type?: RouteSelectionRequest["route_type"];
};

export type BrowserExtensionParsedRouteConfig = {
  format: typeof BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT;
  route_request: RouteSelectionRequest;
  stores_production_secrets: false;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

export function parseBrowserExtensionRouteConfig(value: unknown): BrowserExtensionParsedRouteConfig {
  if (!isRecord(value)) throw new Error("browser extension route config must be an object");
  if (!hasOnlyKeys(value, ["format", "account_id", "route_type"])) {
    throw new Error("browser extension route config has unsupported fields");
  }
  if (value.format !== BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT) {
    throw new Error("browser extension route config format is unsupported");
  }
  const routeRequest = parseRouteSelectionRequest({
    account_id: value.account_id,
    method: BROWSER_EXTENSION_ROUTE_CONFIG_METHOD,
    ...(value.route_type !== undefined ? { route_type: value.route_type } : {})
  });
  return Object.freeze({
    format: BROWSER_EXTENSION_ROUTE_CONFIG_FORMAT,
    route_request: routeRequest,
    stores_production_secrets: false
  });
}
