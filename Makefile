VERSION ?= 0.1.0

export VERSION

.PHONY: up down restart rebuild logs logs-backend logs-frontend status version

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
	docker compose down
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
