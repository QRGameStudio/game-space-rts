class AIOneShip {
    /** @param {ServerConnection} server */
    constructor(server) {
        this.server = server;
        this.game = new GEG(document.createElement('canvas'), false);
        new ServerObjectSync(this.game, server);
        this.map = new MapGenerator(this.game, this.server);

        this.server.onEventListener((event, source, data) => {
            console.log('[AI] Received map data, creating ship');
            this.map.loadDict(data);
            this.game.run();
            this.__start();
        }, 'map:fetch:response');
        this.server.sendEvent('map:fetch:request', {}).then();
    }

    __start() {
        const ships = [
            new GEOShip(this.game, {server: this.server}, 'red', this.map.systems[4].label.text, 'ai')
        ];

        this.game.onStep = async () => {
            for (const ship of ships) {
                this.server.sendEvent('ship:position:update', {
                    id: ship.serverId,
                    x: ship.x,
                    y: ship.y,
                    d: ship.d
                }).then();
                if (ship.route.length === 0) {
                    // noinspection JSValidateTypes
                    /** @type {GEOStarSystem[]} */
                    const systems = [...this.game.objectsOfTypes(GEOStarSystem.t)];
                    const target = systems[Math.floor(Math.random() * systems.length)].label.text;
                    ship.goToSystem(target, true);
                    console.debug('[AI] Ship has no route, planning route to', target);
                }
            }
        };
    }
}
