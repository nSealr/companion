#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { root } from "./package_set.mjs";

function expectRejectedOutput(path) {
  const result = spawnSync(process.execPath, ["scripts/prepare_release_artifacts.mjs", "--out", path], {
    cwd: root,
    encoding: "utf-8"
  });
  assert.notEqual(result.status, 0, `${path} must be rejected before release artifact cleanup`);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /release artifact output directory must be a child of release-artifacts\//u,
    `${path} must fail with the release output safety guard`
  );
}

for (const path of [".", "packages", "release-artifacts", "release-artifacts/.."]) {
  expectRejectedOutput(path);
}

console.log("companion release artifact output safety check passed");
