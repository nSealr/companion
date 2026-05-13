import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

export const publicPackages = [
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

export function packageManagerCommand() {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath?.endsWith(".js") || npmExecPath?.endsWith(".cjs")) {
    return { command: process.execPath, prefixArgs: [npmExecPath] };
  }
  return { command: npmExecPath ?? "pnpm", prefixArgs: [] };
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

export function capture(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf-8", ...options });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

export function packageDirName(packageName) {
  return packageName.replace("@nsealr/", "");
}

export function sourceManifest(packageName) {
  return JSON.parse(readFileSync(join(root, "packages", packageDirName(packageName), "package.json"), "utf-8"));
}

export function packageFilename(manifest) {
  return `${manifest.name.replace("@", "").replace("/", "-")}-${manifest.version}.tgz`;
}

export function assertNoWorkspaceProtocols(value, path = "package.json") {
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

export function assertPublicPackageTarball(packageName, tarball, expectedManifest) {
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
