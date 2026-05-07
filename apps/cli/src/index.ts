#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import { verifySignedEventResponse, type SignEventRequest } from "../../../packages/core/src/nostr.js";
import { devSignRequest } from "../../../packages/dev-signer/src/dev-signer.js";
import { loadSpecsFixtures } from "../../../packages/fixtures/src/fixtures.js";
import {
  nip46ResponseFromNostrSeal,
  nostrSealRequestFromNip46,
  respondToLocalNip46Request
} from "../../../packages/nip46/src/nip46.js";
import { validateRequest, validateResponse } from "../../../packages/protocol/src/protocol.js";
import { decodeQrEnvelope, encodeQrEnvelope } from "../../../packages/qr/src/qr.js";
import { reviewEventTemplate } from "../../../packages/review/src/review.js";
import { SmartcardSimulator } from "../../../packages/smartcard/src/apdu.js";
import { SmartcardSigner } from "../../../packages/smartcard/src/signer.js";

type DataFormat = "json" | "qr";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertFormat(format: string): asserts format is DataFormat {
  if (format !== "json" && format !== "qr") {
    throw new Error(`unsupported format: ${format}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateReviewTranscriptFixture(name: string, fixture: unknown): void {
  if (!isRecord(fixture)) throw new Error(`invalid review transcript fixture ${name}: fixture must be an object`);
  if (fixture.format !== "qr-review-transcript-v0") {
    throw new Error(`invalid review transcript fixture ${name}: unsupported format`);
  }
  if (typeof fixture.qr_envelope !== "string" || !fixture.qr_envelope.startsWith("nseal1:")) {
    throw new Error(`invalid review transcript fixture ${name}: qr_envelope must be a nseal1 envelope`);
  }
  if (typeof fixture.approval_digest !== "string" || !/^[0-9a-f]{64}$/.test(fixture.approval_digest)) {
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
    if (!["next", "approve", "reject"].includes(String(button))) {
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
  }
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

function assertJsonEqual(actual: unknown, expected: unknown, error: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(error);
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
  if (fixture.request_message.method === "ping") {
    assertJsonEqual(
      respondToLocalNip46Request(fixture.request_message),
      fixture.local_response_message,
      `invalid NIP-46 fixture ${name}: local response mismatch`
    );
    return;
  }
  assertJsonEqual(
    nostrSealRequestFromNip46(fixture.request_message),
    fixture.nostrseal_request,
    `invalid NIP-46 fixture ${name}: NostrSeal request mismatch`
  );
  assertJsonEqual(
    nip46ResponseFromNostrSeal(String(fixture.request_message.id), fixture.nostrseal_response),
    fixture.response_message,
    `invalid NIP-46 fixture ${name}: response message mismatch`
  );
}

function readValue(path: string, format: DataFormat): unknown {
  if (format === "qr") return decodeQrEnvelope(readFileSync(path, "utf8").trim());
  return readJson(path);
}

function writeValue(path: string, value: unknown, format: DataFormat): void {
  if (format === "qr") {
    writeFileSync(path, `${encodeQrEnvelope(value)}\n`, "utf8");
    return;
  }
  writeJson(path, value);
}

export function buildCli(): Command {
  const program = new Command();
  program.name("nseal").description("NostrSeal companion CLI").version("0.1.0");

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
      for (const transcript of fixtures.reviewTranscripts) {
        validateReviewTranscriptFixture(transcript.name, transcript);
      }
      for (const displayFrame of fixtures.reviewDisplayFrames) {
        validateReviewDisplayFrameFixture(displayFrame.name, displayFrame);
      }
      for (const nip46Payload of fixtures.nip46Payloads) {
        validateNip46PayloadFixture(nip46Payload.name, nip46Payload);
      }
      console.log(
        `verified ${fixtures.events.length} event fixtures, ${fixtures.reviews.length} review fixtures, ${fixtures.reviewDisplayFrames.length} review display-frame fixture, ${fixtures.reviewTranscripts.length} review transcript fixtures, and ${fixtures.nip46Payloads.length} NIP-46 payload fixtures`
      );
    });

  program
    .command("request")
    .argument("<method>")
    .requiredOption("--out <path>")
    .option("--event-template <path>")
    .option("--output-format <format>", "Output format: json or qr", "json")
    .description("Create a NostrSeal request")
    .action((method: string, options: { out: string; eventTemplate?: string; outputFormat: string }) => {
      assertFormat(options.outputFormat);
      if (method === "pubkey") {
        writeValue(options.out, {
          version: 1,
          request_id: "req-pubkey-1",
          method: "get_public_key"
        }, options.outputFormat);
        return;
      }
      if (method === "sign-event") {
        if (!options.eventTemplate) throw new Error("--event-template is required for sign-event");
        const request = {
          version: 1,
          request_id: "req-sign-event-1",
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
    .option("--request-format <format>", "Request format: json or qr", "json")
    .requiredOption("--out <path>")
    .option("--output-format <format>", "Output format: json or qr", "json")
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
    .option("--request-format <format>", "Request format: json or qr", "json")
    .requiredOption("--out <path>")
    .description("Render an untrusted local review preview for a signing request")
    .action((options: { request: string; requestFormat: string; out: string }) => {
      assertFormat(options.requestFormat);
      const request = readValue(options.request, options.requestFormat);
      const validation = validateRequest(request);
      if (!validation.ok) throw new Error(validation.error);
      if ((request as { method?: string }).method !== "sign_event") {
        throw new Error("review-request supports sign_event requests only");
      }
      const eventTemplate = (request as { params?: { event_template?: unknown } }).params?.event_template;
      writeJson(options.out, reviewEventTemplate(eventTemplate));
    });

  program
    .command("smartcard-sim-sign")
    .requiredOption("--secret-key <hex>")
    .requiredOption("--request <path>")
    .option("--request-format <format>", "Request format: json or qr", "json")
    .option("--review-acknowledged", "Confirm external review before sending an event id to a display-less smartcard")
    .requiredOption("--out <path>")
    .option("--output-format <format>", "Output format: json or qr", "json")
    .description("Sign a request through the test-only smartcard APDU simulator")
    .action(
      async (options: {
        secretKey: string;
        request: string;
        requestFormat: string;
        reviewAcknowledged?: boolean;
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
        const signer = new SmartcardSigner(new SmartcardSimulator(options.secretKey));
        const response = await signer.signEventRequest(
          request as SignEventRequest,
          options.reviewAcknowledged ? { acknowledged: true, source: "external-review" } : undefined
        );
        writeValue(options.out, response, options.outputFormat);
      }
    );

  program
    .command("verify-response")
    .requiredOption("--request <path>")
    .option("--request-format <format>", "Request format: json or qr", "json")
    .requiredOption("--response <path>")
    .option("--response-format <format>", "Response format: json or qr", "json")
    .description("Verify a signer response against the original request")
    .action((options: { request: string; requestFormat: string; response: string; responseFormat: string }) => {
      assertFormat(options.requestFormat);
      assertFormat(options.responseFormat);
      const request = readValue(options.request, options.requestFormat);
      const response = readValue(options.response, options.responseFormat);
      const responseShape = validateResponse(response);
      if (!responseShape.ok) throw new Error(responseShape.error);
      if ((response as { request_id?: unknown }).request_id !== (request as { request_id?: unknown }).request_id) {
        throw new Error("response request_id does not match request");
      }
      if ((response as { ok?: boolean }).ok === true && (request as { method?: string }).method === "sign_event") {
        const result = verifySignedEventResponse(request, response);
        if (!result.ok) throw new Error(result.error);
      }
      console.log("response verified");
    });

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildCli().parseAsync(process.argv);
}
