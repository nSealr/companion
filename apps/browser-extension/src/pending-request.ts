import { type BrowserExtensionRequest } from "./messages.js";
import {
  browserExtensionClientContextFromSender,
  type BrowserExtensionSenderInput
} from "./sender.js";

export const BROWSER_EXTENSION_PENDING_REQUEST_STATE_FORMAT =
  "nsealr-browser-extension-pending-request-state-v0";

export type BrowserExtensionPendingRequestStatus = "pending" | "resolved" | "rejected";

export type BrowserExtensionPendingRequestState = {
  format: typeof BROWSER_EXTENSION_PENDING_REQUEST_STATE_FORMAT;
  request_id: string;
  method: BrowserExtensionRequest["method"];
  extension_id: string;
  page_origin: string;
  app_name?: string;
  status: BrowserExtensionPendingRequestStatus;
  started_at: number;
  updated_at: number;
  stores_production_secrets: false;
  includes_event_template: false;
};

export type BrowserExtensionPendingRequestLifecycle = {
  start(request: BrowserExtensionRequest, sender: BrowserExtensionSenderInput): BrowserExtensionPendingRequestState;
  settle(
    state: BrowserExtensionPendingRequestState,
    status: Exclude<BrowserExtensionPendingRequestStatus, "pending">
  ): BrowserExtensionPendingRequestState;
  active(): readonly BrowserExtensionPendingRequestState[];
};

export type BrowserExtensionPendingRequestLifecycleOptions = {
  now?: () => number;
  onState?: (state: BrowserExtensionPendingRequestState) => void;
};

function requireNonNegativeSafeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function emitState(
  onState: ((state: BrowserExtensionPendingRequestState) => void) | undefined,
  state: BrowserExtensionPendingRequestState
): BrowserExtensionPendingRequestState {
  onState?.(state);
  return state;
}

export function createBrowserExtensionPendingRequestLifecycle(
  options: BrowserExtensionPendingRequestLifecycleOptions = {}
): BrowserExtensionPendingRequestLifecycle {
  const active = new Map<string, BrowserExtensionPendingRequestState>();
  const now = options.now ?? Date.now;

  return Object.freeze({
    start(request: BrowserExtensionRequest, sender: BrowserExtensionSenderInput): BrowserExtensionPendingRequestState {
      const context = browserExtensionClientContextFromSender(sender);
      const timestamp = requireNonNegativeSafeInteger(now(), "browser extension pending request timestamp");
      const state = Object.freeze({
        format: BROWSER_EXTENSION_PENDING_REQUEST_STATE_FORMAT,
        request_id: request.request_id,
        method: request.method,
        extension_id: context.extension_id,
        page_origin: context.page_origin,
        ...(context.client.app_name !== undefined ? { app_name: context.client.app_name } : {}),
        status: "pending" as const,
        started_at: timestamp,
        updated_at: timestamp,
        stores_production_secrets: false as const,
        includes_event_template: false as const
      });
      active.set(state.request_id, state);
      try {
        return emitState(options.onState, state);
      } catch (error) {
        active.delete(state.request_id);
        throw error;
      }
    },

    settle(
      state: BrowserExtensionPendingRequestState,
      status: Exclude<BrowserExtensionPendingRequestStatus, "pending">
    ): BrowserExtensionPendingRequestState {
      const timestamp = requireNonNegativeSafeInteger(now(), "browser extension pending request timestamp");
      const settled = Object.freeze({
        ...state,
        status,
        updated_at: timestamp
      });
      active.delete(state.request_id);
      return emitState(options.onState, settled);
    },

    active(): readonly BrowserExtensionPendingRequestState[] {
      return Object.freeze(Array.from(active.values()));
    }
  });
}
