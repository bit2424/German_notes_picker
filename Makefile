VERSION ?= 0.1.0

export VERSION

.PHONY: up down restart rebuild logs logs-backend logs-frontend status version \
        dev-backend dev-frontend down-backend down-frontend restart-backend restart-frontend

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
