export type RouteType =
  | "raspberry_qr_vault"
  | "esp32_qr_vault"
  | "esp32_usb_nip46"
  | "smartcard"
  | "custom_hardware_wallet"
  | "external_nip46";

export type RouteCustody =
  | "stateless_session"
  | "device_persistent"
  | "card_persistent"
  | "custom_hardware_persistent"
  | "external_signer";

export type SignerRoute = {
  type: RouteType;
  repository?: "raspberry" | "esp32" | "smartcard" | "hardware";
  transport: "qr" | "usb" | "smartcard" | "nfc" | "nip46_relay" | "embedded";
  custody: RouteCustody;
  trusted_review: "device_display" | "external_review" | "external_policy" | "display_less";
  policy_support: "manual_only" | "scoped_automation" | "external";
};

export type AccountDescriptor = {
  format: "nsealr-account-descriptor-v0";
  account_id: string;
  label: string;
  public_key: string;
  signer_route: SignerRoute;
  recovery: Record<string, unknown>;
  capabilities: {
    methods: string[];
    physical_review: boolean;
    physical_approval: boolean;
    persistent_grants: boolean;
  };
  policy_profile_id: string;
};

export type PolicyProfile = {
  format: "nsealr-policy-profile-v0";
  policy_id: string;
  label: string;
  route_types: RouteType[];
  mode: "manual_only" | "scoped_automation";
  grants_allowed: boolean;
  manual_review_required: string[];
  forbidden_permissions: string[];
  grant_constraints?: Record<string, unknown>;
  risk_tiers: Record<string, string>;
};

export type GrantPermission = {
  method: string;
  parameter?: string;
  event_kind?: number;
};

export type GrantDescriptor = {
  format: "nsealr-grant-descriptor-v0";
  grant_id: string;
  account_id: string;
  route_type: RouteType;
  client: {
    pubkey: string;
    label?: string;
  };
  permission: GrantPermission;
  decision: "allow_once" | "allow_until_expiry";
  expires_at: number;
  rate_limit: {
    max_uses: number;
    window_seconds: number;
  };
  requires_device_policy_confirmation: true;
  revocable: true;
  audit_event_format: "nsealr-grant-audit-event-v0";
};

export type PolicyDecisionRequest = {
  account_id: string;
  route_type: RouteType;
  client_pubkey: string;
  permission: GrantPermission;
  now: number;
  grant_ids: string[];
  revoked_grant_ids: string[];
};

export type PolicyDecision = {
  format: "nsealr-policy-decision-v0";
  decision: "allow" | "deny" | "manual_review";
  reason:
    | "decrypt_requires_manual_review"
    | "forbidden_permission"
    | "grant_expired"
    | "grant_revoked"
    | "grant_valid"
    | "no_matching_grant"
    | "policy_manual_only"
    | "unknown_method_requires_manual_review";
  grant_id?: string;
  audit_event: {
    format: "nsealr-grant-audit-event-v0";
    occurred_at: number;
    account_id: string;
    route_type: RouteType;
    client_pubkey: string;
    permission: GrantPermission;
    decision: PolicyDecision["decision"];
    reason: PolicyDecision["reason"];
    grant_id?: string;
  };
};

