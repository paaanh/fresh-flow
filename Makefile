.PHONY: up down logs api-test web-typecheck web-build

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

api-test:
	python -m pytest -o pythonpath=apps/api apps/api/app/tests

web-typecheck:
	cd apps/web && npm run typecheck

web-build:
	cd apps/web && npm run build
