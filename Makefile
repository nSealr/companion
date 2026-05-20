PNPM_VERSION := 10.33.4
PNPM_GLOBAL_VERSION := $(shell command -v pnpm >/dev/null 2>&1 && pnpm --version 2>/dev/null || true)
ifeq ($(PNPM_GLOBAL_VERSION),$(PNPM_VERSION))
PNPM ?= pnpm
else
PNPM ?= npm exec --yes --package=pnpm@$(PNPM_VERSION) -- pnpm
endif

.PHONY: setup build test package-smoke examples-smoke readme-examples api-docs api-docs-update api-review package-registry browser-runtime-imports browser-runtime-bundle browser-extension-security public-imports release-plan release-plan-check release-artifacts-safety pack-smoke release-artifacts lint audit docs ci

setup:
	$(PNPM) install

build:
	python3 scripts/verify_repo.py
	$(PNPM) build

test: build
	python3 scripts/verify_repo.py
	$(PNPM) test

package-smoke: build
	python3 scripts/verify_repo.py
	$(PNPM) consumer-smoke

examples-smoke: build
	python3 scripts/verify_repo.py
	$(PNPM) examples-smoke

readme-examples: build
	python3 scripts/verify_repo.py
	$(PNPM) readme-examples:check

api-docs:
	python3 scripts/verify_repo.py
	$(PNPM) api-docs:check

api-docs-update:
	$(PNPM) api-docs:update

api-review:
	python3 scripts/verify_repo.py
	$(PNPM) api-review:check

package-registry:
	python3 scripts/verify_repo.py
	$(PNPM) package-registry:check

browser-runtime-imports:
	python3 scripts/verify_repo.py
	$(PNPM) browser-runtime-imports:check

browser-runtime-bundle: build
	python3 scripts/verify_repo.py
	$(PNPM) browser-runtime-bundle:check

browser-extension-security:
	python3 scripts/verify_repo.py
	$(PNPM) browser-extension-security:check

public-imports:
	python3 scripts/verify_repo.py
	$(PNPM) public-imports:check

release-plan:
	python3 scripts/verify_repo.py
	$(PNPM) release-plan

release-plan-check:
	python3 scripts/verify_repo.py
	$(PNPM) release-plan:check

release-artifacts-safety:
	python3 scripts/verify_repo.py
	$(PNPM) release-artifacts:safety

pack-smoke: build
	python3 scripts/verify_repo.py
	$(PNPM) pack-smoke

release-artifacts: build
	python3 scripts/verify_repo.py
	$(PNPM) release-artifacts

lint: build
	python3 scripts/verify_repo.py
	$(PNPM) lint

audit:
	python3 scripts/verify_repo.py
	$(PNPM) audit --prod

docs:
	python3 scripts/verify_repo.py
	$(PNPM) api-docs:check
	$(PNPM) api-review:check

ci: setup build test package-smoke examples-smoke readme-examples api-docs api-review package-registry browser-runtime-imports browser-runtime-bundle browser-extension-security public-imports release-plan-check release-artifacts-safety pack-smoke lint audit docs
