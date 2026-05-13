PNPM_VERSION := 10.33.4
PNPM ?= $(shell command -v pnpm >/dev/null 2>&1 && printf '%s' pnpm || printf '%s' 'npm exec --yes --package=pnpm@$(PNPM_VERSION) -- pnpm')

.PHONY: setup test package-smoke lint audit docs ci

setup:
	$(PNPM) install

test:
	python3 scripts/verify_repo.py
	$(PNPM) test

package-smoke:
	python3 scripts/verify_repo.py
	$(PNPM) consumer-smoke

lint:
	python3 scripts/verify_repo.py
	$(PNPM) lint

audit:
	python3 scripts/verify_repo.py
	$(PNPM) audit --prod

docs:
	python3 scripts/verify_repo.py

ci: setup test package-smoke lint audit docs
