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
    "service": "@nsealr/service",
}
DEEP_SOURCE_IMPORT_RE = re.compile(r'from\s+["\'](?:\.\./){2,}[^"\']*/src/|from\s+["\'][^"\']*packages/[^"\']*/src/')


def expected_license_marker() -> str:
    return LICENSE_MARKERS.get(REPO, "MIT License")


def verify_companion_tooling(errors: list[str]) -> None:
    package_path = ROOT / "package.json"
    makefile_path = ROOT / "Makefile"
    if not package_path.exists() or not makefile_path.exists():
        return

    package = json.loads(package_path.read_text(encoding="utf-8"))
    if package.get("packageManager") != "pnpm@10.33.4":
        errors.append("package.json must pin packageManager to pnpm@10.33.4")

    makefile = makefile_path.read_text(encoding="utf-8")
    if "PNPM_VERSION := 10.33.4" not in makefile:
        errors.append("Makefile must declare PNPM_VERSION := 10.33.4")
    if "npm exec --yes --package=pnpm@$(PNPM_VERSION) -- pnpm" not in makefile:
        errors.append("Makefile must provide a pinned npm exec fallback for pnpm")


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
    for package_dir, package_name in COMPANION_PACKAGES.items():
        package_root = ROOT / "packages" / package_dir
        package_json_path = package_root / "package.json"
        index_path = package_root / "src" / "index.ts"
        if not package_json_path.exists():
            errors.append(f"missing package manifest: packages/{package_dir}/package.json")
            continue
        if not index_path.exists():
            errors.append(f"missing package entrypoint: packages/{package_dir}/src/index.ts")
        package = read_json(package_json_path, errors)
        if package.get("name") != package_name:
            errors.append(f"packages/{package_dir}/package.json must be named {package_name}")
        if package.get("type") != "module":
            errors.append(f"packages/{package_dir}/package.json must declare type=module")
        if package.get("exports") is None:
            errors.append(f"packages/{package_dir}/package.json must declare explicit exports")
        if package.get("types") != "./src/index.ts":
            errors.append(f"packages/{package_dir}/package.json must expose ./src/index.ts types")
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
