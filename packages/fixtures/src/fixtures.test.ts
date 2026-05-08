import { describe, expect, it } from "vitest";
import { loadSpecsFixtures } from "./fixtures.js";
import { resolveSpecsRoot } from "./specs-root.js";

describe("fixture loading", () => {
  it("loads deterministic event vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());
    expect(fixtures.events.map((event) => event.name)).toEqual(["kind-1-basic", "kind-1-tags"]);
    expect(fixtures.key.name).toBe("test-key-1");
  });

  it("loads trusted review vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());
    expect(fixtures.reviews.map((review) => review.name)).toEqual([
      "kind-1-basic",
      "kind-1-long-events-many-tags",
      "kind-1-tags",
      "kind-30078-empty"
    ]);
    expect(fixtures.reviews[1].review.warnings).toEqual(["Long content.", "Event references other events.", "Many tags."]);
    expect(fixtures.reviews[3].review.warnings).toEqual(["Unknown event kind.", "Empty content."]);
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

  it("loads review display-frame vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());
    expect(fixtures.reviewDisplayFrames.map((frame) => frame.name)).toEqual(["kind-1-long-content-page-1-20x3"]);
    expect(fixtures.reviewDisplayFrames[0].frame.body_lines).toEqual([
      "xxxxxxxxxxxxxxxxxxxx",
      "xxxxxxxxxxxxxxxxxxxx",
      "xxxxxxxxxxxxxxxxx..."
    ]);
  });

  it("loads NIP-46 decrypted payload bridge vectors from the specs repository", () => {
    const fixtures = loadSpecsFixtures(resolveSpecsRoot());
    expect(fixtures.nip46Payloads.map((vector) => vector.name)).toEqual([
      "connect-policy-review",
      "get-public-key",
      "ping",
      "sign-event-kind-1-basic",
      "sign-event-user-rejected"
    ]);
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
    expect(fixtures.invalidVectors.map((vector) => vector.name)).toEqual([
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
      "request-event-template-pubkey",
      "request-event-template-sig",
      "request-json-over-limit",
      "request-kind-float",
      "request-kind-negative",
      "request-kind-string",
      "request-kind-unsafe-integer",
      "request-tag-field-too-long",
      "request-tag-item-not-string",
      "request-tags-not-array",
      "request-too-many-tags",
      "request-unknown-top-level-field",
      "serial-frame-checksum-mismatch",
      "serial-frame-malformed-payload",
      "serial-frame-oversized"
    ]);
  });
});
