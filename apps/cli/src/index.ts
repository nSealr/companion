#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import { SerialPort } from "serialport";
import { reviewPairingIntent } from "@nsealr/client";
import { verifySignedEventResponse, type SignEventRequest } from "@nsealr/core";
import { devSignRequest } from "@nsealr/dev-signer";
import {
  loadSpecsFixtures,
  validateFeatureMatrixFixture,
  validateReviewTranscriptFixture
} from "@nsealr/fixtures";
import { decodeSerialFrame, encodeSerialFrame } from "@nsealr/framing";
import {
  decideNip46BridgeAction,
  isNip46RequestPermitted,
  nip46PermissionRequirementFromRequest,
  nip46ResponseFromNSealr,
  nsealrRequestFromNip46,
  parseNip46ConnectIntent,
  parseNip46PolicyFile,
  parseNip46Permissions,
  reviewNip46ConnectMessage,
  type Nip46Permission,
  respondToLocalNip46Request
} from "@nsealr/nip46";
import { decidePolicyRequest, selectAccountRoute } from "@nsealr/policy";
import { validateRequest, validateResponse } from "@nsealr/protocol";
import {
  decodeAnimatedQrEnvelopeFrames,
  decodeQrEnvelope,
  encodeAnimatedQrEnvelopeFrames,
  encodeQrEnvelope
} from "@nsealr/qr";
import {
  REVIEW_DETAIL_BODY_LINE_STYLES as REVIEW_DETAIL_BODY_LINE_STYLE_VALUES,
  renderReviewDetailPages,
  reviewEventTemplate,
  screenReviewForRequest,
  type ReviewDetailPageLimits
} from "@nsealr/review";
import { SmartcardSigner, SmartcardSimulator } from "@nsealr/smartcard";
import {
  SerialLineStreamPort,
  exchangeSerialLineRequest,
  type SerialLinePort,
  type SerialLinePortOpener
} from "@nsealr/transport";

type DataFormat = "json" | "qr" | "qr-animated";

type BuildCliOptions = {
  openSerialLinePort?: SerialLinePortOpener;
};

const DEFAULT_REVIEW_DETAIL_PAGE_LIMITS: ReviewDetailPageLimits = {
  max_title_chars: 18,
  max_body_lines: 5,
  max_line_chars: 26,
  max_compact_body_lines: 9,
  max_compact_line_chars: 48
};
const REVIEW_DETAIL_BODY_LINE_STYLES = new Set<string>(REVIEW_DETAIL_BODY_LINE_STYLE_VALUES);

const PARAMETERLESS_REQUEST_METHODS: Record<string, { protocolMethod: string; defaultRequestId: string }> = {
  capabilities: { protocolMethod: "get_capabilities", defaultRequestId: "req-capabilities-1" },
  "get-capabilities": { protocolMethod: "get_capabilities", defaultRequestId: "req-capabilities-1" },
  pubkey: { protocolMethod: "get_public_key", defaultRequestId: "req-pubkey-1" },
  "get-public-key": { protocolMethod: "get_public_key", defaultRequestId: "req-public-key-1" },
  "signing-status": { protocolMethod: "get_signing_status", defaultRequestId: "req-signing-status-1" },
  "get-signing-status": { protocolMethod: "get_signing_status", defaultRequestId: "req-signing-status-1" }
};

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertFormat(format: string): asserts format is DataFormat {
  if (format !== "json" && format !== "qr" && format !== "qr-animated") {
    throw new Error(`unsupported format: ${format}`);
  }
}

function optionalAuthorPubkey(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("author pubkey must be 32-byte lowercase hex");
  }
  return value;
}

