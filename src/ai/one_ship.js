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
        return this.map.systems[this.map.systems.length - 1];
    }

    __spawnDestroyer() {
        const home = this.__homeSystem;
        this.__ship = new GEOShip(
            this.game, {server: this.server}, '#FF1744',
            home.label.text, this.teamName, 'combat'
        );
    }

    __start() {
        const fps = this.game.fps || 30;
        this.__spawnDestroyer();

        this.game.onStep = () => {
            // Rebuild destroyer 15s after it's destroyed
            if (this.__ship === null || this.__ship.isDead) {
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
