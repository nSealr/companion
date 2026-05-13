import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseAccountDescriptor,
  parseGrantDescriptor,
  parsePolicyProfile,
  type AccountDescriptor,
  type GrantDescriptor,
  type PolicyDecision,
  type PolicyDecisionRequest,
  type PolicyProfile
} from "@nsealr/policy";
import { REVIEW_DETAIL_BODY_LINE_STYLES } from "@nsealr/review";

export type SpecsFixtureSet = {
  key: {
    name: string;
    secret_key: string;
    public_key: string;
  };
  events: Array<{
    name: string;
    request: unknown;
    response: unknown;
    event_id: string;
    signature: string;
  }>;
  reviews: Array<{
    name: string;
    request: unknown;
    review: {
      kind: number;
      created_at: number;
      author_pubkey: string;
      content: string;
      content_utf8_bytes: number;
      tag_count: number;
      tags: string[][];
    };
  }>;
  reviewScreens: Array<{
    name: string;
    request: unknown;
    review: SpecsFixtureSet["reviews"][number]["review"];
    screen_review: {
      format: "screen-pages";
      request_id: string;
      approval_digest: string;
      pages: Array<{
        title: string;
        lines: string[];
        action: "next" | "approve_or_reject";
      }>;
    };
  }>;
  reviewDisplayFrames: Array<{
    name: string;
    format: string;
    source_review_vector: string;
    page_index: number;
    limits: {
      max_title_chars: number;
      max_body_lines: number;
      max_line_chars: number;
    };
    frame: {
      title: string;
      page_indicator: string;
      body_lines: string[];
      action_hint: string;
    };
  }>;
  reviewDetailPages: Array<{
    name: string;
    format: string;
    display_profile: string;
    source_review_vector: string;
    source_screen_review_vector?: string;
    approval_digest: string;
    limits: {
      max_title_chars: number;
      max_body_lines: number;
      max_line_chars: number;
      max_compact_body_lines: number;
      max_compact_line_chars: number;
    };
    pages: Array<{
      title: string;
      lines: string[];
      action: "next" | "approve_or_reject";
      page_indicator: string;
      body_line_styles: string[];
      logical_page_id: string;
    }>;
  }>;
  reviewTranscripts: Array<{
    name: string;
    format: string;
    source_vector: string;
    screen_review_vector: string;
    qr_envelope: string;
    request: unknown;
    approval_digest: string;
    buttons: string[];
    transcript: Array<{
      frame: {
        title: string;
        page_indicator: string;
        body_lines: string[];
        action_hint: string;
        body_line_styles?: string[];
      };
      button: string;
      decision: boolean | null;
      approved_for_signing: boolean;
    }>;
  }>;
  nip46Payloads: Array<{
    name: string;
    format: string;
    request_message: {
      id: string;
      method: string;
      params: string[];
    };
    permission_requirement?: {
      method: string;
      parameter?: string;
      event_kind?: number;
    };
    permission_checks?: Array<{
      granted_permissions: Array<{
        method: string;
        parameter?: string;
        event_kind?: number;
      }>;
      permitted: boolean;
    }>;
    bridge_decisions?: Array<{
      granted_permissions: Array<{
        method: string;
        parameter?: string;
        event_kind?: number;
      }>;
      decision: unknown;
    }>;
    nsealr_request?: unknown;
    nsealr_response?: unknown;
    response_message?: {
      id: string;
      result?: string;
      error?: string;
    };
    local_response_message?: {
      id: string;
      result?: string;
      error?: string;
    };
    connect_intent?: {
      id: string;
      remote_signer_pubkey: string;
      secret?: string;
      requested_permissions: Array<{
        method: string;
        parameter?: string;
        event_kind?: number;
      }>;
    };
    connect_review?: {
      format: "nsealr-nip46-connect-review-v0";
      id: string;
      remote_signer_pubkey: string;
      secret_present: boolean;
      requested_permissions: Array<{
        method: string;
        parameter?: string;
        event_kind?: number;
      }>;
      pages: Array<{
        title: string;
        page_indicator: string;
        body_lines: string[];
      }>;
    };
  }>;
  nip46PolicyFiles: Array<{
    name: string;
    format: string;
    approved_permissions: Array<{
      method: string;
      parameter?: string;
      event_kind?: number;
    }>;
  }>;
  accounts: AccountDescriptor[];
  policyProfiles: PolicyProfile[];
  grants: GrantDescriptor[];
  policyDecisions: Array<{
    name: string;
    format: "nsealr-policy-decision-vector-v0";
    policy_profile_id: string;
    request: PolicyDecisionRequest;
    decision: PolicyDecision;
  }>;
  featureMatrices: Array<{
    name: string;
    format: "nsealr-signer-feature-matrix-v0";
    features: Array<{
      id: string;
      contract_id: string;
      behavior: string;
    }>;
    solutions: Record<
      string,
      {
        label: string;
        repository: string;
        product_goal: string;
        features: Record<
          string,
          {
            target: string;
            current: string;
            contract_id?: string;
            notes: string;
          }
        >;
      }
    >;
  }>;
  limits: {
    format: string;
    name: string;
    limits: Record<string, number>;
    integer_policy: Record<string, unknown>;
  };
  invalidVectors: Array<{
    name: string;
    format: string;
    category: "signing-request" | "response" | "qr-envelope" | "serial-frame" | "nip46" | "nip46-policy-file";
    expected_error: string;
    request?: unknown;
    response?: unknown;
    envelope?: string;
    frame?: string;
    request_message?: unknown;
    policy_file?: unknown;
  }>;
};

