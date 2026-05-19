import { type BrowserExtensionRequest } from "./messages.js";
import {
  browserExtensionClientContextFromSender,
  type BrowserExtensionSenderInput
} from "./sender.js";

export const BROWSER_EXTENSION_PENDING_REQUEST_STATE_FORMAT =
  "nsealr-browser-extension-pending-request-state-v0";

export type BrowserExtensionPendingRequestStatus = "pending" | "resolved" | "rejected" | "cancelled";
export type BrowserExtensionPendingRequestSettledStatus = "resolved" | "rejected";

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
    status: BrowserExtensionPendingRequestSettledStatus
  ): BrowserExtensionPendingRequestState;
  cancel(requestId: string): BrowserExtensionPendingRequestState | undefined;
  abortSignal(state: BrowserExtensionPendingRequestState): AbortSignal | undefined;
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
  const abortControllers = new Map<string, AbortController>();
  const now = options.now ?? Date.now;

  function stateWithStatus(
    state: BrowserExtensionPendingRequestState,
    status: Exclude<BrowserExtensionPendingRequestStatus, "pending">
  ): BrowserExtensionPendingRequestState {
    const timestamp = requireNonNegativeSafeInteger(now(), "browser extension pending request timestamp");
    return Object.freeze({
      ...state,
      status,
      updated_at: timestamp
    });
  }

  return Object.freeze({
    start(request: BrowserExtensionRequest, sender: BrowserExtensionSenderInput): BrowserExtensionPendingRequestState {
      if (active.has(request.request_id)) {
        throw new Error("browser extension pending request id is already active");
      }
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
      const abortController = new AbortController();
      active.set(state.request_id, state);
      abortControllers.set(state.request_id, abortController);
      try {
        return emitState(options.onState, state);
      } catch (error) {
        active.delete(state.request_id);
        abortControllers.delete(state.request_id);
        throw error;
      }
    },

    settle(
      state: BrowserExtensionPendingRequestState,
      status: BrowserExtensionPendingRequestSettledStatus
    ): BrowserExtensionPendingRequestState {
      if (active.get(state.request_id) !== state) {
        return state;
      }
      const settled = stateWithStatus(state, status);
      active.delete(state.request_id);
      abortControllers.delete(state.request_id);
      return emitState(options.onState, settled);
    },

    cancel(requestId: string): BrowserExtensionPendingRequestState | undefined {
      const state = active.get(requestId);
      if (state === undefined) return undefined;
      const controller = abortControllers.get(requestId);
      controller?.abort();
      const cancelled = stateWithStatus(state, "cancelled");
      active.delete(requestId);
      abortControllers.delete(requestId);
      return emitState(options.onState, cancelled);
    },

    abortSignal(state: BrowserExtensionPendingRequestState): AbortSignal | undefined {
      return abortControllers.get(state.request_id)?.signal;
    },

    active(): readonly BrowserExtensionPendingRequestState[] {
      return Object.freeze(Array.from(active.values()));
    }
  });
}
