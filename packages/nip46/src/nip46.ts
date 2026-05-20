import { compactJsonUtf8ByteLength, NSEALR_V0_LIMITS, validateRequest, validateResponse } from "@nsealr/protocol";

export type Nip46RequestMessage = {
  id: string;
  method: string;
  params: string[];
};

export type Nip46ResponseMessage = {
  id: string;
  result?: string;
  error?: string;
};

export type Nip46Permission = {
  method: string;
  parameter?: string;
  event_kind?: number;
};

export type Nip46PermissionRequirement = Nip46Permission;

export type Nip46ConnectIntent = {
  id: string;
  remote_signer_pubkey: string;
  secret?: string;
  requested_permissions: Nip46Permission[];
};

export type Nip46ConnectionUriDescriptor = {
  format: "nsealr-nip46-connection-uri-v0";
  kind: "bunker" | "nostrconnect";
  remote_signer_pubkey?: string;
  client_pubkey?: string;
  relays: string[];
  secret_present: boolean;
  requested_permissions: Nip46Permission[];
  client_metadata?: {
    name?: string;
    url?: string;
    image?: string;
  };
  starts_relay_session: false;
  creates_grants: false;
  stores_production_secrets: false;
  exposes_secret: false;
};

export type Nip46ConnectReview = {
  format: "nsealr-nip46-connect-review-v0";
  id: string;
  remote_signer_pubkey: string;
  secret_present: boolean;
  requested_permissions: Nip46Permission[];
  pages: Array<{
    title: string;
    page_indicator: string;
    body_lines: string[];
  }>;
};

export type Nip46BridgeDecision =
  | {
      type: "connect_review";
      connect_intent: Nip46ConnectIntent;
    }
  | {
      type: "local_response";
      permission_requirement: Nip46PermissionRequirement;
      response_message: Nip46ResponseMessage;
    }
  | {
      type: "signer_request";
      permission_requirement: Nip46PermissionRequirement;
      nsealr_request: NSealrBridgeRequest;
    }
  | {
      type: "permission_denied";
      permission_requirement: Nip46PermissionRequirement;
      response_message: Nip46ResponseMessage;
    };

const NIP46_PERMISSION_METHODS = new Set([
  "sign_event",
  "nip04_encrypt",
  "nip04_decrypt",
  "nip44_encrypt",
  "nip44_decrypt",
  "get_public_key",
  "ping",
  "switch_relays"
]);

const NIP46_CONNECTION_URI_PARAMS = new Set(["relay", "secret", "perms", "name", "url", "image"]);

type NSealrBridgeRequest =
  | {
      version: 1;
      request_id: string;
      method: "get_public_key";
    }
  | {
      version: 1;
      request_id: string;
      method: "sign_event";
      params: {
        event_template: unknown;
      };
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNip46Id(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value)) {
    throw new Error("NIP-46 request id is invalid");
  }
  return value;
}

function requireXOnlyPubkey(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`NIP-46 ${label} must be 32-byte lowercase hex`);
  }
  return value;
}

function requireSingleQueryParam(params: URLSearchParams, name: string): string | undefined {
  const values = params.getAll(name);
  if (values.length > 1) throw new Error(`NIP-46 connection URI ${name} must appear at most once`);
  return values[0];
}

function requireRelayUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error("NIP-46 connection URI relay must be a valid URL");
  }
  if (parsed.protocol !== "wss:" || parsed.username !== "" || parsed.password !== "" || parsed.hash !== "") {
    throw new Error("NIP-46 connection URI relay must be a wss URL without credentials or fragment");
  }
  if (parsed.hostname === "") throw new Error("NIP-46 connection URI relay host is required");
  return parsed.toString();
}

function requireOptionalHttpUrl(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error(`NIP-46 connection URI ${name} must be a valid URL`);
  }
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username !== "" || parsed.password !== "") {
    throw new Error(`NIP-46 connection URI ${name} must be an http(s) URL without credentials`);
  }
  return parsed.toString();
}

function requireMessage(value: unknown): Nip46RequestMessage {
  if (!isRecord(value)) throw new Error("NIP-46 message must be an object");
  if (compactJsonUtf8ByteLength(value) > NSEALR_V0_LIMITS.max_nip46_decrypted_message_json_bytes) {
    throw new Error("NIP-46 decrypted message JSON exceeds max_nip46_decrypted_message_json_bytes");
  }
  const id = requireNip46Id(value.id);
  if (typeof value.method !== "string" || value.method.length === 0) {
    throw new Error("NIP-46 method is required");
  }
  if (!Array.isArray(value.params) || !value.params.every((param) => typeof param === "string")) {
    throw new Error("NIP-46 params must be an array of strings");
  }
  return {
    id,
    method: value.method,
    params: value.params
  };
}

