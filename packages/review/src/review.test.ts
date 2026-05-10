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
});