const REVIEW_TRANSCRIPT_BUTTONS = new Set(["next", "scroll", "approve", "reject"]);
const REVIEW_TRANSCRIPT_BODY_LINE_STYLES = new Set<string>(REVIEW_DETAIL_BODY_LINE_STYLES);
const FEATURE_TARGETS = new Set(["required", "optional", "not_applicable", "forbidden", "research"]);
const FEATURE_CURRENT_STATUSES = new Set([
  "implemented",
  "partial",
  "planned",
  "hardware_blocked",
  "research",
  "not_applicable",
  "forbidden",
  "disabled_until_gates_pass"
]);
const FEATURE_SOLUTION_IDS = new Set([
  "raspberry_qr_vault",
  "esp32_qr_vault",
  "esp32_usb_nip46",
  "smartcard",
  "custom_hardware_wallet"
]);
const STATELESS_QR_PARITY_FEATURES = [
  "request_validation_v0",
  "nostr_event_review_universal",
  "review_detail_pages",
  "approval_digest_binding",
  "physical_approval",
  "sign_event_bip340",
  "qr_static_request",
  "qr_animated_request",
  "qr_response",
  "stateless_session_custody",
  "manual_only_policy",
  "device_display_review",
  "response_verification"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateReviewTranscriptFixture(name: string, fixture: unknown): void {
  if (!isRecord(fixture)) throw new Error(`invalid review transcript fixture ${name}: fixture must be an object`);
  if (fixture.format !== "qr-review-transcript-v0") {
    throw new Error(`invalid review transcript fixture ${name}: unsupported format`);
  }
  if (typeof fixture.qr_envelope !== "string" || !fixture.qr_envelope.startsWith("nsealr1:")) {
    throw new Error(`invalid review transcript fixture ${name}: qr_envelope must be a nsealr1 envelope`);
  }
  if (typeof fixture.approval_digest !== "string" || !/^[0-9a-f]{64}$/u.test(fixture.approval_digest)) {
    throw new Error(`invalid review transcript fixture ${name}: approval_digest must be 32-byte lowercase hex`);
  }
  if (!Array.isArray(fixture.buttons) || fixture.buttons.length === 0) {
    throw new Error(`invalid review transcript fixture ${name}: buttons must be a non-empty array`);
  }
  if (!Array.isArray(fixture.transcript) || fixture.transcript.length !== fixture.buttons.length) {
    throw new Error(`invalid review transcript fixture ${name}: transcript length must match buttons`);
  }
  for (const [index, step] of fixture.transcript.entries()) {
    if (!isRecord(step)) throw new Error(`invalid review transcript fixture ${name}: step ${index} must be an object`);
    const button = fixture.buttons[index];
    if (!REVIEW_TRANSCRIPT_BUTTONS.has(String(button))) {
      throw new Error(`invalid review transcript fixture ${name}: unsupported button at step ${index}`);
    }
    if (step.button !== button) {
      throw new Error(`invalid review transcript fixture ${name}: button mismatch at step ${index}`);
    }
    if (step.decision !== null && typeof step.decision !== "boolean") {
      throw new Error(`invalid review transcript fixture ${name}: decision must be boolean or null at step ${index}`);
    }
    if (typeof step.approved_for_signing !== "boolean") {
      throw new Error(`invalid review transcript fixture ${name}: approval state must be boolean at step ${index}`);
    }
    if (!isRecord(step.frame) || typeof step.frame.title !== "string") {
      throw new Error(`invalid review transcript fixture ${name}: frame must include title at step ${index}`);
    }
    if (!Array.isArray(step.frame.body_lines) || !step.frame.body_lines.every((line) => typeof line === "string")) {
      throw new Error(`invalid review transcript fixture ${name}: frame body_lines must be strings at step ${index}`);
    }
    const bodyLineStyles = step.frame.body_line_styles;
    if (bodyLineStyles !== undefined) {
      if (
        !Array.isArray(bodyLineStyles) ||
        bodyLineStyles.length !== step.frame.body_lines.length ||
        !bodyLineStyles.every((style) => REVIEW_TRANSCRIPT_BODY_LINE_STYLES.has(String(style)))
      ) {
        throw new Error(`invalid review transcript fixture ${name}: frame body_line_styles mismatch at step ${index}`);
      }
    }
  }
}

export function validateFeatureMatrixFixture(name: string, fixture: unknown): void {
  if (!isRecord(fixture)) throw new Error(`invalid feature matrix ${name}: fixture must be an object`);
  if (fixture.format !== "nsealr-signer-feature-matrix-v0") {
    throw new Error(`invalid feature matrix ${name}: unsupported format`);
  }
  if (fixture.name !== name) throw new Error(`invalid feature matrix ${name}: name mismatch`);
  if (!Array.isArray(fixture.features)) throw new Error(`invalid feature matrix ${name}: features must be an array`);

  const canonicalContracts = new Map<string, string>();
  for (const [index, feature] of fixture.features.entries()) {
    if (!isRecord(feature)) throw new Error(`invalid feature matrix ${name}: feature ${index} must be an object`);
    if (typeof feature.id !== "string" || feature.id.length === 0) {
      throw new Error(`invalid feature matrix ${name}: feature ${index} id must be a string`);
    }
    if (typeof feature.contract_id !== "string" || feature.contract_id.length === 0) {
      throw new Error(`invalid feature matrix ${name}: feature ${feature.id} contract_id must be a string`);
    }
    if (typeof feature.behavior !== "string" || feature.behavior.length === 0) {
      throw new Error(`invalid feature matrix ${name}: feature ${feature.id} behavior must be a string`);
    }
    canonicalContracts.set(feature.id, feature.contract_id);
  }

  if (!isRecord(fixture.solutions)) throw new Error(`invalid feature matrix ${name}: solutions must be an object`);
  const solutionIds = Object.keys(fixture.solutions).sort();
  const expectedSolutionIds = [...FEATURE_SOLUTION_IDS].sort();
  if (JSON.stringify(solutionIds) !== JSON.stringify(expectedSolutionIds)) {
    throw new Error(`invalid feature matrix ${name}: signer family drift`);
  }

  const activeContracts = new Map<string, string>();
  const statelessQrTargetsBySolution = new Map<string, Record<string, string | undefined>>();
  for (const solutionId of solutionIds) {
    const solution = fixture.solutions[solutionId];
    if (!isRecord(solution)) throw new Error(`invalid feature matrix ${name}: solution ${solutionId} must be an object`);
    if (typeof solution.label !== "string" || solution.label.length === 0) {
      throw new Error(`invalid feature matrix ${name}: solution ${solutionId} label must be a string`);
    }
    if (typeof solution.repository !== "string" || solution.repository.length === 0) {
      throw new Error(`invalid feature matrix ${name}: solution ${solutionId} repository must be a string`);
    }
    if (typeof solution.product_goal !== "string" || solution.product_goal.length === 0) {
      throw new Error(`invalid feature matrix ${name}: solution ${solutionId} product_goal must be a string`);
    }
    if (!isRecord(solution.features)) {
      throw new Error(`invalid feature matrix ${name}: solution ${solutionId} features must be an object`);
    }
    const featureIds = Object.keys(solution.features).sort();
    const expectedFeatureIds = [...canonicalContracts.keys()].sort();
    if (JSON.stringify(featureIds) !== JSON.stringify(expectedFeatureIds)) {
      throw new Error(`invalid feature matrix ${name}: solution ${solutionId} feature set drift`);
    }
    const currentQrTargets: Record<string, string | undefined> = {};
    for (const featureId of featureIds) {
      const feature = solution.features[featureId];
      if (!isRecord(feature)) {
        throw new Error(`invalid feature matrix ${name}: solution ${solutionId} feature ${featureId} must be an object`);
      }
      if (!FEATURE_TARGETS.has(String(feature.target))) {
        throw new Error(`invalid feature matrix ${name}: solution ${solutionId} feature ${featureId} target is unknown`);
      }
      if (!FEATURE_CURRENT_STATUSES.has(String(feature.current))) {
        throw new Error(`invalid feature matrix ${name}: solution ${solutionId} feature ${featureId} current status is unknown`);
      }
      if (typeof feature.notes !== "string" || feature.notes.length === 0) {
        throw new Error(`invalid feature matrix ${name}: solution ${solutionId} feature ${featureId} notes must be a string`);
      }

      const activeTarget = feature.target === "required" || feature.target === "optional" || feature.target === "research";
      if (activeTarget) {
        if (typeof feature.contract_id !== "string" || feature.contract_id.length === 0) {
          throw new Error(`invalid feature matrix ${name}: solution ${solutionId} feature ${featureId} missing contract_id`);
        }
        if (feature.contract_id !== canonicalContracts.get(featureId)) {
          throw new Error(`invalid feature matrix ${name}: shared feature contract drift for ${featureId}`);
        }
        const previous = activeContracts.get(featureId);
        if (previous !== undefined && previous !== feature.contract_id) {
          throw new Error(`invalid feature matrix ${name}: shared feature contract drift for ${featureId}`);
        }
        activeContracts.set(featureId, feature.contract_id);
      } else if ("contract_id" in feature) {
        throw new Error(`invalid feature matrix ${name}: inactive feature ${featureId} must not set contract_id`);
      }

      if (STATELESS_QR_PARITY_FEATURES.includes(featureId)) {
        currentQrTargets[featureId] = String(feature.target);
      }
    }
    if (solutionId === "raspberry_qr_vault" || solutionId === "esp32_qr_vault") {
      statelessQrTargetsBySolution.set(solutionId, currentQrTargets);
    }
  }
  const raspberryQrTargets = statelessQrTargetsBySolution.get("raspberry_qr_vault");
  const esp32QrTargets = statelessQrTargetsBySolution.get("esp32_qr_vault");
  if (JSON.stringify(raspberryQrTargets) !== JSON.stringify(esp32QrTargets)) {
    throw new Error(`invalid feature matrix ${name}: stateless QR vault target drift`);
  }
}

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fileStem(file: string): string {
  return file.replace(/\.json$/, "");
}

export function loadSpecsFixtures(specsRoot: string): SpecsFixtureSet {
  const eventsRoot = resolve(specsRoot, "vectors/events");
  const reviewsRoot = resolve(specsRoot, "vectors/review");
  const reviewScreensRoot = resolve(specsRoot, "vectors/review-screens");
  const reviewDisplayFramesRoot = resolve(specsRoot, "vectors/review-display-frames");
  const reviewDetailPagesRoot = resolve(specsRoot, "vectors/review-detail-pages");
  const reviewTranscriptsRoot = resolve(specsRoot, "vectors/review-transcripts");
  const nip46Root = resolve(specsRoot, "vectors/nip46");
  const nip46PolicyFilesRoot = resolve(specsRoot, "vectors/nip46-policy-files");
  const accountsRoot = resolve(specsRoot, "vectors/accounts");
  const policyProfilesRoot = resolve(specsRoot, "vectors/policies");
  const grantsRoot = resolve(specsRoot, "vectors/grants");
  const policyDecisionsRoot = resolve(specsRoot, "vectors/policy-decisions");
  const featureMatricesRoot = resolve(specsRoot, "vectors/features");
  const invalidVectorsRoot = resolve(specsRoot, "vectors/invalid");
  const eventFiles = readdirSync(eventsRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const reviewFiles = readdirSync(reviewsRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const reviewScreenFiles = readdirSync(reviewScreensRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const reviewDisplayFrameFiles = readdirSync(reviewDisplayFramesRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const reviewDetailPageFiles = readdirSync(reviewDetailPagesRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const reviewTranscriptFiles = readdirSync(reviewTranscriptsRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const nip46Files = readdirSync(nip46Root)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const nip46PolicyFiles = readdirSync(nip46PolicyFilesRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const accountFiles = readdirSync(accountsRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const policyProfileFiles = readdirSync(policyProfilesRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const grantFiles = readdirSync(grantsRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const policyDecisionFiles = readdirSync(policyDecisionsRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const featureMatrixFiles = readdirSync(featureMatricesRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const invalidVectorFiles = readdirSync(invalidVectorsRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  return {
    key: loadJson(resolve(specsRoot, "vectors/keys/test-key-1.json")) as SpecsFixtureSet["key"],
    limits: loadJson(resolve(specsRoot, "vectors/limits/nsealr-v0.json")) as SpecsFixtureSet["limits"],
    events: eventFiles.map((file) => loadJson(resolve(eventsRoot, file)) as SpecsFixtureSet["events"][number]),
    reviews: reviewFiles.map((file) => loadJson(resolve(reviewsRoot, file)) as SpecsFixtureSet["reviews"][number]),
    reviewScreens: reviewScreenFiles.map(
      (file) => loadJson(resolve(reviewScreensRoot, file)) as SpecsFixtureSet["reviewScreens"][number]
    ),
    reviewDisplayFrames: reviewDisplayFrameFiles.map(
      (file) => loadJson(resolve(reviewDisplayFramesRoot, file)) as SpecsFixtureSet["reviewDisplayFrames"][number]
    ),
    reviewDetailPages: reviewDetailPageFiles.map(
      (file) => loadJson(resolve(reviewDetailPagesRoot, file)) as SpecsFixtureSet["reviewDetailPages"][number]
    ),
    reviewTranscripts: reviewTranscriptFiles.map(
      (file) => loadJson(resolve(reviewTranscriptsRoot, file)) as SpecsFixtureSet["reviewTranscripts"][number]
    ),
    nip46Payloads: nip46Files.map(
      (file) => loadJson(resolve(nip46Root, file)) as SpecsFixtureSet["nip46Payloads"][number]
    ),
    nip46PolicyFiles: nip46PolicyFiles.map(
      (file) =>
        ({
          ...(loadJson(resolve(nip46PolicyFilesRoot, file)) as Record<string, unknown>),
          name: fileStem(file)
        }) as SpecsFixtureSet["nip46PolicyFiles"][number]
    ),
    accounts: accountFiles.map((file) => parseAccountDescriptor(loadJson(resolve(accountsRoot, file)))),
    policyProfiles: policyProfileFiles.map((file) => parsePolicyProfile(loadJson(resolve(policyProfilesRoot, file)))),
    grants: grantFiles.map((file) => parseGrantDescriptor(loadJson(resolve(grantsRoot, file)))),
    policyDecisions: policyDecisionFiles.map(
      (file) => loadJson(resolve(policyDecisionsRoot, file)) as SpecsFixtureSet["policyDecisions"][number]
    ),
    featureMatrices: featureMatrixFiles.map(
      (file) => loadJson(resolve(featureMatricesRoot, file)) as SpecsFixtureSet["featureMatrices"][number]
    ),
    invalidVectors: invalidVectorFiles.map(
      (file) => loadJson(resolve(invalidVectorsRoot, file)) as SpecsFixtureSet["invalidVectors"][number]
    )
  };
}
