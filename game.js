// !G.import('assets/public/audio.js')

const { random, sin, cos, PI } = Math;
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

/** @type {GEG} */
let GAME;


async function start() {
    // noinspection JSValidateTypes
    /**
     * @type {HTMLCanvasElement}
     */
    const canvas = $('#game-canvas');
    GAME = new GEG(canvas);

    GAME.res = GUt.isLandscape() ? {w: 1920, h: 1080} : {w: 1080, h: 1920};

    GAME.fps = 30;

    SERVER = new ServerConnection();
    SERVER.onEventListener((event, source, data) => {
        console.log('[SERVER] Event', event, source, data);
    });

    const map = new MapGenerator(GAME);
    map.generateMap();

    GAME.cameraCenter = {x: map.systems[0].x, y: map.systems[0].y};

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

    initMusic();
    GAME.run();
}

(async () => await start())();
