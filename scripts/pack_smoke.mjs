#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const publicPackages = [
  "@nsealr/browser-provider",
  "@nsealr/client",
  "@nsealr/core",
  "@nsealr/fixtures",
  "@nsealr/framing",
  "@nsealr/nip46",
  "@nsealr/policy",
  "@nsealr/protocol",
  "@nsealr/qr",
  "@nsealr/review",
  "@nsealr/smartcard",
  "@nsealr/transport"
];

function packageManagerCommand() {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath?.endsWith(".js") || npmExecPath?.endsWith(".cjs")) {
    return { command: process.execPath, prefixArgs: [npmExecPath] };
  }
  return { command: npmExecPath ?? "pnpm", prefixArgs: [] };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf-8", ...options });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

function cleanNpmConsumerEnv() {
  const env = { ...process.env, npm_config_loglevel: "error" };
  for (const key of Object.keys(env)) {
    if (key.startsWith("npm_config_") && key !== "npm_config_loglevel") {
      delete env[key];
    }
  }
  return env;
}

function packageDirName(packageName) {
  return packageName.replace("@nsealr/", "");
}

function sourceManifest(packageName) {
  return JSON.parse(readFileSync(new URL(`../packages/${packageDirName(packageName)}/package.json`, import.meta.url), "utf-8"));
}

function packageFilename(manifest) {
  return `${manifest.name.replace("@", "").replace("/", "-")}-${manifest.version}.tgz`;
}

function assertNoWorkspaceProtocols(value, path = "package.json") {
  if (typeof value === "string") {
    assert(!value.startsWith("workspace:"), `${path} must not contain workspace protocol dependencies`);
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertNoWorkspaceProtocols(item, `${path}[${index}]`);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      assertNoWorkspaceProtocols(item, `${path}.${key}`);
    }
  }
}

const packageManager = packageManagerCommand();
const packDir = mkdtempSync(join(tmpdir(), "nsealr-pack-"));
const consumerDir = mkdtempSync(join(tmpdir(), "nsealr-pack-consumer-"));
const tarballs = new Map();

for (const packageName of publicPackages) {
  const expectedManifest = sourceManifest(packageName);
  run(packageManager.command, [
    ...packageManager.prefixArgs,
    "--filter",
    packageName,
    "pack",
    "--pack-destination",
    packDir
  ]);
  const tarball = join(packDir, packageFilename(expectedManifest));
  tarballs.set(packageName, tarball);

  const contents = capture("tar", ["-tzf", tarball]);
  assert(contents.includes("package/package.json\n"), `${packageName} tarball must include package.json`);
  assert(contents.includes("package/README.md\n"), `${packageName} tarball must include README.md`);
  assert(contents.includes("package/dist/index.js\n"), `${packageName} tarball must include dist/index.js`);
  assert(contents.includes("package/dist/index.d.ts\n"), `${packageName} tarball must include dist/index.d.ts`);
  assert(!contents.includes("package/src/"), `${packageName} tarball must not include source or tests`);

  const manifest = JSON.parse(capture("tar", ["-xOf", tarball, "package/package.json"]));
  assert.equal(manifest.name, packageName);
  assert.equal(manifest.version, expectedManifest.version);
  assert.equal(manifest.private, undefined, `${packageName} public tarball must not be private`);
  assertNoWorkspaceProtocols(manifest);
}

writeFileSync(join(consumerDir, "package.json"), JSON.stringify({
  name: "nsealr-packed-consumer-smoke",
  version: "0.0.0",
  private: true,
  type: "module",
  dependencies: Object.fromEntries(publicPackages.map((packageName) => [packageName, `file:${tarballs.get(packageName)}`]))
}, null, 2));

writeFileSync(join(consumerDir, "index.mjs"), `
import assert from "node:assert/strict";

const packages = ${JSON.stringify(publicPackages, null, 2)};
for (const packageName of packages) {
  const module = await import(packageName);
  assert(Object.keys(module).length > 0, packageName + " must import from packed tarball");
}

const { computeEventId } = await import("@nsealr/core");
const { validateRequest } = await import("@nsealr/protocol");

assert.equal(validateRequest({
  version: 1,
  request_id: "packed-consumer-get-public-key",
  method: "get_public_key"
}).ok, true);
assert.equal(computeEventId({
  pubkey: "0".repeat(64),
  created_at: 1,
  kind: 1,
  tags: [],
  content: "packed consumer smoke"
}).length, 64);

console.log("nSealr packed package smoke passed");
`);

run("npm", ["install", "--ignore-scripts", "--no-audit", "--fund=false"], { cwd: consumerDir, env: cleanNpmConsumerEnv() });
run("node", ["index.mjs"], { cwd: consumerDir });
