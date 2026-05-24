.PHONY: up down build logs migrate test seed

up:
	docker compose up --build -d
	@echo "API: http://localhost:8000  UI: http://localhost:5173  Docs: http://localhost:8000/docs"

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f

migrate:
	docker compose exec api alembic upgrade head

test:
	docker compose exec api pytest -v

seed:
	docker compose exec api python -m app.seed