const ROUTE_TYPES = new Set<RouteType>([
  "raspberry_qr_vault",
  "esp32_qr_vault",
  "esp32_usb_nip46",
  "smartcard",
  "custom_hardware_wallet",
  "external_nip46"
]);
const QR_ROUTE_TYPES = new Set<RouteType>(["raspberry_qr_vault", "esp32_qr_vault"]);
const ROUTE_REPOSITORIES = new Map<RouteType, string>([
  ["raspberry_qr_vault", "raspberry"],
  ["esp32_qr_vault", "esp32"],
  ["esp32_usb_nip46", "esp32"],
  ["smartcard", "smartcard"],
  ["custom_hardware_wallet", "hardware"]
]);
const ROUTE_TRANSPORTS = new Set(["qr", "usb", "smartcard", "nfc", "nip46_relay", "embedded"]);
const CUSTODY_MODES = new Set([
  "stateless_session",
  "device_persistent",
  "card_persistent",
  "custom_hardware_persistent",
  "external_signer"
]);
const REVIEW_MODES = new Set(["device_display", "external_review", "external_policy", "display_less"]);
const POLICY_SUPPORT_MODES = new Set(["manual_only", "scoped_automation", "external"]);
const DEVICE_METHODS = new Set(["get_capabilities", "get_signing_status", "get_public_key", "sign_event"]);
const DECRYPT_METHODS = new Set(["nip04_decrypt", "nip44_decrypt"]);
const SECRET_FIELD_NAMES = new Set([
  "secret_key",
  "private_key",
  "nsec",
  "mnemonic",
  "seed",
  "passphrase",
  "nip49_ciphertext"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
}

function secretFieldPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => secretFieldPaths(item, prefix ? `${prefix}[${index}]` : `[${index}]`));
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const nested = secretFieldPaths(child, path);
    return SECRET_FIELD_NAMES.has(key.toLowerCase()) ? [path, ...nested] : nested;
  });
}

function rejectSecretFields(value: unknown): void {
  const secretPath = secretFieldPaths(value)[0];
  if (secretPath !== undefined) throw new Error(`descriptor must not contain secret field ${secretPath}`);
}

function requireStringId(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value)) {
    throw new Error(`${field} must be a stable string id`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function requireXOnlyPubkey(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${field} must be 32-byte lowercase hex`);
  }
  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} must be boolean`);
  return value;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requireRouteType(value: unknown, field = "route_type"): RouteType {
  if (typeof value !== "string" || !ROUTE_TYPES.has(value as RouteType)) {
    throw new Error(`${field} is unknown`);
  }
  return value as RouteType;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.length > 0)) {
    throw new Error(`${field} must be an array of strings`);
  }
  return value;
}

function parseSignerRoute(value: unknown): SignerRoute {
  assertRecord(value, "signer_route");
  const type = requireRouteType(value.type, "signer_route.type");
  const expectedRepository = ROUTE_REPOSITORIES.get(type);
  if (expectedRepository !== undefined && value.repository !== expectedRepository) {
    throw new Error(`signer_route.repository must be ${expectedRepository}`);
  }
  if (expectedRepository === undefined && "repository" in value) {
    throw new Error("external signer routes must not claim a nSealr repository");
  }
  const transport = requireString(value.transport, "signer_route.transport");
  if (!ROUTE_TRANSPORTS.has(transport)) throw new Error("signer_route.transport is unknown");
  const custody = requireString(value.custody, "signer_route.custody");
  if (!CUSTODY_MODES.has(custody)) throw new Error("signer_route.custody is unknown");
  const trustedReview = requireString(value.trusted_review, "signer_route.trusted_review");
  if (!REVIEW_MODES.has(trustedReview)) throw new Error("signer_route.trusted_review is unknown");
  const policySupport = requireString(value.policy_support, "signer_route.policy_support");
  if (!POLICY_SUPPORT_MODES.has(policySupport)) throw new Error("signer_route.policy_support is unknown");
  return {
    type,
    ...(typeof value.repository === "string" ? { repository: value.repository as SignerRoute["repository"] } : {}),
    transport: transport as SignerRoute["transport"],
    custody: custody as SignerRoute["custody"],
    trusted_review: trustedReview as SignerRoute["trusted_review"],
    policy_support: policySupport as SignerRoute["policy_support"]
  };
}

