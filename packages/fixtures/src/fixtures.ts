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
};

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadSpecsFixtures(specsRoot: string): SpecsFixtureSet {
  const eventsRoot = resolve(specsRoot, "vectors/events");
  const eventFiles = readdirSync(eventsRoot)
    .filter((file) => file.endsWith(".json"))
    .sort();
  return {
    key: loadJson(resolve(specsRoot, "vectors/keys/test-key-1.json")) as SpecsFixtureSet["key"],
    events: eventFiles.map((file) => loadJson(resolve(eventsRoot, file)) as SpecsFixtureSet["events"][number])
  };
}

