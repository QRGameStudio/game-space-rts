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


/**
 * Timestamp that says when the combat status will end
 * @type {number|null}
 */
let IN_COMBAT_TIMEOUT = null;

const CONTROLS_RENDERED = new GRenderer(
    document.querySelector('#controls-c'),
    { 'selected': null, 'pendingDismantle': false, 'pendingBuilderAction': null, 'pendingBuilderLabel': '', 'pendingBuilderTarget': null }
);
CONTROLS_RENDERED.functions.getStationButtonsClass = (s) => (s && s.t === 'station' && s.owner === 'local') ? 'buttons' : 'buttons r-hidden';
CONTROLS_RENDERED.functions.getShipButtonsClass = (s) => (s && s.t === 'ship' && s.owner === 'local') ? 'buttons' : 'buttons r-hidden';
CONTROLS_RENDERED.functions.getBuilderCommandClass = (s, pb) => (s && s.shipClass === 'builder' && !pb) ? '' : 'r-hidden';
CONTROLS_RENDERED.functions.getCombatCommandClass = (s) => (s && s.shipClass === 'combat') ? '' : 'r-hidden';
CONTROLS_RENDERED.functions.getInvasionCommandClass = (s) => (s && s.shipClass === 'invasion') ? '' : 'r-hidden';
CONTROLS_RENDERED.functions.getDismantleButtonsClass = (s, pd) =>
    (s && (s.t === 'station' || s.t === 'repair-station' || s.t === 'jump-inhibitor') && s.owner === 'local' && !pd) ? 'buttons' : 'buttons r-hidden';
CONTROLS_RENDERED.functions.getDismantleConfirmClass = (pd) => pd ? 'buttons' : 'buttons r-hidden';
CONTROLS_RENDERED.functions.getBuilderConfirmClass = (s, pb) =>
    (s && s.shipClass === 'builder' && pb) ? 'buttons' : 'buttons r-hidden';
CONTROLS_RENDERED.functions.getShipMaxHp = (s) => s?.shipClass ? (GEOShip.MAX_HP?.[s.shipClass] ?? '?') : '?';
CONTROLS_RENDERED.functions.getStructureMaxHp = (s) => s?.constructor?.MAX_HP ?? '?';
CONTROLS_RENDERED.functions.getFleetCount = (s) => {
    if (!s?.owner || !GAME) return 0;
    return [...GAME.objectsOfTypes(GEOShip.t)].filter(x => x.owner === s.owner).length;
};
CONTROLS_RENDERED.functions.getFleetCap = (s) => {
    if (!s?.owner || !GAME) return 0;
    const systems  = [...GAME.objectsOfTypes(GEOStarSystem.t)].filter(x => x.owner === s.owner).length;
    const stations = [...GAME.objectsOfTypes(GEOStation.t)].filter(x => x.owner === s.owner).length;
    return Math.max(3, systems * 1 + stations * 2);
};
CONTROLS_RENDERED.functions.getShipyardCap = (s) => {
    if (!s?.owner || !GAME) return 0;
    const systems = [...GAME.objectsOfTypes(GEOStarSystem.t)].filter(x => x.owner === s.owner).length;
    return Math.ceil(systems / 5);
};
CONTROLS_RENDERED.functions.getShipyardCount = (s) => {
    if (!s?.owner || !GAME) return 0;
    return [...GAME.objectsOfTypes(GEOStation.t)].filter(x => x.owner === s.owner).length;
};

const AI_TEAM = 'ai_player';
const AI_TEAM_SEP = 'separatistic_ai';
const COLOR_LOCAL  = '#00E5FF';
const COLOR_AI     = '#A1FA11';
const COLOR_AI_SEP = '#9C27B0';

window.deselectAll = function () {
    GEOSelectable.deselectAll();
    CONTROLS_RENDERED.variables.selected = null;
    CONTROLS_RENDERED.variables.pendingDismantle = false;
    CONTROLS_RENDERED.variables.pendingBuilderAction = null;
    CONTROLS_RENDERED.variables.pendingBuilderLabel = '';
    CONTROLS_RENDERED.variables.pendingBuilderTarget = null;
    CONTROLS_RENDERED.render();
};

window.requestDismantle = function () {
    CONTROLS_RENDERED.variables.pendingDismantle = true;
    CONTROLS_RENDERED.render();
};

window.confirmDismantle = function () {
    if (SELECTED_OBJECT?.dismantle) SELECTED_OBJECT.dismantle();
    CONTROLS_RENDERED.variables.pendingDismantle = false;
    deselectAll();
};

window.cancelDismantle = function () {
    CONTROLS_RENDERED.variables.pendingDismantle = false;
    CONTROLS_RENDERED.render();
};

window.requestBuilderBuild = function (action, label) {
    CONTROLS_RENDERED.variables.pendingBuilderAction = action;
    CONTROLS_RENDERED.variables.pendingBuilderLabel = label;
    CONTROLS_RENDERED.variables.pendingBuilderTarget = SELECTED_OBJECT;
    CONTROLS_RENDERED.render();
};

