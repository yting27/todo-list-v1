.PHONY: dev down reset test seed generate build logs

dev:
	docker compose up --build

down:
	docker compose down

reset:
	docker compose down --volumes --remove-orphans

test:
	npm test

seed:
	docker compose run --rm seed

generate:
	npm run generate

build:
	npm run build

logs:
	docker compose logs -f api relay web
