#!/usr/bin/env python3
"""Verify baseline repository structure for nSealr repos."""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.name

COMMON_FILES = [
    "README.md",
    "LICENSE",
    "Makefile",
    ".pre-commit-config.yaml",
    "docs/architecture.md",
    "docs/testing.md",
    "docs/roadmap.md",
    "docs/audit-checklist.md",
    ".github/workflows/ci.yml",
]

REQUIRED_DIRS = {
    "specs": ["protocols", "schemas", "vectors", "examples", "docs", "scripts"],
    "companion": ["apps", "packages", "docs", "scripts"],
    "raspberry": ["app", "os", "docs", "scripts"],
    "esp32": ["firmware", "boards", "docs", "scripts"],
    "smartcard": ["applet", "tools", "docs", "scripts"],
    "hardware": ["pcb", "bom", "enclosures", "docs", "scripts"],
    "website": ["content", "public", "design", "docs", "scripts"],
    "lab": ["wiki", "sources", "scripts", "docs"],
}

LICENSE_MARKERS = {
    "specs": "Creative Commons CC0",
    "lab": "Creative Commons CC0",
    "hardware": "CERN Open Hardware Licence",
}

COMPANION_PACKAGES = {
    "browser-provider": "@nsealr/browser-provider",
    "client": "@nsealr/client",
    "core": "@nsealr/core",
    "dev-signer": "@nsealr/dev-signer",
    "fixtures": "@nsealr/fixtures",
    "framing": "@nsealr/framing",
    "nip46": "@nsealr/nip46",
    "policy": "@nsealr/policy",
    "protocol": "@nsealr/protocol",
    "qr": "@nsealr/qr",
    "review": "@nsealr/review",
    "smartcard": "@nsealr/smartcard",
    "transport": "@nsealr/transport",
}
COMPANION_APPS = {
    "cli": "@nsealr/cli",
    "consumer-smoke": "@nsealr/consumer-smoke",
    "sdk-examples": "@nsealr/sdk-examples",
    "service": "@nsealr/service",
}
DEEP_SOURCE_IMPORT_RE = re.compile(r'from\s+["\'](?:\.\./){2,}[^"\']*/src/|from\s+["\'][^"\']*packages/[^"\']*/src/')


def expected_license_marker() -> str:
    return LICENSE_MARKERS.get(REPO, "MIT License")