function parseJsonParam(param: string, label: string): unknown {
  try {
    return JSON.parse(param);
  } catch (error) {
    throw new Error(`NIP-46 ${label} param must be valid JSON`);
  }
}

function assertValidNSealrRequest(request: NSealrBridgeRequest): void {
  const result = validateRequest(request);
  if (!result.ok) throw new Error(result.error ?? "invalid nSealr request");
}

export function parseNip46Permissions(value: string): Nip46Permission[] {
  if (value.trim() === "") return [];
  return value.split(",").map((item) => {
    const permission = item.trim();
    if (permission.length === 0) throw new Error("NIP-46 permission entries must be non-empty");
    const [method, parameter, extra] = permission.split(":");
    if (!method || extra !== undefined) throw new Error("NIP-46 permission format is invalid");
    if (method === "connect") throw new Error("NIP-46 permissions must not request connect");
    if (!NIP46_PERMISSION_METHODS.has(method)) throw new Error(`unsupported permission method: ${method}`);
    if (method === "sign_event" && parameter !== undefined) {
      if (!/^[0-9]+$/u.test(parameter)) throw new Error("NIP-46 sign_event permission kind must be numeric");
      return {
        method,
        parameter,
        event_kind: Number(parameter)
      };
    }
    if (parameter !== undefined) {
      throw new Error(`NIP-46 permission method does not accept a parameter: ${method}`);
    }
    return { method };
  });
}

export function parseNip46ApprovedPermissions(value: string): Nip46Permission[] {
  const permissions = parseNip46Permissions(value);
  for (const permission of permissions) {
    if (permission.method === "sign_event" && permission.parameter === undefined) {
      throw new Error("approved sign_event permission must include parameter and event_kind");
    }
  }
  return permissions;
}

function parseNip46PolicyPermission(permission: unknown, context: string): Nip46Permission {
  if (!isRecord(permission) || typeof permission.method !== "string") {
    throw new Error(`${context}: permission entries must include method`);
  }
  if (!NIP46_PERMISSION_METHODS.has(permission.method)) {
    throw new Error(`${context}: permission method is invalid`);
  }
  if (permission.method === "sign_event") {
    if (permission.parameter === undefined) {
      throw new Error(`${context}: approved sign_event permission must include parameter and event_kind`);
    }
    if (
      typeof permission.parameter !== "string" ||
      !/^[0-9]+$/u.test(permission.parameter) ||
      typeof permission.event_kind !== "number" ||
      !Number.isInteger(permission.event_kind) ||
      permission.event_kind !== Number(permission.parameter)
    ) {
      throw new Error(`${context}: sign_event permission parameter must match event_kind`);
    }
    if (Object.keys(permission).some((key) => !["method", "parameter", "event_kind"].includes(key))) {
      throw new Error(`${context}: sign_event permission contains unknown fields`);
    }
    return {
      method: "sign_event",
      parameter: permission.parameter,
      event_kind: permission.event_kind
    };
  }
  if ("parameter" in permission || "event_kind" in permission || Object.keys(permission).length !== 1) {
    throw new Error(`${context}: non-sign_event permission must only include method`);
  }
  return { method: permission.method };
}

export function parseNip46PolicyFile(policy: unknown, context = "NIP-46 policy file"): Nip46Permission[] {
  if (!isRecord(policy) || policy.format !== "nsealr-nip46-policy-v0") {
    throw new Error(`${context}: must use format nsealr-nip46-policy-v0`);
  }
  if (!Array.isArray(policy.approved_permissions)) {
    throw new Error(`${context}: approved_permissions must be a list`);
  }
  return policy.approved_permissions.map((permission) => parseNip46PolicyPermission(permission, context));
}

export function parseNip46ConnectionUri(value: string): Nip46ConnectionUriDescriptor {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error("NIP-46 connection URI must be a non-empty trimmed string");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error("NIP-46 connection URI is invalid");
  }

  const kind = url.protocol === "bunker:" ? "bunker" : url.protocol === "nostrconnect:" ? "nostrconnect" : undefined;
  if (kind === undefined) throw new Error("NIP-46 connection URI scheme must be bunker or nostrconnect");
  if (url.username !== "" || url.password !== "" || url.pathname !== "" || url.hash !== "") {
    throw new Error("NIP-46 connection URI must not include credentials, path, or fragment");
  }

  for (const key of url.searchParams.keys()) {
    if (!NIP46_CONNECTION_URI_PARAMS.has(key)) {
      throw new Error(`NIP-46 connection URI unsupported query parameter: ${key}`);
    }
  }

  const relays = url.searchParams.getAll("relay").map(requireRelayUrl);
  if (relays.length === 0) throw new Error("NIP-46 connection URI requires at least one relay");
  if (new Set(relays).size !== relays.length) throw new Error("NIP-46 connection URI relays must be unique");

  const secret = requireSingleQueryParam(url.searchParams, "secret");
  const perms = requireSingleQueryParam(url.searchParams, "perms");
  const name = requireSingleQueryParam(url.searchParams, "name");
  const clientUrl = requireSingleQueryParam(url.searchParams, "url");
  const image = requireSingleQueryParam(url.searchParams, "image");

  if (kind === "bunker") {
    if (perms !== undefined || name !== undefined || clientUrl !== undefined || image !== undefined) {
      throw new Error("NIP-46 bunker URI must not include client metadata or requested permissions");
    }
    return {
      format: "nsealr-nip46-connection-uri-v0",
      kind,
      remote_signer_pubkey: requireXOnlyPubkey(url.hostname, "bunker remote-signer pubkey"),
      relays,
      secret_present: secret !== undefined && secret !== "",
      requested_permissions: [],
      starts_relay_session: false,
      creates_grants: false,
      stores_production_secrets: false,
      exposes_secret: false
    };
  }

  if (secret === undefined || secret === "") {
    throw new Error("NIP-46 nostrconnect URI requires a secret");
  }

  return {
    format: "nsealr-nip46-connection-uri-v0",
    kind,
    client_pubkey: requireXOnlyPubkey(url.hostname, "nostrconnect client pubkey"),
    relays,
    secret_present: true,
    requested_permissions: perms !== undefined ? parseNip46Permissions(perms) : [],
    ...((name !== undefined || clientUrl !== undefined || image !== undefined) && {
      client_metadata: {
        ...(name !== undefined && { name }),
        ...(clientUrl !== undefined && { url: requireOptionalHttpUrl(clientUrl, "url") }),
        ...(image !== undefined && { image: requireOptionalHttpUrl(image, "image") })
      }
    }),
    starts_relay_session: false,
    creates_grants: false,
    stores_production_secrets: false,
    exposes_secret: false
  };
}

export function parseNip46ConnectIntent(value: unknown): Nip46ConnectIntent {
  const message = requireMessage(value);
  if (message.method !== "connect") throw new Error("NIP-46 connect intent requires connect method");
  if (message.params.length < 1 || message.params.length > 3) {
    throw new Error("NIP-46 connect requires remote-signer pubkey plus optional secret and permissions");
  }
  return {
    id: message.id,
    remote_signer_pubkey: requireXOnlyPubkey(message.params[0], "connect remote-signer pubkey"),
    ...(message.params[1] !== undefined && message.params[1] !== "" ? { secret: message.params[1] } : {}),
    requested_permissions: message.params[2] !== undefined ? parseNip46Permissions(message.params[2]) : []
  };
}

export function nip46PermissionLabel(permission: Nip46PermissionRequirement): string {
  if (permission.method === "sign_event" && permission.parameter !== undefined) {
    return `sign_event:${permission.parameter}`;
  }
  return permission.method;
}

export function reviewNip46ConnectIntent(intent: Nip46ConnectIntent): Nip46ConnectReview {
  const permissionLines = intent.requested_permissions.map((permission) => nip46PermissionLabel(permission));
  return {
    format: "nsealr-nip46-connect-review-v0",
    id: intent.id,
    remote_signer_pubkey: intent.remote_signer_pubkey,
    secret_present: intent.secret !== undefined,
    requested_permissions: intent.requested_permissions,
    pages: [
      {
        title: "Connect",
        page_indicator: "Page 1/2",
        body_lines: [
          "Remote signer",
          intent.remote_signer_pubkey,
          `Secret: ${intent.secret !== undefined ? "provided" : "none"}`
        ]
      },
      {
        title: "Permissions",
        page_indicator: "Page 2/2",
        body_lines: permissionLines.length > 0 ? permissionLines : ["No permissions requested"]
      }
    ]
  };
}

export function reviewNip46ConnectMessage(value: unknown): Nip46ConnectReview {
  return reviewNip46ConnectIntent(parseNip46ConnectIntent(value));
}

export function nip46PermissionRequirementFromRequest(value: unknown): Nip46PermissionRequirement {
  const message = requireMessage(value);
  if (message.method === "connect") throw new Error("NIP-46 connect requires policy review");
  if (message.method === "ping") {
    if (message.params.length !== 0) throw new Error("NIP-46 ping params must be empty");
    return { method: "ping" };
  }
  if (message.method === "get_public_key") {
    if (message.params.length !== 0) throw new Error("NIP-46 get_public_key params must be empty");
    return { method: "get_public_key" };
  }
  if (message.method === "sign_event") {
    const request = nsealrRequestFromNip46(message);
    if (request.method !== "sign_event") throw new Error("NIP-46 sign_event permission request mismatch");
    const eventTemplate = request.params.event_template;
    if (!isRecord(eventTemplate) || typeof eventTemplate.kind !== "number") {
      throw new Error("NIP-46 sign_event event kind is invalid");
    }
    return {
      method: "sign_event",
      parameter: String(eventTemplate.kind),
      event_kind: eventTemplate.kind
    };
  }
  throw new Error(`unsupported NIP-46 method: ${message.method}`);
}

