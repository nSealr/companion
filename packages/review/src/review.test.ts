import { describe, expect, it } from "vitest";
import { loadSpecsFixtures } from "../../fixtures/src/fixtures.js";
import { resolveSpecsRoot } from "../../fixtures/src/specs-root.js";
import {
  approvalDigestForRequest,
  REVIEW_DETAIL_BODY_LINE_STYLES,
  renderReviewDetailPages,
  reviewEventTemplate,
  screenReviewForRequest
} from "./review.js";

describe("trusted review model", () => {
  it("exports only the shared review detail-page body styles", () => {
    expect(REVIEW_DETAIL_BODY_LINE_STYLES).toEqual(["meta", "normal", "value"]);
  });

  it("matches every shared trusted-review vector", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());

    for (const vector of fixtures.reviews) {
      const request = vector.request as {
        params: { event_template: unknown };
      };

      expect(reviewEventTemplate(request.params.event_template)).toEqual(vector.review);
    }
  });

  it("matches every shared trusted review-screen vector and approval digest", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());

    for (const vector of fixtures.reviewScreens) {
      expect(screenReviewForRequest(vector.request)).toEqual(vector.screen_review);
      expect(approvalDigestForRequest(vector.request)).toBe(vector.screen_review.approval_digest);
    }
  });

  it("matches every shared review detail-page vector", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());

    for (const vector of fixtures.reviewDetailPages) {
      const reviewVector = fixtures.reviews.find((review) => review.name === vector.source_review_vector);
      expect(reviewVector).toBeDefined();
      expect(renderReviewDetailPages(reviewVector!.review, vector.limits)).toEqual(vector.pages);
      expect(approvalDigestForRequest(reviewVector!.request)).toBe(vector.approval_digest);
    }
  });

  it("renders decoded JSON control characters as visible escapes", () => {
    const pages = renderReviewDetailPages(
      {
        kind: 1,
        created_at: 1710000480,
        author_pubkey: "4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa",
        content: "line 1\nline 2\tTabbed\rCarriage\bBackspace\fFormfeed",
        content_utf8_bytes: 48,
        tag_count: 2,
        tags: [
          ["t", "line\nbreak"],
          ["subject", "tab\tvalue", "carriage\rreturn"]
        ]
      },
      {
        max_title_chars: 18,
        max_body_lines: 5,
        max_line_chars: 26,
        max_compact_body_lines: 9,
        max_compact_line_chars: 48
      }
    );

    expect(pages[1].lines).toContain("line 1\\nline 2\\tTabbed\\rCarriage\\bBackspace\\fFor");
    expect(pages[2].lines).toContain("line\\nbreak");
    expect(pages[2].lines).toContain("tab\\tvalue");
    expect(pages[2].lines).toContain("carriage\\rreturn");
  });
});
