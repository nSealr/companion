import { createHash } from "node:crypto";

export type EventReview = {
  kind: number;
  kind_name: string;
  created_at: number;
  content_preview: string;
  content_length: number;
  tag_count: number;
  tag_summary: string[];
  warnings: string[];
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

const KIND_NAMES = new Map<number, string>([
  [0, "Metadata"],
  [1, "Short Text Note"],
  [3, "Contacts"],
  [6, "Repost"],
  [7, "Reaction"],
  [9735, "Zap Receipt"]
]);

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

function textLength(value: string): number {
  return Array.from(value).length;
}

function textPrefix(value: string, length: number): string {
  return Array.from(value).slice(0, length).join("");
}

function contentPreview(content: string): string {
  return textLength(content) <= 120 ? content : `${textPrefix(content, 120)}...`;
}

function tagSummary(tags: string[][]): string[] {
  return tags.flatMap((tag) => {
    if (tag.length === 0) return [];
    const name = tag[0] ?? "";
    let value = tag[1] ?? "";
    if ((name === "p" || name === "e") && textLength(value) > 8) {
      value = `${textPrefix(value, 8)}...`;
    }
    return [value.length > 0 ? `${name}: ${value}` : name];
  });
}

export function reviewEventTemplate(value: unknown): EventReview {
  const template = requireTemplate(value);
  const warnings: string[] = [];

  if (!KIND_NAMES.has(template.kind)) warnings.push("Unknown event kind.");
  if (textLength(template.content) > 280) warnings.push("Long content.");
  if (template.content.length === 0) warnings.push("Empty content.");
  if (template.tags.some((tag) => tag[0] === "p")) warnings.push("Event includes pubkey mentions.");
  if (template.tags.some((tag) => tag[0] === "e")) warnings.push("Event references other events.");
  if (template.tags.length > 8) warnings.push("Many tags.");

  return {
    kind: template.kind,
    kind_name: KIND_NAMES.get(template.kind) ?? "Unknown",
    created_at: template.created_at,
    content_preview: contentPreview(template.content),
    content_length: textLength(template.content),
    tag_count: template.tags.length,
    tag_summary: tagSummary(template.tags),
    warnings
  };
}

function tagPageLines(review: EventReview): string[] {
  if (review.tag_count === 0) return ["No tags"];
  const label = review.tag_count === 1 ? "1 tag" : `${review.tag_count} tags`;
  return [label, ...review.tag_summary.map((item) => String(item))];
}

export function renderReviewPages(review: EventReview): ReviewPage[] {
  const pages: ReviewPage[] = [
    {
      title: "Event",
      lines: [`Kind ${review.kind}`, String(review.kind_name), `Created ${review.created_at}`],
      action: "next"
    },
    {
      title: "Content",
      lines: [String(review.content_preview)],
      action: "next"
    },
    {
      title: "Tags",
      lines: tagPageLines(review),
      action: "next"
    }
  ];

  if (review.warnings.length > 0) {
    pages.push({
      title: "Warnings",
      lines: review.warnings.map((warning) => String(warning)),
      action: "approve_or_reject"
    });
  } else {
    pages.push({
      title: "Decision",
      lines: ["Approve signing only if all pages match."],
      action: "approve_or_reject"
    });
  }
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

export function screenReviewForRequest(value: unknown): ScreenReview {
  const request = requireSignEventRequest(value);
  const review = reviewEventTemplate(request.params.event_template);
  const pages = renderReviewPages(review);
  return {
    format: "screen-pages",
    request_id: request.request_id,
    approval_digest: approvalDigestForScreenReview(request, review, pages),
    pages
  };
}

export function approvalDigestForRequest(value: unknown): string {
  return screenReviewForRequest(value).approval_digest;
}
