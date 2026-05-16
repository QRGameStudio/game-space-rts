class AIOneShip {
    /**
     * @param {ServerConnection} server
     * @param {string} teamName
     * @param {string} color  Hex colour broadcast via player:color so all clients know this team's colour
     */
    constructor(server, teamName = 'ai_player', color = '#FF1744') {
        this.server = server;
        this.teamName = teamName;
        this.__color = color;
        this.game = new GEG(document.getElementById('ai-canvas'));
        this.teamName = teamName;
        this.map = new MapGenerator(this.game, this.server);
        /** @type {GEOShip|null} */
        this.__ship = null;
        this.__rebuildTick = 0;
    }

    start() {
        return new Promise((resolve) => {
            GEOStarSystem.listenForColors(this.server);
            GEOStarSystem.registerOwnerColor(this.server, this.teamName, this.__color);
            this.server.onEventListener((event, source, data) => {
                this.map.loadDict(data);
                this.game.run();
                new ServerObjectSync(this.game, this.server);
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

        // Enforce fleet cap before spawning
        const allSystems  = [...this.game.objectsOfTypes(GEOStarSystem.t)];
        const allStations = [...this.game.objectsOfTypes(GEOStation.t)];
        const ownedSystems  = allSystems.filter(s => s.owner === this.teamName).length;
        const ownedStations = allStations.filter(s => s.owner === this.teamName).length;
        const cap = Math.max(3, ownedSystems * 1 + ownedStations * 2);
        const activeShips = [...this.game.objectsOfTypes(GEOShip.t)].filter(s => s.owner === this.teamName).length;
        if (activeShips >= cap) return;

        this.__ship = new GEOShip(
            this.game, {server: this.server},
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
