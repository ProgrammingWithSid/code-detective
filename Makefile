clean: 
	npm run clean
format: 
	npm run format
lint:
	npm run lint

test:
	npm run test

build: clean lint format test
	npm run build

minor: build
	npm version minor && npm publish

major: build
	npm version major && npm publish

patch: build
	npm version patch && npm publish