function validateRecovery(recovery: unknown): Record<string, unknown> {
  assertRecord(recovery, "recovery");
  if (recovery.type === "nip06") {
    if (typeof recovery.path !== "string" || !recovery.path.startsWith("m/44'/1237'/")) {
      throw new Error("NIP-06 recovery path must use the Nostr derivation prefix");
    }
    if (typeof recovery.account !== "number" || !Number.isInteger(recovery.account) || recovery.account < 0) {
      throw new Error("NIP-06 recovery account must be a non-negative integer");
    }
    requireString(recovery.source_vector, "NIP-06 recovery source_vector");
    return recovery;
  }
  if (recovery.type === "device_slot") {
    requireString(recovery.slot_id, "device_slot recovery slot_id");
    requireBoolean(recovery.backup_required, "device_slot recovery backup_required");
    return recovery;
  }
  if (recovery.type === "external_signer") {
    requireString(recovery.external_signer_id, "external_signer recovery external_signer_id");
    return recovery;
  }
  throw new Error("recovery.type is unknown");
}

export function parseAccountDescriptor(value: unknown): AccountDescriptor {
  rejectSecretFields(value);
  assertRecord(value, "account descriptor");
  if (value.format !== "nsealr-account-descriptor-v0") throw new Error("account descriptor format mismatch");
  const route = parseSignerRoute(value.signer_route);
  assertRecord(value.capabilities, "capabilities");
  const methods = requireStringArray(value.capabilities.methods, "capabilities.methods");
  const unknownMethod = methods.find((method) => !DEVICE_METHODS.has(method));
  if (unknownMethod !== undefined) throw new Error(`capabilities.methods contains unknown method ${unknownMethod}`);
  const descriptor: AccountDescriptor = {
    format: "nsealr-account-descriptor-v0",
    account_id: requireStringId(value.account_id, "account_id"),
    label: requireString(value.label, "label"),
    public_key: requireXOnlyPubkey(value.public_key, "public_key"),
    signer_route: route,
    recovery: validateRecovery(value.recovery),
    capabilities: {
      methods,
      physical_review: requireBoolean(value.capabilities.physical_review, "capabilities.physical_review"),
      physical_approval: requireBoolean(value.capabilities.physical_approval, "capabilities.physical_approval"),
      persistent_grants: requireBoolean(value.capabilities.persistent_grants, "capabilities.persistent_grants")
    },
    policy_profile_id: requireString(value.policy_profile_id, "policy_profile_id")
  };
  if (!descriptor.policy_profile_id.startsWith("policy-")) {
    throw new Error("policy_profile_id must reference a policy-* profile");
  }
  if (QR_ROUTE_TYPES.has(route.type)) {
    if (JSON.stringify(value).toLowerCase().includes("tropic01")) {
      throw new Error("stateless QR vault descriptors must not reference TROPIC01");
    }
    if (route.transport !== "qr") throw new Error("stateless QR vault routes must use qr transport");
    if (route.custody !== "stateless_session") {
      throw new Error("stateless QR vault routes must use stateless_session custody");
    }
    if (route.policy_support !== "manual_only") {
      throw new Error("stateless QR vault routes must use manual_only policy support");
    }
    if (descriptor.capabilities.persistent_grants !== false) {
      throw new Error("stateless QR vault routes must not support persistent grants");
    }
  }
  return descriptor;
}

