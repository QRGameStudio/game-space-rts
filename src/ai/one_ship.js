class AIOneShip {
    /** @param {ServerConnection} server */
    constructor(server) {
        this.server = server;
        const window1 = window.open('', 'AI');
        const canvas = window1.document.createElement('canvas');
        window1.document.body.appendChild(canvas);
        canvas.style.width = "1280px";
        canvas.style.height = "720px";

        this.game = new GEG(canvas, true);
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
            const enemyShips = [...this.game.objectsOfTypes(GEOShip.t)].filter((ship) => ships.find((s) => s !== ship));

            for (const enemyShip of enemyShips) {
                for (const ship of ships) {
                    if (ship.distanceFrom(enemyShip) < enemyShip.r + ship.r) {
                        console.log('Meeting')
                    }
                }
            }
        };
    }
}
