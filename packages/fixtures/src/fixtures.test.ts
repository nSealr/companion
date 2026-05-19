import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadSpecsFixtures,
  validateAccessSurfaceFixture,
  validateFeatureMatrixFixture,
  validateReviewTranscriptFixture
} from "./fixtures.js";
import { resolveSpecsRoot } from "./specs-root.js";

describe("fixture loading", () => {
  it("loads deterministic event vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());
    expect(fixtures.events.map((event) => event.name)).toEqual(expect.arrayContaining(["kind-1-basic", "kind-1-tags"]));
    expect(fixtures.key.name).toBe("test-key-1");
  });

  it("loads trusted review vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());
    expect(fixtures.reviews.map((review) => review.name)).toEqual(expect.arrayContaining([
      "kind-1-basic",
      "kind-1-long-events-many-tags",
      "kind-1-tags",
      "kind-1-unicode-boundary",
      "kind-30078-empty"
    ]));
    const longEvents = fixtures.reviews.find((review) => review.name === "kind-1-long-events-many-tags");
    const emptyParameterEvent = fixtures.reviews.find((review) => review.name === "kind-30078-empty");
    const unicodeBoundary = fixtures.reviews.find((review) => review.name === "kind-1-unicode-boundary");
    expect(longEvents?.review.content).toHaveLength(281);
    expect(longEvents?.review.tags).toHaveLength(9);
    expect(emptyParameterEvent?.review.kind).toBe(30078);
    expect(emptyParameterEvent?.review.content).toBe("");
    expect(unicodeBoundary?.review.content_utf8_bytes).toBe(8);
    expect(unicodeBoundary?.review.tags).toEqual([["t", "caffè"]]);
  });

  it("loads QR review transcript vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());
    expect(fixtures.reviewTranscripts.map((transcript) => transcript.name)).toEqual(expect.arrayContaining([
      "kind-1-basic-approve",
      "kind-1-basic-reject",
      "kind-1-long-events-many-tags-detail-scroll-approve"
    ]));
    expect(fixtures.reviewTranscripts[0].buttons).toEqual(["next", "next", "next", "approve"]);
    expect(fixtures.reviewTranscripts[1].transcript[0].decision).toBe(false);
    const detailScroll = fixtures.reviewTranscripts.find(
      (transcript) => transcript.name === "kind-1-long-events-many-tags-detail-scroll-approve"
    );
    expect(detailScroll?.buttons).toContain("scroll");
    expect(detailScroll?.transcript[0].frame.body_line_styles).toEqual(["meta", "meta", "meta", "value", "value"]);
  });

  it("validates QR review transcript fixtures in package code", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());
    const detailScroll = structuredClone(
      fixtures.reviewTranscripts.find(
        (transcript) => transcript.name === "kind-1-long-events-many-tags-detail-scroll-approve"
      )
    );
    if (detailScroll === undefined) throw new Error("missing detail scroll transcript fixture");

    expect(() => validateReviewTranscriptFixture(detailScroll.name, detailScroll)).not.toThrow();

    const invalidButton = structuredClone(detailScroll);
    invalidButton.buttons[2] = "sideways";
    expect(() => validateReviewTranscriptFixture(invalidButton.name, invalidButton)).toThrow(/unsupported button/u);

    const invalidStyles = structuredClone(detailScroll);
    invalidStyles.transcript[0].frame.body_line_styles = ["meta"];
    expect(() => validateReviewTranscriptFixture(invalidStyles.name, invalidStyles)).toThrow(/body_line_styles mismatch/u);
  });

  it("loads trusted review-screen vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());
    expect(fixtures.reviewScreens.map((screen) => screen.name)).toEqual(expect.arrayContaining(["kind-1-basic", "kind-1-tags"]));
    expect(fixtures.reviewScreens[0].screen_review.approval_digest).toBe(
      "a09ddd564e439fdd4756da6863156eddcfc50c295af453af1c78c35986c303a5"
    );
  });

  it("loads review display-frame vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());
    expect(fixtures.reviewDisplayFrames.map((frame) => frame.name)).toEqual(expect.arrayContaining([
      "kind-1-long-content-page-1-20x3",
      "kind-1-unicode-boundary-content-4x3"
    ]));
    const longContentFrame = fixtures.reviewDisplayFrames.find(
      (frame) => frame.name === "kind-1-long-content-page-1-20x3"
    );
    const unicodeFrame = fixtures.reviewDisplayFrames.find(
      (frame) => frame.name === "kind-1-unicode-boundary-content-4x3"
    );
    expect(longContentFrame?.frame.body_lines).toEqual([
      "xxxxxxxxxxxxxxxxxxxx",
      "xxxxxxxxxxxxxxxxxxxx",
      "xxxxxxxxxxxxxxxxx..."
    ]);
    expect(unicodeFrame?.frame.body_lines).toEqual(["abcè", "def"]);
  });

  it("loads complete review detail-page vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());
    expect(fixtures.reviewDetailPages.map((pageSet) => pageSet.name)).toEqual(expect.arrayContaining([
      "kind-1-long-events-many-tags-t-display-s3",
      "kind-1-tags-t-display-s3",
      "kind-1-control-escapes-t-display-s3",
      "kind-1-unicode-boundary-t-display-s3"
    ]));
    const tagged = fixtures.reviewDetailPages.find((pageSet) => pageSet.name === "kind-1-tags-t-display-s3");
    const longTags = fixtures.reviewDetailPages.find(
      (pageSet) => pageSet.name === "kind-1-long-events-many-tags-t-display-s3"
    );
    const unicodeBoundary = fixtures.reviewDetailPages.find(
      (pageSet) => pageSet.name === "kind-1-unicode-boundary-t-display-s3"
    );
    const controlEscapes = fixtures.reviewDetailPages.find(
      (pageSet) => pageSet.name === "kind-1-control-escapes-t-display-s3"
    );
    expect(tagged?.display_profile).toBe("ascii-safe-codepoint-fallback-v0");
    expect(tagged?.pages.find((page) => page.title === "Tags")?.lines).toContain("nsealr");
    expect(longTags?.pages.map((page) => page.page_indicator)).toContain("Page 3/4 Lines 28-29/29");
    expect(unicodeBoundary?.pages.find((page) => page.title === "Content")?.lines).toEqual(["abcU+00E8def"]);
    expect(controlEscapes?.pages.find((page) => page.title === "Tags")?.lines).toContain("line\\nbreak");
  });

  it("loads NIP-46 decrypted payload bridge vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());
    expect(fixtures.nip46Payloads.map((vector) => vector.name)).toEqual(expect.arrayContaining([
      "connect-policy-review",
      "get-public-key",
      "ping",
      "sign-event-kind-1-basic",
      "sign-event-user-rejected"
    ]));
    expect(fixtures.nip46Payloads[0].format).toBe("nip46-decrypted-payload-v0");
  });

  it("loads NIP-46 policy-file vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());
    expect(fixtures.nip46PolicyFiles.map((policy) => policy.name)).toEqual(["sign-event-kind-1-approved"]);
    expect(fixtures.nip46PolicyFiles[0].format).toBe("nsealr-nip46-policy-v0");
  });

  it("loads NIP-46 connection URI vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());
    expect(fixtures.nip46ConnectionUris.map((vector) => vector.name)).toEqual([
      "bunker-remote-signer-token",
      "nostrconnect-client-token"
    ]);
    expect(fixtures.nip46ConnectionUris[0].format).toBe("nsealr-nip46-connection-uri-v0");
    expect(JSON.stringify(fixtures.nip46ConnectionUris[0].expected_descriptor)).not.toContain(
      fixtures.nip46ConnectionUris[0].secret_probe
    );
  });

  it("loads identity, policy, and grant descriptors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());

    expect(fixtures.accounts.map((account) => account.account_id)).toEqual(expect.arrayContaining([
      "acct-custom-hardware-wallet-slot-0",
      "acct-esp32-qr-nip06-account-0",
      "acct-esp32-usb-slot-0",
      "acct-external-nip46-bunker",
      "acct-raspberry-qr-nip06-account-0",
      "acct-smartcard-slot-0"
    ]));
    expect(fixtures.policyProfiles.map((policy) => policy.policy_id)).toEqual(expect.arrayContaining([
      "policy-manual-only-displayless-smartcard",
      "policy-manual-only-persistent-device",
      "policy-manual-only-qr-vault",
      "policy-scoped-automation-daily-use"
    ]));
    const expectedGrantIds = readdirSync(resolve(resolveSpecsRoot(), "vectors/grants"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => `grant-${file.replace(/\.json$/u, "")}`)
      .sort();
    expect(fixtures.grants.map((grant) => grant.grant_id)).toEqual(expectedGrantIds);
    for (const account of fixtures.accounts) {
      const policy = fixtures.policyProfiles.find((candidate) => candidate.policy_id === account.policy_profile_id);
      expect(policy?.route_types).toContain(account.signer_route.type);
    }
  });

  it("loads policy change review vectors from the specs repository", () => {
    const specsRoot = resolveSpecsRoot();
    const fixtures = loadSpecsFixtures(specsRoot);
    const expectedNames = readdirSync(resolve(specsRoot, "vectors/policy-changes"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(/\.json$/u, ""))
      .sort();

    expect(fixtures.policyChanges.map((change) => change.name)).toEqual(expectedNames);
    expect(fixtures.policyChanges[0].format).toBe("nsealr-policy-change-review-v0");
    expect(fixtures.policyChanges[0].proposal.companion_authoritative).toBe(false);
  });

  it("loads policy decision vectors from the specs repository", () => {
    const specsRoot = resolveSpecsRoot();
    const fixtures = loadSpecsFixtures(specsRoot);
    const expectedNames = readdirSync(resolve(specsRoot, "vectors/policy-decisions"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(/\.json$/u, ""))
      .sort();

    expect(fixtures.policyDecisions.map((decision) => decision.name)).toEqual(expectedNames);
    expect(fixtures.policyDecisions[0].format).toBe("nsealr-policy-decision-vector-v0");
  });

  it("loads route selection vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());

    expect(fixtures.routeSelections.map((selection) => selection.name)).toEqual([
      "custom-hardware-wallet-sign-event-slot-0",
      "esp32-qr-sign-event-account-0",
      "esp32-usb-sign-event-slot-0",
      "external-nip46-sign-event-bunker",
      "raspberry-qr-sign-event-account-0",
      "smartcard-sign-event-slot-0"
    ]);
    expect(fixtures.routeSelections[0].format).toBe("nsealr-route-selection-vector-v0");
    expect(fixtures.routeSelections[0].selection.contains_secret_material).toBe(false);
  });

  it("loads access-surface vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());

    expect(fixtures.accessSurfaces.map((surface) => surface.name)).toEqual([
      "browser-provider-local-service-esp32-usb-unavailable"
    ]);
    expect(fixtures.accessSurfaces[0].format).toBe("nsealr-access-surface-vector-v0");
    expect(fixtures.accessSurfaces[0].surface).toBe("browser_provider_nip07");
    expect(fixtures.accessSurfaces[0].safety.stores_production_secrets).toBe(false);
    expect(() => validateAccessSurfaceFixture(fixtures.accessSurfaces[0].name, fixtures.accessSurfaces[0])).not.toThrow();
  });

  it("loads and validates signer feature matrix vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());
    const matrix = fixtures.featureMatrices.find((candidate) => candidate.name === "signer-feature-matrix-v0");

    expect(matrix?.format).toBe("nsealr-signer-feature-matrix-v0");
    expect(Object.keys(matrix?.solutions ?? {}).sort()).toEqual([
      "custom_hardware_wallet",
      "esp32_qr_vault",
      "esp32_usb_nip46",
      "raspberry_qr_vault",
      "smartcard"
    ]);
    expect(matrix?.solutions.raspberry_qr_vault.features.qr_response.target).toBe(
      matrix?.solutions.esp32_qr_vault.features.qr_response.target
    );
    expect(() => validateFeatureMatrixFixture(matrix?.name ?? "missing", matrix)).not.toThrow();
  });

  it("rejects feature matrix shared contract drift in package code", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());
    const matrix = structuredClone(
      fixtures.featureMatrices.find((candidate) => candidate.name === "signer-feature-matrix-v0")
    );
    if (matrix === undefined) throw new Error("missing feature matrix fixture");

    matrix.solutions.esp32_qr_vault.features.nostr_event_review_universal.contract_id = "esp32-special-review";

    expect(() => validateFeatureMatrixFixture(matrix.name, matrix)).toThrow(/shared feature contract drift/u);
  });

  it("loads implementation limits and invalid hardening vectors from the specs repository", () => {
    const specsRoot = resolveSpecsRoot();
    const fixtures = loadSpecsFixtures(specsRoot);
    expect(fixtures.limits.format).toBe("nsealr-implementation-limits-v0");
    expect(fixtures.limits.name).toBe("nsealr-v0");
    expect(fixtures.limits.limits.max_request_id_length).toBe(128);
    const expectedInvalidNames = readdirSync(resolve(specsRoot, "vectors/invalid"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(/\.json$/u, ""))
      .sort();
    expect(fixtures.invalidVectors.map((vector) => vector.name)).toEqual(expectedInvalidNames);
  });
});
