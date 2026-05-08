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
  reviewDisplayFrames: Array<{
    name: string;
    format: string;
    source_review_vector: string;
    page_index: number;
    limits: {
      max_title_chars: number;
      max_body_lines: number;
      max_line_chars: number;
    };
    frame: {
      title: string;
      page_indicator: string;
      body_lines: string[];
      action_hint: string;
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
  nip46Payloads: Array<{
    name: string;
    format: string;
    request_message: {
      id: string;
      method: string;
      params: string[];
    };
    permission_requirement?: {
      method: string;
      parameter?: string;
      event_kind?: number;
    };
    permission_checks?: Array<{
      granted_permissions: Array<{
        method: string;
        parameter?: string;
        event_kind?: number;
      }>;
      permitted: boolean;
    }>;
    bridge_decisions?: Array<{
      granted_permissions: Array<{
        method: string;
        parameter?: string;
        event_kind?: number;
      }>;
      decision: unknown;
    }>;
    nostrseal_request?: unknown;
    nostrseal_response?: unknown;
    response_message?: {
      id: string;
      result?: string;
      error?: string;
    };
    local_response_message?: {
      id: string;
      result?: string;
      error?: string;
    };
    connect_intent?: {
      id: string;
      remote_signer_pubkey: string;
      secret?: string;
      requested_permissions: Array<{
        method: string;
        parameter?: string;
        event_kind?: number;
      }>;
    };
  }>;
  nip46PolicyFiles: Array<{
    name: string;
    format: string;
    approved_permissions: Array<{
      method: string;
      parameter?: string;
      event_kind?: number;
    }>;
  }>;
  limits: {
    format: string;
    name: string;
    limits: Record<string, number>;
    integer_policy: Record<string, unknown>;
  };
  invalidVectors: Array<{
    name: string;
    format: string;
    category: "signing-request" | "qr-envelope" | "serial-frame" | "nip46" | "nip46-policy-file";
    expected_error: string;
    request?: unknown;
    envelope?: string;
    frame?: string;
    request_message?: unknown;
    policy_file?: unknown;
  }>;
};

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fileStem(file: string): string {
  return file.replace(/\.json$/, "");
}

export function loadSpecsFixtures(specsRoot: string): SpecsFixtureSet {
  const eventsRoot = resolve(specsRoot, "vectors/events");
  const reviewsRoot = resolve(specsRoot, "vectors/review");
  const reviewDisplayFramesRoot = resolve(specsRoot, "vectors/review-display-frames");
  const reviewTranscriptsRoot = resolve(specsRoot, "vectors/review-transcripts");
  const nip46Root = resolve(specsRoot, "vectors/nip46");
  const nip46PolicyFilesRoot = resolve(specsRoot, "vectors/nip46-policy-files");
  const invalidVectorsRoot = resolve(specsRoot, "vectors/invalid");
  const eventFiles = readdirSync(eventsRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const reviewFiles = readdirSync(reviewsRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const reviewDisplayFrameFiles = readdirSync(reviewDisplayFramesRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const reviewTranscriptFiles = readdirSync(reviewTranscriptsRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const nip46Files = readdirSync(nip46Root)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const nip46PolicyFiles = readdirSync(nip46PolicyFilesRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  const invalidVectorFiles = readdirSync(invalidVectorsRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  return {
    key: loadJson(resolve(specsRoot, "vectors/keys/test-key-1.json")) as SpecsFixtureSet["key"],
    limits: loadJson(resolve(specsRoot, "vectors/limits/nseal-v0.json")) as SpecsFixtureSet["limits"],
    events: eventFiles.map((file) => loadJson(resolve(eventsRoot, file)) as SpecsFixtureSet["events"][number]),
    reviews: reviewFiles.map((file) => loadJson(resolve(reviewsRoot, file)) as SpecsFixtureSet["reviews"][number]),
    reviewDisplayFrames: reviewDisplayFrameFiles.map(
      (file) => loadJson(resolve(reviewDisplayFramesRoot, file)) as SpecsFixtureSet["reviewDisplayFrames"][number]
    ),
    reviewTranscripts: reviewTranscriptFiles.map(
      (file) => loadJson(resolve(reviewTranscriptsRoot, file)) as SpecsFixtureSet["reviewTranscripts"][number]
    ),
    nip46Payloads: nip46Files.map(
      (file) => loadJson(resolve(nip46Root, file)) as SpecsFixtureSet["nip46Payloads"][number]
    ),
    nip46PolicyFiles: nip46PolicyFiles.map(
      (file) =>
        ({
          ...(loadJson(resolve(nip46PolicyFilesRoot, file)) as Record<string, unknown>),
          name: fileStem(file)
        }) as SpecsFixtureSet["nip46PolicyFiles"][number]
    ),
    invalidVectors: invalidVectorFiles.map(
      (file) => loadJson(resolve(invalidVectorsRoot, file)) as SpecsFixtureSet["invalidVectors"][number]
    )
  };
}