export function parsePolicyProfile(value: unknown): PolicyProfile {
  rejectSecretFields(value);
  assertRecord(value, "policy profile");
  if (value.format !== "nsealr-policy-profile-v0") throw new Error("policy profile format mismatch");
  const routeTypes = requireStringArray(value.route_types, "route_types").map((route) => requireRouteType(route));
  const mode = requireString(value.mode, "mode");
  if (mode !== "manual_only" && mode !== "scoped_automation") throw new Error("mode is unknown");
  const grantsAllowed = requireBoolean(value.grants_allowed, "grants_allowed");
  const forbiddenPermissions = requireStringArray(value.forbidden_permissions, "forbidden_permissions");
  if (!forbiddenPermissions.includes("wildcard")) throw new Error("forbidden_permissions must include wildcard");
  if (!forbiddenPermissions.includes("export_secret")) throw new Error("forbidden_permissions must include export_secret");
  if (routeTypes.some((route) => QR_ROUTE_TYPES.has(route)) && (mode !== "manual_only" || grantsAllowed !== false)) {
    throw new Error("QR vault routes must remain manual_only with grants_allowed false");
  }
  if (mode === "manual_only" && grantsAllowed) throw new Error("manual_only profiles must not allow grants");
  if (grantsAllowed) {
    assertRecord(value.grant_constraints, "grant_constraints");
    for (const field of [
      "expiry_required",
      "rate_limit_required",
      "revocation_required",
      "audit_log_required",
      "device_confirmation_required"
    ]) {
      if (value.grant_constraints[field] !== true) throw new Error(`grant_constraints.${field} must be true`);
    }
  }
  assertRecord(value.risk_tiers, "risk_tiers");
  for (const [riskName, riskTier] of Object.entries(value.risk_tiers)) {
    if (typeof riskTier !== "string" || riskTier.length === 0) {
      throw new Error(`risk_tiers.${riskName} must be a non-empty string`);
    }
  }
  const policyId = requireString(value.policy_id, "policy_id");
  if (!policyId.startsWith("policy-")) throw new Error("policy_id must start with policy-");
  return {
    format: "nsealr-policy-profile-v0",
    policy_id: policyId,
    label: requireString(value.label, "label"),
    route_types: routeTypes,
    mode,
    grants_allowed: grantsAllowed,
    manual_review_required: requireStringArray(value.manual_review_required, "manual_review_required"),
    forbidden_permissions: forbiddenPermissions,
    ...(value.grant_constraints !== undefined ? { grant_constraints: value.grant_constraints as Record<string, unknown> } : {}),
    risk_tiers: value.risk_tiers as Record<string, string>
  };
}

function parseGrantPermission(value: unknown): GrantPermission {
  assertRecord(value, "permission");
  if (value.method === "*" || value.parameter === "*") throw new Error("grant permission must not use wildcard values");
  const method = requireString(value.method, "permission.method");
  if (method === "export_secret") throw new Error("grant permission must not request secret export");
  if (DECRYPT_METHODS.has(method)) throw new Error("decrypt grant permissions require manual review");
  if (method === "sign_event") {
    if (typeof value.parameter !== "string" || !/^[0-9]+$/u.test(value.parameter)) {
      throw new Error("sign_event permission.parameter must be a decimal event kind");
    }
    if (typeof value.event_kind !== "number" || !Number.isInteger(value.event_kind) || value.event_kind < 0) {
      throw new Error("sign_event permission.event_kind must be a non-negative integer");
    }
    if (Number(value.parameter) !== value.event_kind) {
      throw new Error("sign_event permission parameter/event_kind mismatch");
    }
    return { method, parameter: value.parameter, event_kind: value.event_kind };
  }
  if ("parameter" in value || "event_kind" in value) {
    throw new Error("non-sign_event grant permissions must not include parameters");
  }
  return { method };
}

