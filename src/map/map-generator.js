class MapGenerator {
    /**
     * Generates a map for the game.
     * @param game {GEG}
     * @param server {ServerConnection}
     */
    constructor(game, server) {
        console.assert(game instanceof GEG, '[MapGenerator] game must be an instance of GEG');
        console.assert(server instanceof ServerConnection, '[MapGenerator] server must be an instance of ServerConnection');

        /** @type {GEOStarSystem[]} */
        this.systems = [];
        this.game = game;
        this.server = server;

        /** Starting system for the local player (set after generateMap). */
        this.playerStart = null;
        /** Resource neighbour for the local player. */
        this.playerResource = null;
    }

    generateSystem() {
        /** @type {GEOServerConnection} */
        const serverConnection = {server: this.server};
        console.assert(typeof serverConnection.server !== 'undefined', '[MapGenerator] serverConnection must have a server property');
        let newSystem;
        if (this.systems.length === 0) {
            newSystem = new GEOStarSystem(this.game, 0, 0, serverConnection);
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

                newSystem = new GEOStarSystem(this.game, position.x, position.y, serverConnection);
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
     * @param {string} aiTeam - AIOneShip team name
     * @param {string|null} separatisticTeam - AISeparatistic team name (optional)
     */
    generateMap(count = 10, aiTeam = 'ai', separatisticTeam = null) {
        for (let i = 0; i < count; i++) {
            this.generateSystem();
        }
        this.__assignTypesAndOwnership(aiTeam, separatisticTeam);
    }

    /**
     * Compute BFS shortest-path distances from `fromIdx` to all other systems.
     * Returns an array where result[j] = hop distance from systems[fromIdx] to systems[j].
     * @param {number} fromIdx
     * @returns {number[]}
     * @private
     */
    __bfsDistances(fromIdx) {
        const n = this.systems.length;
        const dist = new Array(n).fill(Infinity);
        dist[fromIdx] = 0;
        const idxOf = new Map(this.systems.map((s, i) => [s, i]));
        const queue = [fromIdx];
        while (queue.length > 0) {
            const curr = queue.shift();
            for (const neighbor of this.systems[curr].connections) {
                const j = idxOf.get(neighbor);
                if (j === undefined || dist[j] !== Infinity) continue;
                dist[j] = dist[curr] + 1;
                queue.push(j);
            }
        }
        return dist;
    }

    /**
     * Pick `count` system indices that are pairwise as far apart as possible.
     * Tries minimum hop distance 3, then falls back to whatever maximises separation.
     * @param {number} count  2 or 3
     * @returns {number[]}
     * @private
     */
    __findStartingIndices(count) {
        const n = this.systems.length;
        // Pre-compute BFS distances from every system
        const allDist = this.systems.map((_, i) => this.__bfsDistances(i));

        const minPairDist = (indices) => {
            let min = Infinity;
            for (let a = 0; a < indices.length; a++) {
                for (let b = a + 1; b < indices.length; b++) {
                    min = Math.min(min, allDist[indices[a]][indices[b]]);
                }
            }
            return min;
        };

        let best = null;
        let bestScore = -1;

        if (count === 2) {
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    const d = allDist[i][j];
                    if (d > bestScore) { bestScore = d; best = [i, j]; }
                }
            }
        } else {
            // count === 3
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    for (let k = j + 1; k < n; k++) {
                        const score = minPairDist([i, j, k]);
                        if (score > bestScore) { bestScore = score; best = [i, j, k]; }
                    }
                }
            }
        }

        if (bestScore < 3) {
            console.warn(`[MapGenerator] Starting positions only ${bestScore} hop(s) apart — map may be too small for ideal separation.`);
        }

        // Shuffle so player/AI assignments aren't always the geometrically
        // "same" corner each game.
        for (let i = best.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [best[i], best[j]] = [best[j], best[i]];
        }
        return best;
    }

    /**
     * Pick a neighbour of `startIdx` to serve as that faction's resource node,
     * excluding any index in `takenSet`.
     * @param {number} startIdx
     * @param {Set<number>} takenSet
     * @returns {number|null}
     * @private
     */
    __pickResourceNeighbour(startIdx, takenSet) {
        const start = this.systems[startIdx];
        const idxOf = new Map(this.systems.map((s, i) => [s, i]));
        for (const neighbor of start.connections) {
            const j = idxOf.get(neighbor);
            if (j !== undefined && !takenSet.has(j)) return j;
        }
        return null;
    }

    /**
     * Assign types and ownership after all systems are placed.
     * @param {string} aiTeam
     * @param {string|null} separatisticTeam
     * @private
     */
    __assignTypesAndOwnership(aiTeam, separatisticTeam) {
        const n = this.systems.length;
        const factionCount = separatisticTeam ? 3 : 2;
        const startIndices = this.__findStartingIndices(factionCount);

        const taken = new Set(startIndices);

        // Faction 0 → local player
        const playerIdx = startIndices[0];
        this.systems[playerIdx].owner = 'local';
        this.systems[playerIdx].type  = 'producing';
        this.playerStart = this.systems[playerIdx];

        const playerResourceIdx = this.__pickResourceNeighbour(playerIdx, taken);
        if (playerResourceIdx !== null) {
            taken.add(playerResourceIdx);
            this.systems[playerResourceIdx].owner = 'local';
            this.systems[playerResourceIdx].type  = 'resource';
            this.playerResource = this.systems[playerResourceIdx];
        } else {
            this.playerResource = this.playerStart;
        }

        // Faction 1 → AIOneShip
        const aiIdx = startIndices[1];
        this.systems[aiIdx].owner = aiTeam;
        this.systems[aiIdx].type  = 'producing';

        const aiResourceIdx = this.__pickResourceNeighbour(aiIdx, taken);
        if (aiResourceIdx !== null) {
            taken.add(aiResourceIdx);
            this.systems[aiResourceIdx].owner = aiTeam;
            this.systems[aiResourceIdx].type  = 'resource';
        }

        // Faction 2 → AISeparatistic (optional)
        if (separatisticTeam) {
            const sepIdx = startIndices[2];
            this.systems[sepIdx].owner = separatisticTeam;
            this.systems[sepIdx].type  = 'producing';

            const sepResourceIdx = this.__pickResourceNeighbour(sepIdx, taken);
            if (sepResourceIdx !== null) {
                taken.add(sepResourceIdx);
                this.systems[sepResourceIdx].owner = separatisticTeam;
                this.systems[sepResourceIdx].type  = 'resource';
            }
        }

        // Remaining systems: random types
        for (let i = 0; i < n; i++) {
            if (taken.has(i)) continue;
            const roll = Math.random();
            if (roll < 0.25) {
                this.systems[i].type = 'resource';
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
            const system = new GEOStarSystem(this.game, 0, 0, {server: this.server});
            system.loadDict(systemData);
            this.systems.push(system);
        }
    }
}
