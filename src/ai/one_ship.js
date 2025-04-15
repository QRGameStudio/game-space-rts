class AIOneShip {
    /** @param {ServerConnection} server */
    constructor(server) {
        this.server = server;
        this.game = new GEG(document.getElementById('ai-canvas'));
        this.teamName = `one_ship_AI_${Math.floor(Math.random() * 100)}`;
        this.map = new MapGenerator(this.game, this.server);
    }

    start() {
        return new Promise((resolve) => {
            this.server.onEventListener((event, source, data) => {
                console.log('[AI] Received map data, creating ship', data);
                this.map.loadDict(data);
                this.game.run();
                new ServerObjectSync(this.game, this.server);
                resolve();
                this.__start();
            }, 'map:fetch:response');
            this.server.sendEvent('map:fetch:request', {}).then();
        })
    }

    __start() {
        const ships = [
            new GEOShip(this.game, {server: this.server}, 'red', this.map.systems[4].label.text, this.teamName, 'fighter'),
        ];
        this.game.cameraFollowObject = ships[0];

        this.game.onStep = async () => {
            for (const ship of ships) {
                if (ship.route.length === 0) {
                    // noinspection JSValidateTypes
                    /** @type {GEOStarSystem[]} */
                    const systems = [...this.game.objectsOfTypes(GEOStarSystem.t)];
                    const target = systems[Math.floor(Math.random() * systems.length)].label.text;
                    ship.goToSystem(target, true);
                    console.debug('[AI] Ship has no route, planning route to', target);
                }

                if (ship.isDead) {
                    console.debug('[AI] Ship is dead, removing');
                    ships.splice(ships.indexOf(ship), 1);
                }
            }

            if (ships.length === 0) {
                console.debug('[AI] No ships left, adding one');
                ships.push(
                    new GEOShip(this.game, {server: this.server}, 'red', this.map.systems[4].label.text, this.teamName, 'fighter')
                );
            }
        };
    }
}
