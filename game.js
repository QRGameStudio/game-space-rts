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

const AI_TEAM = 'ai_player';

async function start() {
    const canvas = $('#game-canvas');
    GAME = new GEG(canvas);

    GAME.res = GUt.isLandscape() ? {w: 1920, h: 1080} : {w: 1080, h: 1920};
    GAME.fps = 30;

    SERVER = new ServerConnection('MAIN', true, false);
    new ServerObjectSync(GAME, SERVER);

    MAP = new MapGenerator(GAME, SERVER);
    if (SERVER.mainServer) {
        MAP.generateMap(6, AI_TEAM);
        SERVER.onEventListener(() => {
            SERVER.sendEvent('map:fetch:response', MAP.saveDict())
        }, "map:fetch:request");
    }
    await (new AIOneShip(new ServerConnection(), AI_TEAM)).start();

    GAME.cameraCenter = {x: MAP.systems[0].x, y: MAP.systems[0].y};

    const playerSystem = MAP.systems[0];
    new GEOShip(GAME, {server: SERVER}, '#00E5FF', playerSystem.label.text, "local", "combat");
    new GEOStation(GAME, {server: SERVER}, '#00E5FF', playerSystem.label.text, "local");
    playerSystem.materials = 20;

    GAME.onKeyDown = (key) => {
        switch (key) {
            case "r":
                GAME.paused = true;
                MODAL.yesNo('Reset the save game?', "DELETE SAVE")
                    .then((response) => {
                        if (!response) { GAME.paused = false; return; }
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
            ctx.fillStyle = 'rgba(255,200,100,0.6)';
            ctx.beginPath();
            ctx.arc(pointer.x, pointer.y, 5, 0, 2 * PI);
            ctx.fill();
        }
        setTimeout(() => pointer.die(), 400);
        GAME.canvas.focus();
    }

    GAME.onDrag = (start, move) => {
        GAME.cameraOffset = {
            x: GAME.cameraOffset.x + move.x * (1 / GAME.zoom),
            y: GAME.cameraOffset.y + move.y * (1 / GAME.zoom)
        }
    }

    GAME.onScroll = (start, move) => {
        const newZoom = GAME.zoom - move.y / 1000;
        if (newZoom < 0.3 || newZoom > 3 || GAME.zoom === newZoom) return;
        GAME.zoom = newZoom;
    };

    let __renderThrottle = 0;
    let __victoryChecked = false;

    GAME.onStep = () => {
        // Re-render UI panel every 15 steps (~2× per second) for live value updates
        __renderThrottle++;
        if (__renderThrottle >= 15) {
            __renderThrottle = 0;
            CONTROLS_RENDERED.variables.selected = SELECTED_OBJECT;
            CONTROLS_RENDERED.render();
        }

        // Victory / loss check (once per second, only on main server)
        if (SERVER.mainServer && !__victoryChecked && __renderThrottle === 0) {
            const systems = [...GAME.objectsOfTypes(GEOStarSystem.t)];
            if (systems.length > 0) {
                const allPlayer = systems.every(s => s.owner === 'local');
                const playerSystems = systems.filter(s => s.owner === 'local');
                const noPlayerProducing = playerSystems.length === 0 ||
                    !playerSystems.some(s => s.type === 'producing');

                if (allPlayer) {
                    __victoryChecked = true;
                    GAME.paused = true;
                    MODAL.yesNo('Victory! You control all systems.', 'PLAY AGAIN')
                        .then(() => location.reload());
                } else if (noPlayerProducing) {
                    __victoryChecked = true;
                    GAME.paused = true;
                    MODAL.yesNo('Defeat. You have lost all producing systems.', 'TRY AGAIN')
                        .then(() => location.reload());
                }
            }
        }
    }

    initMusic();
    GAME.run();
}

(async () => await start())();