function positiveIntegerOption(value: string | undefined, fallback: number, optionName: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer`);
  }
  return parsed;
}

function reviewDetailPageLimitsFromOptions(options: {
  maxTitleChars?: string;
  maxBodyLines?: string;
  maxLineChars?: string;
  maxCompactBodyLines?: string;
  maxCompactLineChars?: string;
}): ReviewDetailPageLimits {
  return {
    max_title_chars: positiveIntegerOption(
      options.maxTitleChars,
      DEFAULT_REVIEW_DETAIL_PAGE_LIMITS.max_title_chars,
      "--max-title-chars"
    ),
    max_body_lines: positiveIntegerOption(
      options.maxBodyLines,
      DEFAULT_REVIEW_DETAIL_PAGE_LIMITS.max_body_lines,
      "--max-body-lines"
    ),
    max_line_chars: positiveIntegerOption(
      options.maxLineChars,
      DEFAULT_REVIEW_DETAIL_PAGE_LIMITS.max_line_chars,
      "--max-line-chars"
    ),
    max_compact_body_lines: positiveIntegerOption(
      options.maxCompactBodyLines,
      DEFAULT_REVIEW_DETAIL_PAGE_LIMITS.max_compact_body_lines,
      "--max-compact-body-lines"
    ),
    max_compact_line_chars: positiveIntegerOption(
      options.maxCompactLineChars,
      DEFAULT_REVIEW_DETAIL_PAGE_LIMITS.max_compact_line_chars,
      "--max-compact-line-chars"
    )
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNip46PolicyPermissions(path: string): Nip46Permission[] {
  return parseNip46PolicyFile(readJson(path));
}

function requirePositiveIntegerField(record: Record<string, unknown>, fixtureName: string, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`invalid review display-frame fixture ${fixtureName}: ${field} must be a positive integer`);
  }
  return value;
}

function validateReviewDisplayFrameFixture(name: string, fixture: unknown): void {
  if (!isRecord(fixture)) throw new Error(`invalid review display-frame fixture ${name}: fixture must be an object`);
  if (fixture.format !== "review-display-frame-v0") {
    throw new Error(`invalid review display-frame fixture ${name}: unsupported format`);
  }
  if (typeof fixture.source_review_vector !== "string" || fixture.source_review_vector.length === 0) {
    throw new Error(`invalid review display-frame fixture ${name}: source_review_vector must be a string`);
  }
  if (typeof fixture.page_index !== "number" || !Number.isInteger(fixture.page_index) || fixture.page_index < 0) {
    throw new Error(`invalid review display-frame fixture ${name}: page_index must be a non-negative integer`);
  }
  if (!isRecord(fixture.limits)) {
    throw new Error(`invalid review display-frame fixture ${name}: limits must be an object`);
  }
  const limits = fixture.limits;
  const maxTitleChars = requirePositiveIntegerField(limits, name, "max_title_chars");
  const maxBodyLines = requirePositiveIntegerField(limits, name, "max_body_lines");
  const maxLineChars = requirePositiveIntegerField(limits, name, "max_line_chars");
  if (!isRecord(fixture.frame)) {
    throw new Error(`invalid review display-frame fixture ${name}: frame must be an object`);
  }
  const frame = fixture.frame;
  if (typeof frame.title !== "string") {
    throw new Error(`invalid review display-frame fixture ${name}: frame must include title`);
  }
  if (typeof frame.page_indicator !== "string") {
    throw new Error(`invalid review display-frame fixture ${name}: frame must include page_indicator`);
  }
  if (!Array.isArray(frame.body_lines) || !frame.body_lines.every((line) => typeof line === "string")) {
    throw new Error(`invalid review display-frame fixture ${name}: frame body_lines must be strings`);
  }
  const bodyLines = frame.body_lines;
  if (typeof frame.action_hint !== "string") {
    throw new Error(`invalid review display-frame fixture ${name}: frame must include action_hint`);
  }
  if (frame.title.length > maxTitleChars) {
    throw new Error(`invalid review display-frame fixture ${name}: title exceeds max_title_chars`);
  }
  if (bodyLines.length > maxBodyLines) {
    throw new Error(`invalid review display-frame fixture ${name}: body_lines exceeds max_body_lines`);
  }
  if (bodyLines.some((line) => line.length > maxLineChars)) {
    throw new Error(`invalid review display-frame fixture ${name}: body line exceeds max_line_chars`);
  }
}

function validateReviewDetailPageFixture(name: string, fixture: unknown): void {
  if (!isRecord(fixture)) throw new Error(`invalid review detail-page fixture ${name}: fixture must be an object`);
  if (fixture.format !== "review-detail-pages-v0") {
    throw new Error(`invalid review detail-page fixture ${name}: unsupported format`);
  }
  if (fixture.display_profile !== "ascii-safe-codepoint-fallback-v0") {
    throw new Error(`invalid review detail-page fixture ${name}: unsupported display_profile`);
  }
  if (typeof fixture.source_review_vector !== "string" || fixture.source_review_vector.length === 0) {
    throw new Error(`invalid review detail-page fixture ${name}: source_review_vector must be a string`);
  }
  if (
    typeof fixture.approval_digest !== "string" ||
    !/^[0-9a-f]{64}$/.test(fixture.approval_digest)
  ) {
    throw new Error(`invalid review detail-page fixture ${name}: approval_digest must be 32-byte lowercase hex`);
  }
  if (!isRecord(fixture.limits)) {
    throw new Error(`invalid review detail-page fixture ${name}: limits must be an object`);
  }
  const limits = fixture.limits;
  const maxTitleChars = requirePositiveIntegerField(limits, name, "max_title_chars");
  const maxBodyLines = requirePositiveIntegerField(limits, name, "max_body_lines");
  requirePositiveIntegerField(limits, name, "max_line_chars");
  const maxCompactBodyLines = requirePositiveIntegerField(limits, name, "max_compact_body_lines");
  const maxCompactLineChars = requirePositiveIntegerField(limits, name, "max_compact_line_chars");
  if (!Array.isArray(fixture.pages) || fixture.pages.length === 0) {
    throw new Error(`invalid review detail-page fixture ${name}: pages must be a non-empty array`);
  }
  for (const [index, page] of fixture.pages.entries()) {
    if (!isRecord(page)) {
      throw new Error(`invalid review detail-page fixture ${name}: page ${index} must be an object`);
    }
    if (typeof page.title !== "string" || page.title.length > maxTitleChars) {
      throw new Error(`invalid review detail-page fixture ${name}: page ${index} title is invalid`);
    }
    if (typeof page.page_indicator !== "string" || page.page_indicator.length === 0) {
      throw new Error(`invalid review detail-page fixture ${name}: page ${index} page_indicator is invalid`);
    }
    if (page.action !== "next" && page.action !== "approve_or_reject") {
      throw new Error(`invalid review detail-page fixture ${name}: page ${index} action is invalid`);
    }
    if (!Array.isArray(page.lines) || !page.lines.every((line) => typeof line === "string")) {
      throw new Error(`invalid review detail-page fixture ${name}: page ${index} lines must be strings`);
    }
    if (
      !Array.isArray(page.body_line_styles) ||
      (page.body_line_styles.length !== 0 && page.body_line_styles.length !== page.lines.length)
    ) {
      throw new Error(`invalid review detail-page fixture ${name}: page ${index} body_line_styles mismatch`);
    }
    for (const [styleIndex, style] of page.body_line_styles.entries()) {
      if (!REVIEW_DETAIL_BODY_LINE_STYLES.has(String(style))) {
        throw new Error(`invalid review detail-page fixture ${name}: page ${index} body_line_styles contains invalid style`);
      }
      if (String(page.lines[styleIndex]).startsWith("  ") && style !== "value") {
        throw new Error(`invalid review detail-page fixture ${name}: page ${index} continuation lines must use value style`);
      }
    }
    const usesCompactBody = page.body_line_styles.length > 0;
    const maxLines = usesCompactBody ? maxCompactBodyLines : maxBodyLines;
    if (page.lines.length > maxLines) {
      throw new Error(`invalid review detail-page fixture ${name}: page ${index} lines exceed display limit`);
    }
    if (usesCompactBody && page.lines.some((line) => line.length > maxCompactLineChars)) {
      throw new Error(`invalid review detail-page fixture ${name}: page ${index} line exceeds display limit`);
    }
    if (typeof page.logical_page_id !== "string" || page.logical_page_id.length === 0) {
      throw new Error(`invalid review detail-page fixture ${name}: page ${index} logical_page_id is invalid`);
    }
  }
}

function assertJsonEqual(actual: unknown, expected: unknown, error: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(error);
  }
}

function validateNip46PermissionPolicyFixture(name: string, fixture: Record<string, unknown>): void {
  assertJsonEqual(
    nip46PermissionRequirementFromRequest(fixture.request_message),
    fixture.permission_requirement,
    `invalid NIP-46 fixture ${name}: permission requirement mismatch`
  );
  if (!Array.isArray(fixture.permission_checks) || fixture.permission_checks.length === 0) {
    throw new Error(`invalid NIP-46 fixture ${name}: permission checks must be a non-empty array`);
  }
  for (const [index, check] of fixture.permission_checks.entries()) {
    if (!isRecord(check) || !Array.isArray(check.granted_permissions)) {
      throw new Error(`invalid NIP-46 fixture ${name}: permission check ${index} must include granted permissions`);
    }
    const grantedPermissions = check.granted_permissions as Nip46Permission[];
    if (check.permitted !== isNip46RequestPermitted(fixture.request_message, grantedPermissions)) {
      throw new Error(`invalid NIP-46 fixture ${name}: permission check mismatch at ${index}`);
    }
  }
}

function validateNip46BridgeDecisionFixtures(name: string, fixture: Record<string, unknown>): void {
  if (!Array.isArray(fixture.bridge_decisions) || fixture.bridge_decisions.length === 0) {
    throw new Error(`invalid NIP-46 fixture ${name}: bridge decisions must be a non-empty array`);
  }
  for (const [index, check] of fixture.bridge_decisions.entries()) {
    if (!isRecord(check) || !Array.isArray(check.granted_permissions)) {
      throw new Error(`invalid NIP-46 fixture ${name}: bridge decision ${index} must include granted permissions`);
    }
    assertJsonEqual(
      decideNip46BridgeAction(fixture.request_message, check.granted_permissions as Nip46Permission[]),
      check.decision,
      `invalid NIP-46 fixture ${name}: bridge decision mismatch at ${index}`
    );
  }
}

function validateNip46PayloadFixture(name: string, fixture: unknown): void {
  if (!isRecord(fixture)) throw new Error(`invalid NIP-46 fixture ${name}: fixture must be an object`);
  if (fixture.format !== "nip46-decrypted-payload-v0") {
    throw new Error(`invalid NIP-46 fixture ${name}: unsupported format`);
  }
  if (!isRecord(fixture.request_message)) {
    throw new Error(`invalid NIP-46 fixture ${name}: request_message must be an object`);
  }
  validateNip46BridgeDecisionFixtures(name, fixture);
  if (fixture.request_message.method === "ping") {
    validateNip46PermissionPolicyFixture(name, fixture);
    assertJsonEqual(
      respondToLocalNip46Request(fixture.request_message),
      fixture.local_response_message,
      `invalid NIP-46 fixture ${name}: local response mismatch`
    );
    return;
  }
  if (fixture.request_message.method === "connect") {
    if ("permission_requirement" in fixture || "permission_checks" in fixture) {
      throw new Error(`invalid NIP-46 fixture ${name}: connect must not include permission policy`);
    }
    assertJsonEqual(
      parseNip46ConnectIntent(fixture.request_message),
      fixture.connect_intent,
      `invalid NIP-46 fixture ${name}: connect intent mismatch`
    );
    assertJsonEqual(
      reviewNip46ConnectMessage(fixture.request_message),
      fixture.connect_review,
      `invalid NIP-46 fixture ${name}: connect review mismatch`
    );
    return;
  }
  validateNip46PermissionPolicyFixture(name, fixture);
  assertJsonEqual(
    nsealrRequestFromNip46(fixture.request_message),
    fixture.nsealr_request,
    `invalid NIP-46 fixture ${name}: nSealr request mismatch`
  );
  assertJsonEqual(
    nip46ResponseFromNSealr(String(fixture.request_message.id), fixture.nsealr_response),
    fixture.response_message,
    `invalid NIP-46 fixture ${name}: response message mismatch`
  );
}

function validateNip46PolicyFileFixture(name: string, fixture: unknown): void {
  parseNip46PolicyFile(fixture, `invalid NIP-46 policy-file fixture ${name}`);
}

function expectFixtureRejection(name: string, expectedError: string, action: () => void): void {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expectedError)) {
      throw new Error(`invalid hardening fixture ${name}: expected ${expectedError}, got ${message}`);
    }
    return;
  }
  throw new Error(`invalid hardening fixture ${name}: unexpectedly accepted`);
}

function validateInvalidHardeningFixture(fixture: {
  name: string;
  category: string;
  expected_error: string;
  request?: unknown;
  response?: unknown;
  envelope?: string;
  frame?: string;
  request_message?: unknown;
  policy_file?: unknown;
}): void {
  if (fixture.category === "signing-request") {
    expectFixtureRejection(fixture.name, fixture.expected_error, () => {
      const result = validateRequest(fixture.request);
      if (!result.ok) throw new Error(result.error);
    });
    return;
  }
  if (fixture.category === "response") {
    expectFixtureRejection(fixture.name, fixture.expected_error, () => {
      const result = validateResponse(fixture.response);
      if (!result.ok) throw new Error(result.error);
    });
    return;
  }
  if (fixture.category === "qr-envelope") {
    expectFixtureRejection(fixture.name, fixture.expected_error, () => {
      decodeQrEnvelope(String(fixture.envelope));
    });
    return;
  }
  if (fixture.category === "serial-frame") {
    expectFixtureRejection(fixture.name, fixture.expected_error, () => {
      const frame = decodeSerialFrame(String(fixture.frame));
      if (frame.type === "request") {
        const result = validateRequest(frame.payload);
        if (!result.ok) throw new Error(result.error);
      }
      if (frame.type === "response") {
        const result = validateResponse(frame.payload);
        if (!result.ok) throw new Error(result.error);
      }
    });
    return;
  }
  if (fixture.category === "nip46") {
    expectFixtureRejection(fixture.name, fixture.expected_error, () => {
      decideNip46BridgeAction(fixture.request_message, []);
    });
    return;
  }
  if (fixture.category === "nip46-policy-file") {
    expectFixtureRejection(fixture.name, fixture.expected_error, () => {
      parseNip46PolicyFile(fixture.policy_file);
    });
    return;
  }
  throw new Error(`invalid hardening fixture ${fixture.name}: unsupported category ${fixture.category}`);
}

function readValue(path: string, format: DataFormat): unknown {
  if (format === "qr") return decodeQrEnvelope(readFileSync(path, "utf8").trim());
  if (format === "qr-animated") {
    const frames = readFileSync(path, "utf8")
      .trim()
      .split(/\n/u)
      .filter((line) => line.length > 0);
    return decodeAnimatedQrEnvelopeFrames(frames);
  }
  return readJson(path);
}

function writeValue(path: string, value: unknown, format: DataFormat): void {
  if (format === "qr") {
    writeFileSync(path, `${encodeQrEnvelope(value)}\n`, "utf8");
    return;
  }
  if (format === "qr-animated") {
    writeFileSync(path, `${encodeAnimatedQrEnvelopeFrames(value).join("\n")}\n`, "utf8");
    return;
  }
  writeJson(path, value);
}

function assertResponseForRequest(request: unknown, response: unknown, label: string): void {
  const requestShape = validateRequest(request);
  if (!requestShape.ok) throw new Error(requestShape.error);
  const responseShape = validateResponse(response);
  if (!responseShape.ok) throw new Error(responseShape.error);
  if ((response as { request_id?: unknown }).request_id !== (request as { request_id?: unknown }).request_id) {
    throw new Error(`${label} request_id does not match request`);
  }
  if ((response as { ok?: boolean }).ok === true && (request as { method?: string }).method === "sign_event") {
    const result = verifySignedEventResponse(request, response);
    if (!result.ok) {
      throw new Error(label === "response" ? result.error : `${label} ${result.error}`);
    }
  }
}

function fixtureCountLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

async function openNodeSerialLinePort(path: string): Promise<SerialLinePort> {
  const serialPort = new SerialPort({ path, baudRate: 115_200, autoOpen: false });
  await new Promise<void>((resolve, reject) => {
    serialPort.open((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  return new SerialLineStreamPort({ input: serialPort, output: serialPort });
}

export function buildCli(options: BuildCliOptions = {}): Command {
  const openSerialLinePort = options.openSerialLinePort ?? openNodeSerialLinePort;
  const program = new Command();
  program.name("nsealr").description("nSealr companion CLI").version("0.1.0");

  program
    .command("fixture")
    .argument("<action>")
    .requiredOption("--specs <path>")
    .description("Verify shared specs fixtures")
    .action((action: string, options: { specs: string }) => {
      if (action !== "verify") throw new Error(`unsupported fixture action: ${action}`);
      const fixtures = loadSpecsFixtures(options.specs);
      for (const event of fixtures.events) {
        const response = event.response as unknown;
        const request = event.request as unknown;
        const shape = validateResponse(response);
        if (!shape.ok) throw new Error(`invalid response fixture ${event.name}: ${shape.error}`);
        const verification = verifySignedEventResponse(request, response);
        if (!verification.ok) throw new Error(`invalid event fixture ${event.name}: ${verification.error}`);
      }
      for (const review of fixtures.reviews) {
        const request = review.request as { params?: { event_template?: unknown } };
        const requestShape = validateRequest(request);
        if (!requestShape.ok) throw new Error(`invalid review request fixture ${review.name}: ${requestShape.error}`);
        const actual = reviewEventTemplate(request.params?.event_template);
        if (JSON.stringify(actual) !== JSON.stringify(review.review)) {
          throw new Error(`invalid review fixture ${review.name}: review output mismatch`);
        }
      }
      for (const reviewScreen of fixtures.reviewScreens) {
        const requestShape = validateRequest(reviewScreen.request);
        if (!requestShape.ok) throw new Error(`invalid review-screen request fixture ${reviewScreen.name}: ${requestShape.error}`);
        const actual = screenReviewForRequest(reviewScreen.request);
        if (JSON.stringify(actual) !== JSON.stringify(reviewScreen.screen_review)) {
          throw new Error(`invalid review-screen fixture ${reviewScreen.name}: screen_review output mismatch`);
        }
      }
      for (const transcript of fixtures.reviewTranscripts) {
        validateReviewTranscriptFixture(transcript.name, transcript);
      }
      for (const displayFrame of fixtures.reviewDisplayFrames) {
        validateReviewDisplayFrameFixture(displayFrame.name, displayFrame);
      }
      for (const detailPages of fixtures.reviewDetailPages) {
        validateReviewDetailPageFixture(detailPages.name, detailPages);
      }
      for (const nip46Payload of fixtures.nip46Payloads) {
        validateNip46PayloadFixture(nip46Payload.name, nip46Payload);
      }
      for (const nip46PolicyFile of fixtures.nip46PolicyFiles) {
        validateNip46PolicyFileFixture(nip46PolicyFile.name, nip46PolicyFile);
      }
      for (const account of fixtures.accounts) {
        if (account.signer_route.type.endsWith("_qr_vault") && account.capabilities.persistent_grants !== false) {
          throw new Error(`invalid account descriptor ${account.account_id}: QR vaults must not support persistent grants`);
        }
      }
      for (const policy of fixtures.policyProfiles) {
        if (policy.route_types.some((route) => route.endsWith("_qr_vault")) && policy.grants_allowed) {
          throw new Error(`invalid policy profile ${policy.policy_id}: QR vault policies must not allow grants`);
        }
      }
      for (const grant of fixtures.grants) {
        if (grant.route_type.endsWith("_qr_vault")) {
          throw new Error(`invalid grant descriptor ${grant.grant_id}: QR vaults must not receive grants`);
        }
      }
      for (const policyDecision of fixtures.policyDecisions) {
        const policy = fixtures.policyProfiles.find((candidate) => candidate.policy_id === policyDecision.policy_profile_id);
        if (policy === undefined) {
          throw new Error(`invalid policy decision fixture ${policyDecision.name}: policy profile not found`);
        }
        const actual = decidePolicyRequest({
          policy,
          grants: fixtures.grants,
          request: policyDecision.request
        });
        if (JSON.stringify(actual) !== JSON.stringify(policyDecision.decision)) {
          throw new Error(`invalid policy decision fixture ${policyDecision.name}: policy decision mismatch`);
        }
      }
      for (const routeSelection of fixtures.routeSelections) {
        const actual = selectAccountRoute(fixtures.accounts, routeSelection.request);
        if (JSON.stringify(actual) !== JSON.stringify(routeSelection.selection)) {
          throw new Error(`invalid route selection fixture ${routeSelection.name}: route selection mismatch`);
        }
      }
      for (const featureMatrix of fixtures.featureMatrices) {
        validateFeatureMatrixFixture(featureMatrix.name, featureMatrix);
      }
      for (const invalidVector of fixtures.invalidVectors) {
        validateInvalidHardeningFixture(invalidVector);
      }
      const policyFileFixtureLabel =
        fixtureCountLabel(fixtures.nip46PolicyFiles.length, "NIP-46 policy-file fixture");
      console.log(
        `verified ${fixtureCountLabel(fixtures.events.length, "event fixture")}, ${fixtureCountLabel(fixtures.reviews.length, "review fixture")}, ${fixtureCountLabel(fixtures.reviewScreens.length, "review-screen fixture")}, ${fixtureCountLabel(fixtures.reviewDisplayFrames.length, "review display-frame fixture")}, ${fixtureCountLabel(fixtures.reviewDetailPages.length, "review detail-page fixture")}, ${fixtureCountLabel(fixtures.reviewTranscripts.length, "review transcript fixture")}, ${fixtureCountLabel(fixtures.nip46Payloads.length, "NIP-46 payload fixture")}, ${policyFileFixtureLabel}, ${fixtureCountLabel(fixtures.accounts.length, "account descriptor")}, ${fixtureCountLabel(fixtures.policyProfiles.length, "policy profile")}, ${fixtureCountLabel(fixtures.grants.length, "grant descriptor")}, ${fixtureCountLabel(fixtures.policyDecisions.length, "policy decision vector")}, ${fixtureCountLabel(fixtures.routeSelections.length, "route selection vector")}, ${fixtureCountLabel(fixtures.featureMatrices.length, "feature matrix")}, and ${fixtureCountLabel(fixtures.invalidVectors.length, "invalid hardening fixture")}`
      );
    });

  program
    .command("request")
    .argument("<method>")
    .requiredOption("--out <path>")
    .option("--event-template <path>")
    .option("--request-id <id>")
    .option("--output-format <format>", "Output format: json, qr, or qr-animated", "json")
    .description("Create a nSealr request")
    .action((method: string, options: { out: string; eventTemplate?: string; requestId?: string; outputFormat: string }) => {
      assertFormat(options.outputFormat);
      const parameterlessMethod = PARAMETERLESS_REQUEST_METHODS[method];
      if (parameterlessMethod) {
        const request = {
          version: 1,
          request_id: options.requestId ?? parameterlessMethod.defaultRequestId,
          method: parameterlessMethod.protocolMethod
        };
        const validation = validateRequest(request);
        if (!validation.ok) throw new Error(validation.error);
        writeValue(options.out, request, options.outputFormat);
        return;
      }
      if (method === "sign-event") {
        if (!options.eventTemplate) throw new Error("--event-template is required for sign-event");
        const request = {
          version: 1,
          request_id: options.requestId ?? "req-sign-event-1",
          method: "sign_event",
          params: {
            event_template: readJson(options.eventTemplate)
          }
        };
        const validation = validateRequest(request);
        if (!validation.ok) throw new Error(validation.error);
        writeValue(options.out, request, options.outputFormat);
        return;
      }
      throw new Error(`unsupported request method: ${method}`);
    });

  program
    .command("dev-sign")
    .requiredOption("--secret-key <hex>")
    .requiredOption("--request <path>")
    .option("--request-format <format>", "Request format: json, qr, or qr-animated", "json")
    .requiredOption("--out <path>")
    .option("--output-format <format>", "Output format: json, qr, or qr-animated", "json")
    .description("Sign a request with a test-only software signer")
    .action((options: { secretKey: string; request: string; requestFormat: string; out: string; outputFormat: string }) => {
      assertFormat(options.requestFormat);
      assertFormat(options.outputFormat);
      const request = readValue(options.request, options.requestFormat);
      const validation = validateRequest(request);
      if (!validation.ok) throw new Error(validation.error);
      if ((request as { method?: string }).method !== "sign_event") {
        throw new Error("dev-sign supports sign_event requests only");
      }
      writeValue(options.out, devSignRequest(request as Parameters<typeof devSignRequest>[0], options.secretKey), options.outputFormat);
    });

  program
    .command("review-request")
    .requiredOption("--request <path>")
    .option("--request-format <format>", "Request format: json, qr, or qr-animated", "json")
    .option("--screen-review", "Render deterministic screen-review pages with approval digest")
    .option("--detail-pages", "Render complete constrained-display review detail pages")
    .option("--max-title-chars <n>", "Detail-page title width for --detail-pages")
    .option("--max-body-lines <n>", "Detail-page body lines for --detail-pages")
    .option("--max-line-chars <n>", "Detail-page body width for --detail-pages")
    .option("--max-compact-body-lines <n>", "Compact detail-page body lines for --detail-pages")
    .option("--max-compact-line-chars <n>", "Compact detail-page body width for --detail-pages")
    .option("--author-pubkey <hex>", "Signer author pubkey to bind into review output")
    .requiredOption("--out <path>")
    .description("Render an untrusted local review preview for a signing request")
    .action((options: {
      request: string;
      requestFormat: string;
      screenReview?: boolean;
      detailPages?: boolean;
      maxTitleChars?: string;
      maxBodyLines?: string;
      maxLineChars?: string;
      maxCompactBodyLines?: string;
      maxCompactLineChars?: string;
      authorPubkey?: string;
      out: string;
    }) => {
      assertFormat(options.requestFormat);
      if (options.screenReview === true && options.detailPages === true) {
        throw new Error("review-request accepts only one review output mode");
      }
      const authorPubkey = optionalAuthorPubkey(options.authorPubkey);
      const request = readValue(options.request, options.requestFormat);
      const validation = validateRequest(request);
      if (!validation.ok) throw new Error(validation.error);
      if ((request as { method?: string }).method !== "sign_event") {
        throw new Error("review-request supports sign_event requests only");
      }
      if (options.screenReview === true) {
        writeJson(options.out, screenReviewForRequest(request, authorPubkey));
        return;
      }
      const eventTemplate = (request as { params?: { event_template?: unknown } }).params?.event_template;
      if (options.detailPages === true) {
        writeJson(
          options.out,
          renderReviewDetailPages(reviewEventTemplate(eventTemplate, authorPubkey), reviewDetailPageLimitsFromOptions(options))
        );
        return;
      }
      writeJson(options.out, reviewEventTemplate(eventTemplate, authorPubkey));
    });

  const local = program.command("local").description("Inspect local companion service objects");

  local
    .command("review-pairing")
    .requiredOption("--intent <path>", "Read a local-service pairing intent JSON file")
    .requiredOption("--out <path>", "Write deterministic pairing-review metadata JSON")
    .description("Render local-service pairing review metadata without approving a client")
    .action((options: { intent: string; out: string }) => {
      writeJson(options.out, reviewPairingIntent(readJson(options.intent)));
    });

  program
    .command("smartcard-sim-sign")
    .requiredOption("--secret-key <hex>")
    .requiredOption("--request <path>")
    .option("--request-format <format>", "Request format: json, qr, or qr-animated", "json")
    .option("--review-acknowledged", "Confirm external review before sending an event id to a display-less smartcard")
    .option("--approval-digest <hex>", "Required with --review-acknowledged; binds acknowledgement to a reviewed request digest")
    .requiredOption("--out <path>")
    .option("--output-format <format>", "Output format: json, qr, or qr-animated", "json")
    .description("Sign a request through the test-only smartcard APDU simulator")
    .action(
      async (options: {
        secretKey: string;
        request: string;
        requestFormat: string;
        reviewAcknowledged?: boolean;
        approvalDigest?: string;
        out: string;
        outputFormat: string;
      }) => {
        assertFormat(options.requestFormat);
        assertFormat(options.outputFormat);
        const request = readValue(options.request, options.requestFormat);
        const validation = validateRequest(request);
        if (!validation.ok) throw new Error(validation.error);
        if ((request as { method?: string }).method !== "sign_event") {
          throw new Error("smartcard-sim-sign supports sign_event requests only");
        }
        if (options.approvalDigest !== undefined && options.reviewAcknowledged !== true) {
          throw new Error("approval digest requires --review-acknowledged");
        }
        let acknowledgement: Parameters<SmartcardSigner["signEventRequest"]>[1];
        if (options.reviewAcknowledged === true) {
          const approvalDigest = options.approvalDigest;
          if (approvalDigest === undefined) {
            throw new Error("approval_digest is required for display-less smartcard signing");
          }
          acknowledgement = { acknowledged: true, source: "external-review", approvalDigest };
        }
        const signer = new SmartcardSigner(new SmartcardSimulator(options.secretKey));
        const response = await signer.signEventRequest(request as SignEventRequest, acknowledgement);
        writeValue(options.out, response, options.outputFormat);
      }
    );

  const serialFrame = program.command("serial-frame").description("Encode and decode newline serial frames");

  serialFrame
    .command("wrap-request")
    .requiredOption("--request <path>")
    .option("--request-format <format>", "Request format: json, qr, or qr-animated", "json")
    .requiredOption("--out <path>")
    .description("Wrap a validated request as a serial request frame")
    .action((options: { request: string; requestFormat: string; out: string }) => {
      assertFormat(options.requestFormat);
      const request = readValue(options.request, options.requestFormat);
      const validation = validateRequest(request);
      if (!validation.ok) throw new Error(validation.error);
      writeFileSync(options.out, encodeSerialFrame({ type: "request", payload: request }), "utf8");
    });

  serialFrame
    .command("unwrap-response")
    .option("--request <path>", "Original request to verify the serial response against")
    .option("--request-format <format>", "Request format: json, qr, or qr-animated", "json")
    .requiredOption("--response-frame <path>")
    .requiredOption("--out <path>")
    .option("--output-format <format>", "Output format: json, qr, or qr-animated", "json")
    .description("Decode and validate a serial response frame")
    .action((options: { request?: string; requestFormat: string; responseFrame: string; out: string; outputFormat: string }) => {
      assertFormat(options.requestFormat);
      assertFormat(options.outputFormat);
      const frame = decodeSerialFrame(readFileSync(options.responseFrame, "utf8").trim());
      if (frame.type !== "response") {
        throw new Error(`serial-frame unwrap-response expected response frame, got ${frame.type}`);
      }
      if (options.request !== undefined) {
        const request = readValue(options.request, options.requestFormat);
        assertResponseForRequest(request, frame.payload, "serial frame response");
      } else {
        const validation = validateResponse(frame.payload);
        if (!validation.ok) throw new Error(validation.error);
      }
      writeValue(options.out, frame.payload, options.outputFormat);
    });

  const serialLine = program.command("serial-line").description("Exchange validated requests over a newline serial port");

  serialLine
    .command("exchange")
    .requiredOption("--port <path>", "Serial device path, for example /dev/cu.usbmodem1101")
    .requiredOption("--request <path>")
    .option("--request-format <format>", "Request format: json, qr, or qr-animated", "json")
    .requiredOption("--out <path>")
    .option("--output-format <format>", "Output format: json, qr, or qr-animated", "json")
    .option("--timeout-ms <value>", "Read/write timeout in milliseconds", "30000")
    .option("--max-ignored-lines <value>", "Maximum non-protocol lines to skip before failing", "32")
    .description("Send one validated request frame and write the verified response")
    .action(
      async (actionOptions: {
        port: string;
        request: string;
        requestFormat: string;
        out: string;
        outputFormat: string;
        timeoutMs: string;
        maxIgnoredLines: string;
      }) => {
        assertFormat(actionOptions.requestFormat);
        assertFormat(actionOptions.outputFormat);
        const request = readValue(actionOptions.request, actionOptions.requestFormat);
        const validation = validateRequest(request);
        if (!validation.ok) throw new Error(validation.error);
        const responseTimeoutMs = positiveIntegerOption(actionOptions.timeoutMs, 30_000, "--timeout-ms");
        const maxIgnoredLines = positiveIntegerOption(actionOptions.maxIgnoredLines, 32, "--max-ignored-lines");
        const response = await exchangeSerialLineRequest({
          path: actionOptions.port,
          request,
          openPort: openSerialLinePort,
          responseTimeoutMs,
          maxIgnoredLines
        });
        writeValue(actionOptions.out, response, actionOptions.outputFormat);
      }
    );

  const nip46 = program.command("nip46").description("Inspect already-decrypted NIP-46 payloads");

  nip46
    .command("review-connect")
    .description("Write deterministic review pages for an already-decrypted NIP-46 connect request")
    .requiredOption("--message <path>", "Read a decrypted NIP-46 connect message JSON file")
    .requiredOption("--out <path>", "Write the connect review JSON")
    .action((options: { message: string; out: string }) => {
      writeJson(options.out, reviewNip46ConnectMessage(readJson(options.message)));
    });

  nip46
    .command("decide")
    .requiredOption("--message <path>")
    .option("--permissions <value>", "Comma-separated approved NIP-46 permissions", "")
    .option("--policy-file <path>", "Read approved NIP-46 permissions from a policy file")
    .requiredOption("--out <path>")
    .description("Write the bridge decision for an already-decrypted NIP-46 request")
    .action((options: { message: string; permissions: string; policyFile?: string; out: string }) => {
      const message = readJson(options.message);
      if (options.policyFile && options.permissions.trim() !== "") {
        throw new Error("--policy-file cannot be combined with --permissions");
      }
      const permissions = options.policyFile
        ? readNip46PolicyPermissions(options.policyFile)
        : parseNip46Permissions(options.permissions);
      writeJson(options.out, decideNip46BridgeAction(message, permissions));
    });

  program
    .command("verify-response")
    .requiredOption("--request <path>")
    .option("--request-format <format>", "Request format: json, qr, or qr-animated", "json")
    .requiredOption("--response <path>")
    .option("--response-format <format>", "Response format: json, qr, or qr-animated", "json")
    .description("Verify a signer response against the original request")
    .action((options: { request: string; requestFormat: string; response: string; responseFormat: string }) => {
      assertFormat(options.requestFormat);
      assertFormat(options.responseFormat);
      const request = readValue(options.request, options.requestFormat);
      const response = readValue(options.response, options.responseFormat);
      assertResponseForRequest(request, response, "response");
      console.log("response verified");
    });

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildCli().parseAsync(process.argv);
}
