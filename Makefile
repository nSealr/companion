PNPM_VERSION := 10.33.4
PNPM ?= $(shell command -v pnpm >/dev/null 2>&1 && printf '%s' pnpm || printf '%s' 'npm exec --yes --package=pnpm@$(PNPM_VERSION) -- pnpm')

.PHONY: setup build test package-smoke examples-smoke readme-examples api-docs api-docs-update api-review browser-runtime-imports browser-runtime-bundle public-imports pack-smoke release-artifacts lint audit docs ci

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

browser-runtime-imports:
	python3 scripts/verify_repo.py
	$(PNPM) browser-runtime-imports:check

browser-runtime-bundle: build
	python3 scripts/verify_repo.py
	$(PNPM) browser-runtime-bundle:check

public-imports:
	python3 scripts/verify_repo.py
	$(PNPM) public-imports:check

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

ci: setup build test package-smoke examples-smoke readme-examples api-docs api-review browser-runtime-imports browser-runtime-bundle public-imports pack-smoke lint audit docs