function permissionMatchesRequirement(
  grantedPermission: Nip46Permission,
  requirement: Nip46PermissionRequirement
): boolean {
  if (grantedPermission.method !== requirement.method) return false;
  if (requirement.method !== "sign_event") return grantedPermission.parameter === undefined;
  if (grantedPermission.parameter === undefined) return true;
  return grantedPermission.event_kind === requirement.event_kind;
}

export function isNip46RequestPermitted(value: unknown, grantedPermissions: readonly Nip46Permission[]): boolean {
  const requirement = nip46PermissionRequirementFromRequest(value);
  return grantedPermissions.some((permission) => permissionMatchesRequirement(permission, requirement));
}

function permissionDeniedResponse(id: string, requirement: Nip46PermissionRequirement): Nip46ResponseMessage {
  return {
    id,
    error: `permission_denied: request requires approved permission ${nip46PermissionLabel(requirement)}`
  };
}

export function decideNip46BridgeAction(
  value: unknown,
  grantedPermissions: readonly Nip46Permission[]
): Nip46BridgeDecision {
  const message = requireMessage(value);
  if (message.method === "connect") {
    return {
      type: "connect_review",
      connect_intent: parseNip46ConnectIntent(message)
    };
  }

  const requirement = nip46PermissionRequirementFromRequest(message);
  if (!grantedPermissions.some((permission) => permissionMatchesRequirement(permission, requirement))) {
    return {
      type: "permission_denied",
      permission_requirement: requirement,
      response_message: permissionDeniedResponse(message.id, requirement)
    };
  }

  if (message.method === "ping") {
    const response = respondToLocalNip46Request(message);
    if (response === undefined) throw new Error("NIP-46 ping response was not generated");
    return {
      type: "local_response",
      permission_requirement: requirement,
      response_message: response
    };
  }

  return {
    type: "signer_request",
    permission_requirement: requirement,
    nsealr_request: nsealrRequestFromNip46(message)
  };
}

export function respondToLocalNip46Request(value: unknown): Nip46ResponseMessage | undefined {
  const message = requireMessage(value);
  if (message.method !== "ping") return undefined;
  if (message.params.length !== 0) throw new Error("NIP-46 ping params must be empty");
  return {
    id: message.id,
    result: "pong"
  };
}

export function nsealrRequestFromNip46(value: unknown): NSealrBridgeRequest {
  const message = requireMessage(value);
  if (message.method === "ping") {
    throw new Error("NIP-46 ping is handled locally");
  }
  if (message.method === "connect") {
    throw new Error("NIP-46 connect requires policy review");
  }
  if (message.method === "get_public_key") {
    if (message.params.length !== 0) throw new Error("NIP-46 get_public_key params must be empty");
    const request: NSealrBridgeRequest = {
      version: 1,
      request_id: message.id,
      method: "get_public_key"
    };
    assertValidNSealrRequest(request);
    return request;
  }
  if (message.method === "sign_event") {
    if (message.params.length !== 1) throw new Error("NIP-46 sign_event requires one JSON event-template param");
    const request: NSealrBridgeRequest = {
      version: 1,
      request_id: message.id,
      method: "sign_event",
      params: {
        event_template: parseJsonParam(message.params[0], "sign_event")
      }
    };
    assertValidNSealrRequest(request);
    return request;
  }
  throw new Error(`unsupported NIP-46 method: ${message.method}`);
}

export function nip46ResponseFromNSealr(nip46RequestId: string, response: unknown): Nip46ResponseMessage {
  const id = requireNip46Id(nip46RequestId);
  const shape = validateResponse(response);
  if (!shape.ok) throw new Error(shape.error ?? "invalid nSealr response");
  if (!isRecord(response)) throw new Error("nSealr response must be an object");

  if (response.ok === false) {
    if (!isRecord(response.error)) throw new Error("nSealr error response must include error");
    return {
      id,
      error: `${response.error.code}: ${response.error.message}`
    };
  }

  if (!isRecord(response.result)) throw new Error("nSealr success response must include result");
  if ("event" in response.result) {
    return {
      id,
      result: JSON.stringify(response.result.event)
    };
  }
  if (typeof response.result.public_key === "string") {
    return {
      id,
      result: response.result.public_key
    };
  }
  throw new Error("unsupported nSealr response result for NIP-46");
}
