#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import { verifySignedEventResponse } from "../../../packages/core/src/nostr.js";
import { devSignRequest } from "../../../packages/dev-signer/src/dev-signer.js";
import { loadSpecsFixtures } from "../../../packages/fixtures/src/fixtures.js";
import { validateRequest, validateResponse } from "../../../packages/protocol/src/protocol.js";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
    .description("Create a NostrSeal request")
    .action((method: string, options: { out: string; eventTemplate?: string }) => {
      if (method === "pubkey") {
        writeJson(options.out, {
          version: 1,
          request_id: "req-pubkey-1",
          method: "get_public_key"
        });
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
        writeJson(options.out, request);
        return;
      }
      throw new Error(`unsupported request method: ${method}`);
    });

  program
    .command("dev-sign")
    .requiredOption("--secret-key <hex>")
    .requiredOption("--request <path>")
    .requiredOption("--out <path>")
    .description("Sign a request with a test-only software signer")
    .action((options: { secretKey: string; request: string; out: string }) => {
      const request = readJson(options.request);
      const validation = validateRequest(request);
      if (!validation.ok) throw new Error(validation.error);
      if ((request as { method?: string }).method !== "sign_event") {
        throw new Error("dev-sign supports sign_event requests only");
      }
      writeJson(options.out, devSignRequest(request as Parameters<typeof devSignRequest>[0], options.secretKey));
    });

  program
    .command("verify-response")
    .requiredOption("--request <path>")
    .requiredOption("--response <path>")
    .description("Verify a signer response against the original request")
    .action((options: { request: string; response: string }) => {
      const request = readJson(options.request);
      const response = readJson(options.response);
      const responseShape = validateResponse(response);
      if (!responseShape.ok) throw new Error(responseShape.error);
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

