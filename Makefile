.PHONY: setup test lint audit docs ci

setup:
	pnpm install

test:
	python3 scripts/verify_repo.py
	pnpm test

lint:
	python3 scripts/verify_repo.py
	pnpm lint

audit:
	python3 scripts/verify_repo.py
	pnpm audit --prod

docs:
	python3 scripts/verify_repo.py

ci: setup test lint audit docs
