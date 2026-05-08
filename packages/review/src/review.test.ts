import { describe, expect, it } from "vitest";
import { loadSpecsFixtures } from "../../fixtures/src/fixtures.js";
import { resolveSpecsRoot } from "../../fixtures/src/specs-root.js";
import { approvalDigestForRequest, reviewEventTemplate, screenReviewForRequest } from "./review.js";

describe("trusted review model", () => {
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
});
