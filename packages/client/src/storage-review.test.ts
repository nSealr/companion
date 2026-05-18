import { describe, expect, it } from "vitest";
import {
  createLocalStorageReview,
  LOCAL_STORAGE_REVIEW_FORMAT,
  parseLocalStorageReview,
  parseLocalStorageReviewEntry
} from "./storage-review.js";

describe("local storage review", () => {
  it("creates digest-bound review metadata for explicit secretless storage locations", () => {
    const review = createLocalStorageReview([
      {
        purpose: "grant_store",
        path: "/Users/example/Library/Application Support/nSealr/local-grants.json",
        access: "write_new",
        contains_secret_material: false
      },
      {
        purpose: "account_store",
        path: "/Users/example/Library/Application Support/nSealr/accounts.json",
        access: "read_only",
        contains_secret_material: false
      }
    ]);

    expect(review).toEqual({
      format: LOCAL_STORAGE_REVIEW_FORMAT,
      storage_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      entries: [
        {
          purpose: "grant_store",
          path: "/Users/example/Library/Application Support/nSealr/local-grants.json",
          access: "write_new",
          contains_secret_material: false
        },
        {
          purpose: "account_store",
          path: "/Users/example/Library/Application Support/nSealr/accounts.json",
          access: "read_only",
          contains_secret_material: false
        }
      ],
      requires_user_approval: true,
      stores_production_secrets: false
    });
    expect(parseLocalStorageReview(review)).toEqual(review);
  });

  it("rejects ambiguous paths and secret-bearing storage claims before review", () => {
    expect(() => parseLocalStorageReviewEntry({
      purpose: "grant_store",
      path: "relative/local-grants.json",
      access: "write_new",
      contains_secret_material: false
    })).toThrow(/absolute/u);
    expect(() => parseLocalStorageReviewEntry({
      purpose: "grant_store",
      path: "~/Library/Application Support/nSealr/local-grants.json",
      access: "write_new",
      contains_secret_material: false
    })).toThrow(/expanded/u);
    expect(() => parseLocalStorageReviewEntry({
      purpose: "grant_store",
      path: "/Users/example/../local-grants.json",
      access: "write_new",
      contains_secret_material: false
    })).toThrow(/relative segments/u);
    expect(() => parseLocalStorageReviewEntry({
      purpose: "grant_store",
      path: "/Users/example/local-grants.json",
      access: "write_new",
      contains_secret_material: true
    })).toThrow(/secret material/u);
  });

  it("rejects duplicate locations and digest tampering", () => {
    const entry = {
      purpose: "grant_store",
      path: "/Users/example/Library/Application Support/nSealr/local-grants.json",
      access: "write_new",
      contains_secret_material: false
    };
    expect(() => createLocalStorageReview([entry, entry])).toThrow(/duplicated/u);

    const review = createLocalStorageReview([entry]);
    expect(() => parseLocalStorageReview({
      ...review,
      entries: [{
        ...review.entries[0],
        path: "/Users/example/Library/Application Support/nSealr/other-grants.json"
      }]
    })).toThrow(/digest mismatch/u);
  });
});
