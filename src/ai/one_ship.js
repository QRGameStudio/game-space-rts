class AIOneShip {
    /**
     * @param {ServerConnection} server
     * @param {string} teamName
     */
    constructor(server, teamName = 'ai_player') {
        this.server = server;
        this.game = new GEG(document.getElementById('ai-canvas'));
        this.teamName = teamName;
        this.map = new MapGenerator(this.game, this.server);
        /** @type {GEOShip|null} */
        this.__ship = null;
        this.__rebuildTick = 0;
    }

    start() {
        return new Promise((resolve) => {
            this.server.onEventListener((event, source, data) => {
                this.map.loadDict(data);
                this.game.run();
                new ServerObjectSync(this.game, this.server);
                this.server.onEventListener((ev, src, d) => {
                    const sys = this.map.systems.find(s => s.label.text === d.name);
                    if (sys) sys.owner = d.owner;
                }, 'system:capture');
                resolve();
                this.__start();
            }, 'map:fetch:response');
            this.server.sendEvent('map:fetch:request', {}).then();
        });
    }

    get __homeSystem() {
        return this.map.systems.find(s => s.owner === this.teamName && s.type === 'producing');
    }

    __spawnDestroyer() {
        const home = this.__homeSystem;
        window.AI_LOGS = window.AI_LOGS || [];
        const msg = `[AIOneShip] Spawning destroyer at ${home ? home.label.text : 'null'}`;
        console.log(msg);
        window.AI_LOGS.push(msg);
        this.__ship = new GEOShip(
            this.game, {server: this.server}, '#FF1744',
            home ? home.label.text : '', this.teamName, 'combat'
        );
        this.__ship.setMode('search-destroy');
    }

    __start() {
        const fps = this.game.fps || 30;
        this.__spawnDestroyer();

        this.game.onStep = () => {
            const shipGone = this.__ship === null || this.__ship.isDead;

            if (shipGone) {
                this.__ship = null;
                this.__rebuildTick++;
                if (this.__rebuildTick >= fps * 15) {
                    this.__rebuildTick = 0;
                    this.__spawnDestroyer();
                }
            } else {
                this.__rebuildTick = 0;
            }
        };
    }
}
