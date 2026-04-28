VERSION ?= 0.1.0

export VERSION

.PHONY: up down restart rebuild logs logs-backend logs-frontend status version \
        dev-backend dev-frontend down-backend down-frontend restart-backend restart-frontend \
        lint lint-backend lint-frontend format format-backend format-frontend \
        typecheck typecheck-backend typecheck-frontend test test-backend \
        check check-backend check-frontend

version:
	@echo "Backend:  german-notes-backend:$(VERSION)"
	@echo "Frontend: german-notes-frontend:$(VERSION)"

up:
	docker compose up -d

down:
	docker compose down

restart:
	docker compose restart

rebuild:
	docker compose down -v
	docker compose build --no-cache
	docker compose up -d

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

logs-frontend:
	docker compose logs -f frontend

status:
	docker compose ps

dev-backend:
	docker compose up -d backend

dev-frontend:
	docker compose up -d frontend

down-backend:
	docker compose stop backend

down-frontend:
	docker compose stop frontend

restart-backend:
	docker compose restart backend

restart-frontend:
	docker compose restart frontend

# ── Quality checks ──────────────────────────────────────────────

lint-backend:
	poetry run ruff check .

lint-frontend:
	cd frontend && npm run lint

lint: lint-backend lint-frontend

format-backend:
	poetry run ruff format .
	poetry run ruff check . --fix

format-frontend:
	cd frontend && npm run format
	cd frontend && npm run lint:fix

format: format-backend format-frontend

typecheck-backend:
	poetry run mypy german_notes

typecheck-frontend:
	cd frontend && npm run typecheck

typecheck: typecheck-backend typecheck-frontend

test-backend:
	poetry run pytest

test: test-backend

# Run everything CI runs.
check-backend: lint-backend
	poetry run ruff format --check .
	$(MAKE) typecheck-backend
	$(MAKE) test-backend

check-frontend: lint-frontend
	cd frontend && npm run format:check
	$(MAKE) typecheck-frontend
	cd frontend && npm run build

check: check-backend check-frontend
