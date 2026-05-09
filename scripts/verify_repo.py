#!/usr/bin/env python3
"""Verify baseline repository structure for NostrSeal repos."""

from __future__ import annotations

import json
from pathlib import Path
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

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print(f"NostrSeal {REPO} baseline verification passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