window.confirmBuilderBuild = function () {
    const action = CONTROLS_RENDERED.variables.pendingBuilderAction;
    const target = CONTROLS_RENDERED.variables.pendingBuilderTarget || SELECTED_OBJECT;
    if (target && action && typeof target[action] === 'function') {
        target[action]();
    }
    CONTROLS_RENDERED.variables.pendingBuilderAction = null;
    CONTROLS_RENDERED.variables.pendingBuilderLabel = '';
    CONTROLS_RENDERED.variables.pendingBuilderTarget = null;
    deselectAll();
};

window.cancelBuilderBuild = function () {
    CONTROLS_RENDERED.variables.pendingBuilderAction = null;
    CONTROLS_RENDERED.variables.pendingBuilderLabel = '';
    CONTROLS_RENDERED.variables.pendingBuilderTarget = null;
    CONTROLS_RENDERED.render();
};

/**
 * Initialise a player: create a starbase, seed starting materials, spawn one destroyer.
 * The resource system is forced to type 'resource' so income always flows.
 * @param {string} owner
 * @param {GEOStarSystem} system - producing / shipyard system
 * @param {GEOStarSystem} resourceSystem - adjacent system that will generate materials
 */
function initPlayer(owner, system, resourceSystem) {
    resourceSystem.owner = owner;
    resourceSystem.type = 'resource';
    new GEOStation(GAME, { server: SERVER }, system.label.text, owner);
    system.materials = 20;
    new GEOShip(GAME, { server: SERVER }, system.label.text, owner, 'combat');
}

async function musicController() {
    let currentTrack = null;
    /** @type {GTonesSequence|null} */
    let currentSong = null;
    let targetTrack = "songMainTheme";

    while (true) {
        if (IN_COMBAT_TIMEOUT + 15000 > Date.now()) {
            targetTrack = "songCombat";
        } else if (IN_COMBAT_TIMEOUT + 30000 > Date.now()) {
            targetTrack = "songMining";
        } else {
            targetTrack = "songMainTheme";
        }

        if (currentTrack !== targetTrack) {
            if (currentSong !== null) {
                currentSong.stop();
            }
            currentSong = await MUSIC.get(targetTrack);
            currentSong.play(-1, 20);
            currentTrack = targetTrack;
        }
        await GUt.sleep(300);
    }
}

async function start() {
    const canvas = $('#game-canvas');
    GAME = new GEG(canvas);

    GAME.res = GUt.isLandscape() ? { w: 1920, h: 1080 } : { w: 1080, h: 1920 };
    GAME.fps = 30;

    SERVER = new ServerConnection('MAIN', true, false);
    new ServerObjectSync(GAME, SERVER);

    // Register the local player's colour and listen for incoming colour events.
    // Each AI registers its own colour from within its start() call.
    GEOStarSystem.listenForColors(SERVER);
    GEOStarSystem.registerOwnerColor(SERVER, 'local', COLOR_LOCAL);

    MAP = new MapGenerator(GAME, SERVER);
    if (SERVER.mainServer) {
        MAP.generateMap(60, AI_TEAM, AI_TEAM_SEP);

        const aiHome = MAP.systems.find(s => s.owner === AI_TEAM && s.type === 'producing');
        if (aiHome) new GEOStation(GAME, { server: SERVER }, aiHome.label.text, AI_TEAM);

        const sepHome = MAP.systems.find(s => s.owner === AI_TEAM_SEP && s.type === 'producing');
        if (sepHome) new GEOStation(GAME, { server: SERVER }, sepHome.label.text, AI_TEAM_SEP);

        SERVER.onEventListener(() => {
            SERVER.sendEvent('map:fetch:response', MAP.saveDict())
        }, "map:fetch:request");
    }
    await (new AIOneShip(new ServerConnection(), AI_TEAM, COLOR_AI)).start();
    await (new AISeparatistic(new ServerConnection(), AI_TEAM_SEP, 10, GAME, COLOR_AI_SEP)).start();

    GAME.cameraCenter = { x: MAP.playerStart.x, y: MAP.playerStart.y };

    initPlayer('local', MAP.playerStart, MAP.playerResource);
    GEOStarSystem.computeVisibility(GAME);

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
        // Zoom toward mouse position: keep world point under cursor fixed
        const factor = 1 / newZoom - 1 / GAME.zoom;
        GAME.cameraOffset = {
            x: GAME.cameraOffset.x + start.x * factor,
            y: GAME.cameraOffset.y + start.y * factor
        };
        GAME.zoom = newZoom;
    };

    let __renderThrottle = 0;
    let __victoryChecked = false;
    let __lastSelectedId = null;

    GAME.onStep = () => {
        // Re-render UI panel every 15 steps (~2× per second) for live value updates
        __renderThrottle++;
        if (__renderThrottle >= 15) {
            __renderThrottle = 0;
            GEOStarSystem.computeVisibility(GAME);
            // Reset confirmations when selection changes
            const curId = SELECTED_OBJECT?.id ?? null;
            if (curId !== __lastSelectedId) {
                CONTROLS_RENDERED.variables.pendingDismantle = false;
                CONTROLS_RENDERED.variables.pendingBuilderAction = null;
                CONTROLS_RENDERED.variables.pendingBuilderLabel = '';
                CONTROLS_RENDERED.variables.pendingBuilderTarget = null;
                __lastSelectedId = curId;
            }
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
    musicController();
    GAME.run();
}

(async () => await start())();
