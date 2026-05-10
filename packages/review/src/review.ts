import { createHash } from "node:crypto";

export type EventReview = {
  kind: number;
  created_at: number;
  author_pubkey: string;
  content: string;
  content_utf8_bytes: number;
  tag_count: number;
  tags: string[][];
};

export type ReviewPage = {
  title: string;
  lines: string[];
  action: "next" | "approve_or_reject";
};

export type ScreenReview = {
  format: "screen-pages";
  request_id: string;
  approval_digest: string;
  pages: ReviewPage[];
};

export const DEVELOPMENT_REVIEW_AUTHOR_PUBKEY =
  "4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function requireTemplate(value: unknown): {
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
} {
  if (!isRecord(value)) throw new Error("event_template must be an object");
  for (const field of ["created_at", "kind", "tags", "content"] as const) {
    if (!(field in value)) throw new Error(`event_template missing ${field}`);
  }
  if (!isNonNegativeInteger(value.created_at)) throw new Error("created_at must be a non-negative integer");
  if (!isNonNegativeInteger(value.kind)) throw new Error("kind must be a non-negative integer");
  if (typeof value.content !== "string") throw new Error("content must be a string");
  if (!Array.isArray(value.tags) || !value.tags.every((tag) => Array.isArray(tag) && tag.every((item) => typeof item === "string"))) {
    throw new Error("tags must be an array of string arrays");
  }
  return {
    created_at: value.created_at,
    kind: value.kind,
    tags: value.tags,
    content: value.content
  };
}

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function reviewEventTemplate(
  value: unknown,
  authorPubkey = DEVELOPMENT_REVIEW_AUTHOR_PUBKEY
): EventReview {
  const template = requireTemplate(value);

  return {
    kind: template.kind,
    created_at: template.created_at,
    author_pubkey: authorPubkey,
    content: template.content,
    content_utf8_bytes: utf8ByteLength(template.content),
    tag_count: template.tags.length,
    tags: template.tags
  };
}

function tagPageLines(review: EventReview): string[] {
  if (review.tag_count === 0) return ["No tags"];
  return review.tags.flatMap((tag, index) => {
    const lines = [`Tag ${index + 1}/${review.tag_count}`];
    if (tag.length === 0) return [...lines, "empty tag"];
    return [...lines, ...tag.map((item) => String(item))];
  });
}

export function renderReviewPages(review: EventReview): ReviewPage[] {
  const pages: ReviewPage[] = [
    {
      title: "Event",
      lines: [`Kind ${review.kind}`, `Created ${review.created_at}`, "Author", String(review.author_pubkey)],
      action: "next"
    },
    {
      title: "Content",
      lines: [String(review.content)],
      action: "next"
    },
    {
      title: "Tags",
      lines: tagPageLines(review),
      action: "next"
    },
    {
      title: "Decision",
      lines: ["Approve signing only if all pages match."],
      action: "approve_or_reject"
    }
  ];
  return pages;
}

function requireSignEventRequest(value: unknown): {
  version: 1;
  request_id: string;
  method: "sign_event";
  params: { event_template: unknown };
} {
  if (!isRecord(value)) throw new Error("screen review requires request object");
  if (value.version !== 1) throw new Error("screen review requires version 1");
  if (typeof value.request_id !== "string") throw new Error("screen review requires request_id");
  if (value.method !== "sign_event") throw new Error("screen review supports sign_event requests only");
  if (!isRecord(value.params) || !("event_template" in value.params)) {
    throw new Error("screen review requires params.event_template");
  }
  return {
    version: 1,
    request_id: value.request_id,
    method: "sign_event",
    params: { event_template: value.params.event_template }
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("unsupported value in approval digest");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new Error("unsupported value in approval digest");
}

function approvalDigestForScreenReview(
  request: ReturnType<typeof requireSignEventRequest>,
  review: EventReview,
  pages: ReviewPage[]
): string {
  const payload = {
    version: request.version,
    method: request.method,
    request_id: request.request_id,
    event_template: request.params.event_template,
    review,
    pages
  };
  return createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
}

export function screenReviewForRequest(
  value: unknown,
  authorPubkey = DEVELOPMENT_REVIEW_AUTHOR_PUBKEY
): ScreenReview {
  const request = requireSignEventRequest(value);
  const review = reviewEventTemplate(request.params.event_template, authorPubkey);
  const pages = renderReviewPages(review);
  return {
    format: "screen-pages",
    request_id: request.request_id,
    approval_digest: approvalDigestForScreenReview(request, review, pages),
    pages
  };
}

export function approvalDigestForRequest(value: unknown, authorPubkey = DEVELOPMENT_REVIEW_AUTHOR_PUBKEY): string {
  return screenReviewForRequest(value, authorPubkey).approval_digest;
}
