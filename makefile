all: compile

clean:
		rm -rf dist/

compile:
		node ../util-games-builder/build-game.js game.html

run:
		node ../util-games-builder/build-game.js game.html run

debug:
		node ../util-games-builder/build-game.js game.html debug

autobuild:
		node ../util-games-builder/run-from-source.js game.html

autobuild-local:
		node ../util-games-builder/run-from-source.js  --web-libs=../web-libs/ --web-path=../web-qrpr.eu/ game.html

.PHONY: clean compile run debug
.SILENT:
