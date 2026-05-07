import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSpecsFixtures } from "./fixtures.js";

describe("fixture loading", () => {
  it("loads deterministic event vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolve("../specs"));
    expect(fixtures.events.map((event) => event.name)).toEqual(["kind-1-basic", "kind-1-tags"]);
    expect(fixtures.key.name).toBe("test-key-1");
  });

  it("loads trusted review vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolve("../specs"));
    expect(fixtures.reviews.map((review) => review.name)).toEqual([
      "kind-1-basic",
      "kind-1-long-events-many-tags",
      "kind-1-tags",
      "kind-30078-empty"
    ]);
    expect(fixtures.reviews[1].review.warnings).toEqual(["Long content.", "Event references other events.", "Many tags."]);
    expect(fixtures.reviews[3].review.warnings).toEqual(["Unknown event kind.", "Empty content."]);
  });
});
