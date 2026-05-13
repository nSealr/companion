PNPM_VERSION := 10.33.4
PNPM ?= $(shell command -v pnpm >/dev/null 2>&1 && printf '%s' pnpm || printf '%s' 'npm exec --yes --package=pnpm@$(PNPM_VERSION) -- pnpm')

.PHONY: setup build test package-smoke pack-smoke lint audit docs ci

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

pack-smoke: build
	python3 scripts/verify_repo.py
	$(PNPM) pack-smoke

lint: build
	python3 scripts/verify_repo.py
	$(PNPM) lint

audit:
	python3 scripts/verify_repo.py
	$(PNPM) audit --prod

docs:
	python3 scripts/verify_repo.py

ci: setup build test package-smoke pack-smoke lint audit docs