export function parseGrantDescriptor(value: unknown): GrantDescriptor {
  rejectSecretFields(value);
  assertRecord(value, "grant descriptor");
  if (value.format !== "nsealr-grant-descriptor-v0") throw new Error("grant descriptor format mismatch");
  const routeType = requireRouteType(value.route_type);
  if (QR_ROUTE_TYPES.has(routeType)) throw new Error("grant route_type must not be a stateless QR vault");
  assertRecord(value.client, "client");
  assertRecord(value.rate_limit, "rate_limit");
  if (value.requires_device_policy_confirmation !== true) {
    throw new Error("requires_device_policy_confirmation must be true");
  }
  if (value.revocable !== true) throw new Error("revocable must be true");
  if (value.audit_event_format !== "nsealr-grant-audit-event-v0") throw new Error("audit_event_format mismatch");
  const decision = requireString(value.decision, "decision");
  if (decision !== "allow_once" && decision !== "allow_until_expiry") throw new Error("decision is unknown");
  return {
    format: "nsealr-grant-descriptor-v0",
    grant_id: requireStringId(value.grant_id, "grant_id"),
    account_id: requireStringId(value.account_id, "account_id"),
    route_type: routeType,
    client: {
      pubkey: requireXOnlyPubkey(value.client.pubkey, "client.pubkey"),
      ...(typeof value.client.label === "string" ? { label: value.client.label } : {})
    },
    permission: parseGrantPermission(value.permission),
    decision,
    expires_at: requirePositiveInteger(value.expires_at, "expires_at"),
    rate_limit: {
      max_uses: requirePositiveInteger(value.rate_limit.max_uses, "rate_limit.max_uses"),
      window_seconds: requirePositiveInteger(value.rate_limit.window_seconds, "rate_limit.window_seconds")
    },
    requires_device_policy_confirmation: true,
    revocable: true,
    audit_event_format: "nsealr-grant-audit-event-v0"
  };
}

function permissionsMatch(grantPermission: GrantPermission, requestPermission: GrantPermission): boolean {
  if (grantPermission.method !== requestPermission.method) return false;
  if (grantPermission.method === "sign_event") {
    return grantPermission.parameter === requestPermission.parameter && grantPermission.event_kind === requestPermission.event_kind;
  }
  return grantPermission.parameter === undefined && grantPermission.event_kind === undefined;
}

function buildPolicyDecision(
  request: PolicyDecisionRequest,
  decision: PolicyDecision["decision"],
  reason: PolicyDecision["reason"],
  grantId?: string
): PolicyDecision {
  return {
    format: "nsealr-policy-decision-v0",
    decision,
    reason,
    ...(grantId !== undefined ? { grant_id: grantId } : {}),
    audit_event: {
      format: "nsealr-grant-audit-event-v0",
      occurred_at: request.now,
      account_id: request.account_id,
      route_type: request.route_type,
      client_pubkey: request.client_pubkey,
      permission: request.permission,
      decision,
      reason,
      ...(grantId !== undefined ? { grant_id: grantId } : {})
    }
  };
}

export function decidePolicyRequest(input: {
  policy: PolicyProfile;
  grants: GrantDescriptor[];
  request: PolicyDecisionRequest;
}): PolicyDecision {
  const { policy, grants, request } = input;
  const method = request.permission.method;
  if (policy.forbidden_permissions.includes(method) || method === "export_secret") {
    return buildPolicyDecision(request, "deny", "forbidden_permission");
  }
  if (DECRYPT_METHODS.has(method)) {
    return buildPolicyDecision(request, "manual_review", "decrypt_requires_manual_review");
  }
  if (method === "unknown_method") {
    return buildPolicyDecision(request, "manual_review", "unknown_method_requires_manual_review");
  }
  if (!policy.grants_allowed) {
    return buildPolicyDecision(request, "manual_review", "policy_manual_only");
  }

  const revokedGrantIds = new Set(request.revoked_grant_ids);
  for (const grantId of request.grant_ids) {
    const grant = grants.find((candidate) => candidate.grant_id === grantId);
    if (grant === undefined) continue;
    if (grant.account_id !== request.account_id) continue;
    if (grant.route_type !== request.route_type) continue;
    if (grant.client.pubkey !== request.client_pubkey) continue;
    if (!permissionsMatch(grant.permission, request.permission)) continue;
    if (revokedGrantIds.has(grant.grant_id)) {
      return buildPolicyDecision(request, "deny", "grant_revoked", grant.grant_id);
    }
    if (request.now >= grant.expires_at) {
      return buildPolicyDecision(request, "deny", "grant_expired", grant.grant_id);
    }
    return buildPolicyDecision(request, "allow", "grant_valid", grant.grant_id);
  }

  return buildPolicyDecision(request, "manual_review", "no_matching_grant");
}
