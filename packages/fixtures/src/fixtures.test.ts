import { describe, expect, it } from "vitest";
import { loadSpecsFixtures } from "./fixtures.js";
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
    expect(fixtures.reviewTranscripts.map((transcript) => transcript.name)).toEqual([
      "kind-1-basic-approve",
      "kind-1-basic-reject"
    ]);
    expect(fixtures.reviewTranscripts[0].buttons).toEqual(["next", "next", "next", "approve"]);
    expect(fixtures.reviewTranscripts[1].transcript[0].decision).toBe(false);
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

  it("loads implementation limits and invalid hardening vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());
    expect(fixtures.limits.format).toBe("nostrseal-implementation-limits-v0");
    expect(fixtures.limits.name).toBe("nostrseal-v0");
    expect(fixtures.limits.limits.max_request_id_length).toBe(128);
    expect(fixtures.invalidVectors.map((vector) => vector.name)).toEqual(expect.arrayContaining([
      "nip46-connect-invalid-pubkey",
      "nip46-permission-malformed",
      "nip46-policy-method-unsupported",
      "nip46-policy-sign-event-kind-mismatch",
      "nip46-sign-event-param-not-json",
      "nip46-sign-event-param-unsafe-template",
      "qr-envelope-invalid-utf8",
      "qr-envelope-malformed",
      "qr-envelope-oversized",
      "qr-envelope-padded",
      "request-content-over-limit",
      "request-created-at-float",
      "request-created-at-negative",
      "request-created-at-string",
      "request-created-at-unsafe-integer",
      "request-event-template-id",
      "request-event-template-missing",
      "request-event-template-not-object",
      "request-event-template-pubkey",
      "request-event-template-sig",
      "request-get-capabilities-params",
      "request-get-public-key-params",
      "request-json-over-limit",
      "request-kind-float",
      "request-kind-negative",
      "request-kind-string",
      "request-kind-unsafe-integer",
      "request-sign-event-missing-params",
      "request-sign-event-params-not-object",
      "request-sign-event-unknown-param",
      "request-tag-field-too-long",
      "request-tag-item-not-string",
      "request-tags-not-array",
      "request-too-many-tags",
      "request-unknown-top-level-field",
      "response-error-with-result",
      "response-signing-status-enabled-with-missing-gates",
      "response-success-ambiguous-result",
      "response-unknown-top-level-field",
      "serial-frame-checksum-mismatch",
      "serial-frame-malformed-payload",
      "serial-frame-oversized",
      "serial-frame-request-invalid-request-id",
      "serial-frame-request-invalid-version"
    ]));
  });
});
