class MapGenerator {
    /**
     * Generates a map for the game.
     * @param game {GEG}
     * @param server {ServerConnection}
     */
    constructor(game, server) {
        /** @type {GEOStarSystem[]} */
        this.systems = [];
        this.game = game;
        this.server = server;
    }

    generateSystem() {
        let newSystem;
        if (this.systems.length === 0) {
            newSystem = new GEOStarSystem(this.game, 0, 0);
        } else {
            while (true) {
                const randomSystem = this.systems[Math.floor(Math.random() * this.systems.length)];
                const distance = 200 + Math.random() * 200;
                const angle = Math.random() * 360;
                const position = GUt.pointRelativeToAngle(randomSystem.x, randomSystem.y, randomSystem.d, distance, angle);

                const closestSystem = this.systems.reduce((prev, curr) => {
                    const prevDistance = GEG.distanceBetween(prev, position);
                    const currDistance = GEG.distanceBetween(curr, position);
                    return prevDistance < currDistance ? prev : curr;
                });
                const closestDistance = GEG.distanceBetween(closestSystem, position);
                if (closestDistance < randomSystem.w * 2.5) {
                    continue;
                }

                newSystem = new GEOStarSystem(this.game, position.x, position.y);
                this.systems.push(newSystem);
                randomSystem.connections.push(newSystem);
                newSystem.connections.push(randomSystem);
                if (randomSystem !== closestSystem && Math.random() > 0.25) {
                    closestSystem.connections.push(newSystem);
                    newSystem.connections.push(closestSystem);
                }
                break;
            }
        }

        newSystem.serverId = this.server.generateObjectId(newSystem);
        this.systems.push(newSystem);
    }

    generateMap(systems = 10) {
        for (let i = 0; i < systems; i++) {
            this.generateSystem();
        }
    }

    saveDict() {
        return {
            systems: this.systems.map((system) => system.saveDict())
        }
    }

    loadDict(data) {
        this.systems = [];
        for (const systemData of data.systems) {
            const system = new GEOStarSystem(this.game, 0, 0);
            system.loadDict(systemData);
            this.systems.push(system);
        }
    }
}
