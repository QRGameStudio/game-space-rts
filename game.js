// !G.import('assets/public/audio.js')
const { sin, cos, PI } = Math;
const $ = document.querySelector.bind(document);

// !G.import('src/index.js')

/**
 * @type {GSongLib}
 */
const MUSIC = new GSongLib();

/**
 * @type {GModal}
 */
const MODAL = new GModal();

/**
 * @type {GStorage}
 */
const STORAGE = new GStorage("space-rts");

/** @type {ServerConnection} */
let SERVER;

/** @type {MapGenerator} */
let MAP;

/** @type {GEG} */
let GAME;

/** @type {GEO|null} */
let SELECTED_OBJECT = null;

const CONTROLS_RENDERED = new GRenderer(
    document.querySelector('#controls-c'),
    {'selected': null}
)

async function start() {
    // noinspection JSValidateTypes
    /**
     * @type {HTMLCanvasElement}
     */
    const canvas = $('#game-canvas');
    GAME = new GEG(canvas);

    GAME.res = GUt.isLandscape() ? {w: 1920, h: 1080} : {w: 1080, h: 1920};

    GAME.fps = 30;

    SERVER = new ServerConnection('MAIN', true, false);
    new ServerObjectSync(GAME, SERVER);

    MAP = new MapGenerator(GAME, SERVER);
    if (SERVER.mainServer) {
        MAP.generateMap(20);
        SERVER.onEventListener(() => {
            console.log('[SERVER] Sending map data');
            SERVER.sendEvent('map:fetch:response', MAP.saveDict())
        }, "map:fetch:request");
    }
    new AIOneShip(new ServerConnection('AI-1'));

    GAME.cameraCenter = {x: MAP.systems[0].x, y: MAP.systems[0].y};
    const player = new GEOShip(GAME, {server: SERVER}, 'white', MAP.systems[0].label.text, "local");
    const station = new GEOStation(GAME, {server: SERVER}, 'blue', MAP.systems[0].label.text, "local");

    if (SERVER.mainServer && false) {
        SERVER.onEventListener((event, source, data) => {
            if (source !== SERVER.id) {
                player.x = data.x;
                player.y = data.y;
                player.d = data.d;
            }
        }, 'ship:position:update');
    }

    GAME.onKeyDown = (key) => {
        switch (key) {
            case "r":
                GAME.paused = true;
                MODAL.yesNo('Do you really want to reset the save game?', "DELETE SAVE")
                    .then((response) => {
                        if (!response) {
                            GAME.paused = false;
                            return;
                        }
                        STORAGE.del('save');
                        location.reload();
                    });
                break;
            case "-":
                GAME.zoom /= 1.1;
                break;
            case "+":
                GAME.zoom *= 1.1;
                break;
        }
    };

    GAME.onClick = (x, y) => {
        const pointer = GAME.createObject(x, y);
        pointer.draw = (ctx) => {
            const size = 8;
            ctx.fillStyle = 'pink';
            ctx.fillRect(pointer.x - (size / 2), pointer.y - (size / 2), size, size);
        }
        setTimeout(() => pointer.die(), 500);
        GAME.canvas.focus();
    }

    GAME.onDrag = (start, move) => {
        GAME.cameraOffset = {
            x: GAME.cameraOffset.x + move.x * (1 /GAME.zoom),
            y: GAME.cameraOffset.y + move.y * (1 / GAME.zoom)
        }
    }

    GAME.onScroll = (start, move) => {
        const newZoom = GAME.zoom - move.y / 1000;
        if (newZoom < 0.3 || newZoom > 3 || GAME.zoom === newZoom) {
            return;
        }
        GAME.zoom = newZoom;
    };

    GAME.onStep = () => {

        if (SELECTED_OBJECT !== null) {
            CONTROLS_RENDERED.variables.selected = SELECTED_OBJECT;
        } else {
            CONTROLS_RENDERED.variables.selected = null;
        }
        CONTROLS_RENDERED.render();
    }

    initMusic();
    GAME.run();
}

(async () => await start())();