def verify_companion_tooling(errors: list[str]) -> None:
    package_path = ROOT / "package.json"
    makefile_path = ROOT / "Makefile"
    changelog_path = ROOT / "CHANGELOG.md"
    release_path = ROOT / "docs" / "release.md"
    sdk_examples_path = ROOT / "docs" / "sdk-examples.md"
    release_workflow_path = ROOT / ".github" / "workflows" / "package-release.yml"
    if not package_path.exists() or not makefile_path.exists():
        return

    package = json.loads(package_path.read_text(encoding="utf-8"))
    if package.get("packageManager") != "pnpm@10.33.4":
        errors.append("package.json must pin packageManager to pnpm@10.33.4")
    scripts = package.get("scripts")
    if not isinstance(scripts, dict):
        errors.append("package.json must expose repository scripts")
    elif scripts.get("build") != "node scripts/build_packages.mjs":
        errors.append("package.json must expose the deterministic package build script")
    elif scripts.get("consumer-smoke") != "pnpm --filter @nsealr/consumer-smoke smoke":
        errors.append("package.json must expose consumer-smoke through @nsealr/consumer-smoke")
    elif scripts.get("examples-smoke") != "pnpm --filter @nsealr/sdk-examples verify":
        errors.append("package.json must expose examples-smoke through @nsealr/sdk-examples")
    elif scripts.get("pack-smoke") != "node scripts/pack_smoke.mjs":
        errors.append("package.json must expose the packed tarball smoke script")
    elif scripts.get("release-artifacts") != "node scripts/prepare_release_artifacts.mjs --out release-artifacts/packages":
        errors.append("package.json must expose release-artifacts preparation")
    elif scripts.get("ci") != "pnpm build && pnpm typecheck && pnpm test && pnpm consumer-smoke && pnpm examples-smoke && pnpm pack-smoke":
        errors.append("package.json ci must build package artifacts and examples before checks")

    makefile = makefile_path.read_text(encoding="utf-8")
    if "PNPM_VERSION := 10.33.4" not in makefile:
        errors.append("Makefile must declare PNPM_VERSION := 10.33.4")
    if "npm exec --yes --package=pnpm@$(PNPM_VERSION) -- pnpm" not in makefile:
        errors.append("Makefile must provide a pinned npm exec fallback for pnpm")
    if "build:" not in makefile or "$(PNPM) build" not in makefile:
        errors.append("Makefile must build package artifacts before tests")
    if "package-smoke:" not in makefile or "$(PNPM) consumer-smoke" not in makefile:
        errors.append("Makefile must run the public package consumer smoke")
    if "examples-smoke:" not in makefile or "$(PNPM) examples-smoke" not in makefile:
        errors.append("Makefile must run the SDK examples smoke")
    if "pack-smoke:" not in makefile or "$(PNPM) pack-smoke" not in makefile:
        errors.append("Makefile must run the packed tarball smoke")
    if "release-artifacts:" not in makefile or "$(PNPM) release-artifacts" not in makefile:
        errors.append("Makefile must prepare release artifacts")

    if not changelog_path.exists() or "## Unreleased" not in changelog_path.read_text(encoding="utf-8"):
        errors.append("CHANGELOG.md must track unreleased package changes")
    for rel in ["scripts/package_set.mjs", "scripts/prepare_release_artifacts.mjs"]:
        if not (ROOT / rel).exists():
            errors.append(f"missing companion package release helper: {rel}")
    if not release_path.exists():
        errors.append("docs/release.md must document release policy")
    else:
        release_text = release_path.read_text(encoding="utf-8")
        if "npm publish --provenance" not in release_text or "make integration" not in release_text:
            errors.append("docs/release.md must document provenance and integration release gates")
    if not sdk_examples_path.exists():
        errors.append("docs/sdk-examples.md must document executable SDK examples")
    else:
        sdk_examples_text = sdk_examples_path.read_text(encoding="utf-8")
        if "make examples-smoke" not in sdk_examples_text or "@nsealr/sdk-examples" not in sdk_examples_text:
            errors.append("docs/sdk-examples.md must document make examples-smoke and @nsealr/sdk-examples")
    if not release_workflow_path.exists():
        errors.append(".github/workflows/package-release.yml must document package release rehearsal")
    else:
        release_workflow = release_workflow_path.read_text(encoding="utf-8")
        for marker in [
            "Package Release Rehearsal",
            "workflow_dispatch:",
            "make ci",
            "make release-artifacts",
            "actions/upload-artifact@v6",
            "FORCE_JAVASCRIPT_ACTIONS_TO_NODE24"
        ]:
            if marker not in release_workflow:
                errors.append(f"package release rehearsal workflow must include {marker}")
        if "npm publish" in release_workflow:
            errors.append("package release rehearsal workflow must not publish to npm")


def read_json(path: Path, errors: list[str]) -> dict[str, object]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        errors.append(f"invalid JSON in {path.relative_to(ROOT)}: {error}")
        return {}
    if not isinstance(value, dict):
        errors.append(f"{path.relative_to(ROOT)} must contain a JSON object")
        return {}
    return value


def verify_companion_package_boundaries(errors: list[str]) -> None:
    root_package = read_json(ROOT / "package.json", errors)
    for package_dir, package_name in COMPANION_PACKAGES.items():
        package_root = ROOT / "packages" / package_dir
        package_json_path = package_root / "package.json"
        readme_path = package_root / "README.md"
        index_path = package_root / "src" / "index.ts"
        if not package_json_path.exists():
            errors.append(f"missing package manifest: packages/{package_dir}/package.json")
            continue
        if not readme_path.exists():
            errors.append(f"missing package README: packages/{package_dir}/README.md")
        elif "## Boundary" not in readme_path.read_text(encoding="utf-8"):
            errors.append(f"packages/{package_dir}/README.md must document the package boundary")
        if not index_path.exists():
            errors.append(f"missing package entrypoint: packages/{package_dir}/src/index.ts")
        package = read_json(package_json_path, errors)
        if package.get("name") != package_name:
            errors.append(f"packages/{package_dir}/package.json must be named {package_name}")
        if package.get("version") != root_package.get("version"):
            errors.append(f"packages/{package_dir}/package.json must use the synchronized root package version")
        if package_dir == "dev-signer":
            if package.get("private") is not True:
                errors.append("packages/dev-signer/package.json must remain private")
        elif package.get("private") is True:
            errors.append(f"packages/{package_dir}/package.json must be publishable when release gates open")
        if package.get("type") != "module":
            errors.append(f"packages/{package_dir}/package.json must declare type=module")
        if package.get("files") != ["dist", "README.md"]:
            errors.append(f"packages/{package_dir}/package.json must publish only dist and README.md")
        exports = package.get("exports")
        if not isinstance(exports, dict):
            errors.append(f"packages/{package_dir}/package.json must declare explicit exports")
        else:
            root_export = exports.get(".")
            if (
                not isinstance(root_export, dict)
                or root_export.get("types") != "./dist/index.d.ts"
                or root_export.get("import") != "./dist/index.js"
            ):
                errors.append(f"packages/{package_dir}/package.json must export built dist entrypoints")
            if package_dir == "fixtures":
                specs_root_export = exports.get("./specs-root")
                if (
                    not isinstance(specs_root_export, dict)
                    or specs_root_export.get("types") != "./dist/specs-root.d.ts"
                    or specs_root_export.get("import") != "./dist/specs-root.js"
                ):
                    errors.append("packages/fixtures/package.json must export built specs-root entrypoint")
        if package.get("types") != "./dist/index.d.ts":
            errors.append(f"packages/{package_dir}/package.json must expose ./dist/index.d.ts types")
        dependencies = package.get("dependencies")
        if package_dir != "dev-signer" and isinstance(dependencies, dict) and "@nsealr/dev-signer" in dependencies:
            errors.append(f"packages/{package_dir} must not depend on test-only @nsealr/dev-signer")

    for app_dir, package_name in COMPANION_APPS.items():
        package_json_path = ROOT / "apps" / app_dir / "package.json"
        if not package_json_path.exists():
            errors.append(f"missing app manifest: apps/{app_dir}/package.json")
            continue
        package = read_json(package_json_path, errors)
        if package.get("name") != package_name:
            errors.append(f"apps/{app_dir}/package.json must be named {package_name}")

    for source_path in [*ROOT.glob("packages/*/src/**/*.ts"), *ROOT.glob("apps/*/src/**/*.ts")]:
        text = source_path.read_text(encoding="utf-8")
        if DEEP_SOURCE_IMPORT_RE.search(text):
            errors.append(
                f"{source_path.relative_to(ROOT)} must import other packages through @nsealr/* entrypoints"
            )


def main() -> int:
    errors: list[str] = []

    for rel in COMMON_FILES:
        path = ROOT / rel
        if not path.exists():
            errors.append(f"missing required file: {rel}")
        elif path.is_file() and not path.read_text(encoding="utf-8").strip():
            errors.append(f"empty required file: {rel}")

    for rel in REQUIRED_DIRS.get(REPO, []):
        if not (ROOT / rel).is_dir():
            errors.append(f"missing required directory: {rel}")

    license_path = ROOT / "LICENSE"
    if license_path.exists():
        license_text = license_path.read_text(encoding="utf-8", errors="replace")
        marker = expected_license_marker()
        if marker not in license_text:
            errors.append(f"LICENSE does not contain expected marker: {marker}")

    readme = ROOT / "README.md"
    if readme.exists():
        readme_text = readme.read_text(encoding="utf-8")
        if "## License" not in readme_text:
            errors.append("README.md must include a License section")

    if REPO == "companion":
        verify_companion_tooling(errors)
        verify_companion_package_boundaries(errors)

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print(f"nSealr {REPO} baseline verification passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
