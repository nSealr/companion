import { describe, expect, it } from "vitest";
import { loadSpecsFixtures } from "../../fixtures/src/fixtures.js";
import { resolveSpecsRoot } from "../../fixtures/src/specs-root.js";
import { reviewEventTemplate } from "./review.js";

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
});
