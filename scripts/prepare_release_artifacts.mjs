#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  assertPublicPackageTarball,
  packageFilename,
  packageManagerCommand,
  publicPackages,
  run,
  sourceManifest
} from "./package_set.mjs";

function outputDirectoryFromArgs(args) {
  const outIndex = args.indexOf("--out");
  if (outIndex === -1) return resolve("release-artifacts/packages");
  const value = args[outIndex + 1];
  if (!value) throw new Error("--out requires a directory");
  return resolve(value);
}

const outDir = outputDirectoryFromArgs(process.argv.slice(2));
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const packageManager = packageManagerCommand();
const artifacts = [];

for (const packageName of publicPackages) {
  const expectedManifest = sourceManifest(packageName);
  run(packageManager.command, [
    ...packageManager.prefixArgs,
    "--filter",
    packageName,
    "pack",
    "--pack-destination",
    outDir
  ]);
  const tarball = join(outDir, packageFilename(expectedManifest));
  assertPublicPackageTarball(packageName, tarball, expectedManifest);
  artifacts.push({
    name: packageName,
    version: expectedManifest.version,
    file: basename(tarball)
  });
}

writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify({
  format: "nsealr-companion-release-artifacts-v0",
  packages: artifacts
}, null, 2)}\n`, "utf8");

console.log(`nSealr package release artifacts prepared in ${outDir}`);
