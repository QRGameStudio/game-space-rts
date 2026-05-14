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
            newSystem = new GEOStarSystem(this.game, 0, 0, this.server);
        } else {
            while (true) {
                const randomSystem = this.systems[Math.floor(Math.random() * this.systems.length)];
                const distance = 200 + Math.random() * 200;
                const angle = Math.random() * 360;
                const position = GUt.pointRelativeToAngle(randomSystem.x, randomSystem.y, randomSystem.d, distance, angle);
                position.x = Math.round(position.x);
                position.y = Math.round(position.y);

                const closestSystem = this.systems.reduce((prev, curr) => {
                    const prevDistance = GEG.distanceBetween(prev, position);
                    const currDistance = GEG.distanceBetween(curr, position);
                    return prevDistance < currDistance ? prev : curr;
                });
                const closestDistance = GEG.distanceBetween(closestSystem, position);
                if (closestDistance < randomSystem.w * 2.5) {
                    continue;
                }

                newSystem = new GEOStarSystem(this.game, position.x, position.y, this.server);
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

    /**
     * @param {number} count
     * @param {string} aiTeam - AI team owner name
     */
    generateMap(count = 10, aiTeam = 'ai') {
        for (let i = 0; i < count; i++) {
            this.generateSystem();
        }
        this.__assignTypesAndOwnership(aiTeam);
    }

    /**
     * Assign types and ownership after all systems are placed.
     * @param {string} aiTeam
     * @private
     */
    __assignTypesAndOwnership(aiTeam) {
        const n = this.systems.length;

        // Player owns first system, AI owns last
        this.systems[0].owner = 'local';
        this.systems[0].type = 'producing';
        this.systems[n - 1].owner = aiTeam;
        this.systems[n - 1].type = 'producing';

        // Middle systems get random types
        for (let i = 1; i < n - 1; i++) {
            const roll = Math.random();
            if (roll < 0.25) {
                this.systems[i].type = 'resource';
            } else if (roll < 0.40) {
                this.systems[i].type = 'producing';
            } else if (roll < 0.50) {
                this.systems[i].type = 'repair';
            } else {
                this.systems[i].type = 'neutral';
            }
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
            const system = new GEOStarSystem(this.game, 0, 0, this.server);
            system.loadDict(systemData);
            this.systems.push(system);
        }
    }
}
