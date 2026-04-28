VERSION ?= 0.1.0

export VERSION

.PHONY: up down restart rebuild logs logs-backend logs-frontend status version \
        dev-backend dev-frontend down-backend down-frontend restart-backend restart-frontend \
        lint lint-backend lint-frontend format format-backend format-frontend \
        typecheck typecheck-backend typecheck-frontend test test-backend \
        check check-backend check-frontend doctor

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

# ── Diagnostics ──────────────────────────────────────────────────
# Checks every common failure mode from past debugging sessions:
#   1. Docker daemon alive
#   2. Port 8001 / 5173 not stolen by another process
#   3. .env file exists with required keys
#   4. Containers running + healthy
#   5. Backend /api/health returns ok
#   6. Frontend reachable and proxying /api correctly

doctor:
	@echo "=== Docker daemon ==="
	@docker info >/dev/null 2>&1 \
		&& echo "  PASS  Docker daemon is responsive" \
		|| { echo "  FAIL  Docker daemon not responding — is Docker Desktop running?"; exit 1; }
	@echo ""
	@echo "=== Port conflicts ==="
	@if lsof -iTCP:8001 -sTCP:LISTEN -t >/dev/null 2>&1; then \
		PNAME=$$(lsof -iTCP:8001 -sTCP:LISTEN -n | tail -1 | awk '{print $$1}'); \
		DOCKER_PID=$$(docker compose ps -q backend 2>/dev/null); \
		if [ -n "$$DOCKER_PID" ]; then \
			echo "  PASS  Port 8001 held by backend container"; \
		else \
			echo "  WARN  Port 8001 in use by $$PNAME (not our container)"; \
		fi; \
	else \
		echo "  PASS  Port 8001 is free"; \
	fi
	@if lsof -iTCP:5173 -sTCP:LISTEN -t >/dev/null 2>&1; then \
		PNAME=$$(lsof -iTCP:5173 -sTCP:LISTEN -n | tail -1 | awk '{print $$1}'); \
		DOCKER_PID=$$(docker compose ps -q frontend 2>/dev/null); \
		if [ -n "$$DOCKER_PID" ]; then \
			echo "  PASS  Port 5173 held by frontend container"; \
		else \
			echo "  WARN  Port 5173 in use by $$PNAME (not our container)"; \
		fi; \
	else \
		echo "  PASS  Port 5173 is free"; \
	fi
	@echo ""
	@echo "=== Environment (.env) ==="
	@if [ -f .env ]; then \
		echo "  PASS  .env file exists"; \
		grep -q 'ANTHROPIC_API_KEY=.' .env 2>/dev/null && grep -v 'your-key-here' .env | grep -q 'ANTHROPIC_API_KEY=' \
			&& echo "  PASS  ANTHROPIC_API_KEY is set" \
			|| echo "  FAIL  ANTHROPIC_API_KEY is missing or placeholder"; \
		grep -q 'SUPABASE_URL=.' .env 2>/dev/null \
			&& echo "  PASS  SUPABASE_URL is set" \
			|| echo "  FAIL  SUPABASE_URL is missing"; \
		grep -q 'SUPABASE_KEY=.' .env 2>/dev/null && grep -v 'your-supabase-anon-key-here' .env | grep -q 'SUPABASE_KEY=' \
			&& echo "  PASS  SUPABASE_KEY is set" \
			|| echo "  FAIL  SUPABASE_KEY is missing or placeholder"; \
	else \
		echo "  FAIL  .env file not found — run: cp .env.example .env"; \
	fi
	@echo ""
	@echo "=== Containers ==="
	@BACKEND_STATE=$$(docker compose ps --format '{{.State}}' backend 2>/dev/null); \
	BACKEND_HEALTH=$$(docker compose ps --format '{{.Health}}' backend 2>/dev/null); \
	if [ "$$BACKEND_STATE" = "running" ]; then \
		if [ "$$BACKEND_HEALTH" = "healthy" ]; then \
			echo "  PASS  backend: running (healthy)"; \
		else \
			echo "  WARN  backend: running ($$BACKEND_HEALTH) — may still be starting"; \
		fi; \
	else \
		echo "  FAIL  backend: not running — run: make up"; \
	fi
	@FRONTEND_STATE=$$(docker compose ps --format '{{.State}}' frontend 2>/dev/null); \
	if [ "$$FRONTEND_STATE" = "running" ]; then \
		echo "  PASS  frontend: running"; \
	else \
		echo "  FAIL  frontend: not running — run: make up"; \
	fi
	@echo ""
	@echo "=== Backend health endpoint ==="
	@curl -sf http://localhost:8001/api/health >/dev/null 2>&1 \
		&& echo "  PASS  GET /api/health → 200" \
		|| echo "  FAIL  Backend not reachable at http://localhost:8001/api/health"
	@HEALTH=$$(curl -sf http://localhost:8001/api/health 2>/dev/null); \
	if [ -n "$$HEALTH" ]; then \
		echo "$$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); \
			print('  PASS  Supabase connected' if d.get('db_connected') else '  FAIL  Supabase NOT connected — check SUPABASE_URL/KEY'); \
			print('  PASS  Anthropic key present' if d.get('anthropic_key_set') else '  WARN  ANTHROPIC_API_KEY not set (agent calls will fail)')" 2>/dev/null; \
	fi
	@echo ""
	@echo "=== Frontend proxy ==="
	@curl -sf http://localhost:5173/api/health >/dev/null 2>&1 \
		&& echo "  PASS  Frontend proxy → backend works (http://localhost:5173/api/health)" \
		|| echo "  FAIL  Frontend not proxying to backend — check API_URL env var and vite.config.ts"
	@echo ""
	@echo "Done. Fix any FAIL items above, then run: make doctor"
