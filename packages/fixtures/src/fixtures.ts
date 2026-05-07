import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export type SpecsFixtureSet = {
  key: {
    name: string;
    secret_key: string;
    public_key: string;
  };
  events: Array<{
    name: string;
    request: unknown;
    response: unknown;
    event_id: string;
    signature: string;
  }>;
  reviews: Array<{
    name: string;
    request: unknown;
    review: {
      kind: number;
      kind_name: string;
      created_at: number;
      content_preview: string;
      content_length: number;
      tag_count: number;
      tag_summary: string[];
      warnings: string[];
    };
  }>;
  reviewTranscripts: Array<{
    name: string;
    format: string;
    source_vector: string;
    screen_review_vector: string;
    qr_envelope: string;
    request: unknown;
    approval_digest: string;
    buttons: string[];
    transcript: Array<{
      frame: {
        title: string;
        page_indicator: string;
        body_lines: string[];
        action_hint: string;
      };
      button: string;
      decision: boolean | null;
      approved_for_signing: boolean;
    }>;
  }>;
};

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadSpecsFixtures(specsRoot: string): SpecsFixtureSet {
  const eventsRoot = resolve(specsRoot, "vectors/events");
  const reviewsRoot = resolve(specsRoot, "vectors/review");
  const reviewTranscriptsRoot = resolve(specsRoot, "vectors/review-transcripts");
  const eventFiles = readdirSync(eventsRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const reviewFiles = readdirSync(reviewsRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const reviewTranscriptFiles = readdirSync(reviewTranscriptsRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  return {
    key: loadJson(resolve(specsRoot, "vectors/keys/test-key-1.json")) as SpecsFixtureSet["key"],
    events: eventFiles.map((file) => loadJson(resolve(eventsRoot, file)) as SpecsFixtureSet["events"][number]),
    reviews: reviewFiles.map((file) => loadJson(resolve(reviewsRoot, file)) as SpecsFixtureSet["reviews"][number]),
    reviewTranscripts: reviewTranscriptFiles.map(
      (file) => loadJson(resolve(reviewTranscriptsRoot, file)) as SpecsFixtureSet["reviewTranscripts"][number]
    )
  };
}
