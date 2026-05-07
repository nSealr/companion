#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import { verifySignedEventResponse } from "../../../packages/core/src/nostr.js";
import { devSignRequest } from "../../../packages/dev-signer/src/dev-signer.js";
import { loadSpecsFixtures } from "../../../packages/fixtures/src/fixtures.js";
import { validateRequest, validateResponse } from "../../../packages/protocol/src/protocol.js";
import { decodeQrEnvelope, encodeQrEnvelope } from "../../../packages/qr/src/qr.js";
import { reviewEventTemplate } from "../../../packages/review/src/review.js";

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
      console.log(`verified ${fixtures.events.length} event fixtures`);
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
