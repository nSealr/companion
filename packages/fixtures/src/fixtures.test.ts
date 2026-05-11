import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSpecsFixtures, validateReviewTranscriptFixture } from "./fixtures.js";
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
      "6115446825f03a7abf600a7e5746e2a28de33aff3088894e1b610c17a7bb685b"
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
      "kind-1-unicode-boundary-t-display-s3"
    ]));
    const tagged = fixtures.reviewDetailPages.find((pageSet) => pageSet.name === "kind-1-tags-t-display-s3");
    const longTags = fixtures.reviewDetailPages.find(
      (pageSet) => pageSet.name === "kind-1-long-events-many-tags-t-display-s3"
    );
    const unicodeBoundary = fixtures.reviewDetailPages.find(
      (pageSet) => pageSet.name === "kind-1-unicode-boundary-t-display-s3"
    );
    expect(tagged?.display_profile).toBe("ascii-safe-codepoint-fallback-v0");
    expect(tagged?.pages.find((page) => page.title === "Tags")?.lines).toContain("nostrseal");
    expect(longTags?.pages.map((page) => page.page_indicator)).toContain("Page 3/4 Lines 28-29/29");
    expect(unicodeBoundary?.pages.find((page) => page.title === "Content")?.lines).toEqual(["abcU+00E8def"]);
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
    expect(fixtures.nip46PolicyFiles[0].format).toBe("nseal-nip46-policy-v0");
  });

  it("loads identity, policy, and grant descriptors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());

    expect(fixtures.accounts.map((account) => account.account_id)).toEqual(expect.arrayContaining([
      "acct-raspberry-qr-nip06-account-0",
      "acct-esp32-usb-slot-0",
      "acct-external-nip46-bunker"
    ]));
    expect(fixtures.policyProfiles.map((policy) => policy.policy_id)).toEqual(expect.arrayContaining([
      "policy-manual-only-qr-vault",
      "policy-scoped-automation-daily-use"
    ]));
    expect(fixtures.grants.map((grant) => grant.grant_id)).toEqual(["grant-esp32-usb-kind-1-session"]);
  });

  it("loads implementation limits and invalid hardening vectors from the specs repository", () => {
    const specsRoot = resolveSpecsRoot();
    const fixtures = loadSpecsFixtures(specsRoot);
    expect(fixtures.limits.format).toBe("nostrseal-implementation-limits-v0");
    expect(fixtures.limits.name).toBe("nostrseal-v0");
    expect(fixtures.limits.limits.max_request_id_length).toBe(128);
    const expectedInvalidNames = readdirSync(resolve(specsRoot, "vectors/invalid"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(/\.json$/u, ""))
      .sort();
    expect(fixtures.invalidVectors.map((vector) => vector.name)).toEqual(expectedInvalidNames);
  });
});
