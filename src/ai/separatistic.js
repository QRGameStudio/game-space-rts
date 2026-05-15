class AISeparatistic {
    /**
     * Economy-driven separatist AI.
     * Uses the main game's real material economy to queue ships in shipyards,
     * then routes the spawned ships via the server sync mechanism.
     *
     * @param {ServerConnection} server
     * @param {string} teamName
     * @param {number} maxSystems
     * @param {GEG|null} mainGame - reference to the main server's GEG for economy access
     * @param {string} color  Hex colour for this team
     */
    constructor(server, teamName = 'separatistic_ai', maxSystems = 10, mainGame = null, color = '#9C27B0') {
        this.server   = server;
        this.teamName = teamName;
        this.__color  = color;
        this.maxSystems = maxSystems;

        /**
         * Reference to the main GAME so we can call addToQueue() on real system
         * objects that have live material counts updated by the economy.
         * @type {GEG|null}
         */
        this.mainGame = mainGame;

        const canvas = document.createElement('canvas');
        canvas.style.display = 'none';
        document.body.appendChild(canvas);
        this.game = new GEG(canvas);
        this.map  = new MapGenerator(this.game, this.server);

        /** System labels currently targeted by an invasion ship en-route. */
        this.__targetedLabels = new Set();

        this.__stepTick = 0;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    start() {
        return new Promise((resolve) => {
            GEOStarSystem.listenForColors(this.server);
            GEOStarSystem.registerOwnerColor(this.server, this.teamName, this.__color);
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

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    get __ownedCount() {
        return this.map.systems.filter(s => s.owner === this.teamName).length;
    }

    get __homeSystem() {
        return this.map.systems.find(s => s.owner === this.teamName && s.type === 'producing');
    }

    /** All my live ships visible in the synced AI game. */
    __myShips() {
        return [...this.game.objectsOfTypes(GEOShip.t)]
            .filter(s => s.owner === this.teamName && !s.isDead);
    }

    /**
     * My producing systems from the MAIN game — these have real, live materials
     * updated by the transport economy.
     * @returns {GEOStarSystem[]}
     */
    __mainProducers() {
        if (!this.mainGame) return [];
        return [...this.mainGame.objectsOfTypes(GEOStarSystem.t)]
            .filter(s => s.owner === this.teamName && s.type === 'producing');
    }

    /**
     * BFS from `from`; returns up to `count` unclaimed systems closest by hop.
     * @param {GEOStarSystem} from
     * @param {number} count
     * @returns {GEOStarSystem[]}
     */
    __findClosestUnclaimed(from, count) {
        const result  = [];
        const visited = new Set([from.id]);
        const queue   = [from];
        while (queue.length > 0 && result.length < count) {
            const node = queue.shift();
            for (const neighbor of node.connections) {
                if (visited.has(neighbor.id)) continue;
                visited.add(neighbor.id);
                if (neighbor.owner !== this.teamName) result.push(neighbor);
                queue.push(neighbor);
            }
        }
        return result;
    }

    __evaluate() {
        window.AI_LOGS = window.AI_LOGS || [];
        const log = (...args) => { const msg = args.join(' '); console.log(msg); window.AI_LOGS.push(msg); };
        const owned     = this.__ownedCount;
        const myShips   = this.__myShips();
        const invasion  = myShips.filter(s => s.shipClass === 'invasion');
        const combat    = myShips.filter(s => s.shipClass === 'combat');

        log(`[AISeparatistic] evaluate: owned=${owned}, invasion=${invasion.length}, combat=${combat.length}`);

        // How many of each type we need right now
        const targetInvasion = (owned < this.maxSystems)
            ? Math.max(1, Math.floor(owned / 5))
            : 0;
        const targetCombat = owned * 2; // 2 garrison ships per system

        // ------------------------------------------------------------------
        // Queue ships in real shipyards (main game systems with real materials)
        // ------------------------------------------------------------------
        for (const producer of this.__mainProducers()) {
            // Don't overfill the queue — keep at most 2 items pending
            if (producer.buildQueue.length >= 2) continue;

            if (invasion.length < targetInvasion) {
                // Need more invasion ships — highest priority
                producer.addToQueue('invasion'); // silently ignored if not enough materials
            } else if (combat.length < targetCombat) {
                producer.addToQueue('combat');
            }
        }

        // ------------------------------------------------------------------
        // Route idle invasion ships to unclaimed targets
        // ------------------------------------------------------------------
        this.__pruneTargetedLabels(invasion);

        const idleInvasion = invasion.filter(
            s => s.route.length === 0 && s.system?.owner === this.teamName
        );
        if (idleInvasion.length > 0) {
            const home = this.__homeSystem;
            if (home && owned < this.maxSystems) {
                const budget     = this.maxSystems - owned + this.__targetedLabels.size;
                const candidates = this.__findClosestUnclaimed(home, budget)
                    .filter(s => !this.__targetedLabels.has(s.label.text));

                const now = Date.now();
                for (const ship of idleInvasion) {
                    if (!candidates.length) break;
                    // Pick the closest fresh candidate (not visited in the last 90s).
                    // If all are in cooldown, skip this ship — it waits rather than oscillating.
                    const fresh = candidates.filter(s =>
                        now - (ship.__visitedAt?.get(s.id) ?? 0) >= GEOShip.VISIT_COOLDOWN
                    );
                    if (!fresh.length) continue;
                    // Deterministic: pick the first (BFS already sorted closest-first)
                    const target = candidates.splice(candidates.indexOf(fresh[0]), 1)[0];
                    this.__targetedLabels.add(target.label.text);
                    try { ship.goToSystem(target.label.text, true); } catch (_) {}
                }
            }
        }

        // ------------------------------------------------------------------
        // Route idle combat ships to under-garrisoned owned systems
        // ------------------------------------------------------------------
        const idleCombat = combat.filter(
            s => s.route.length === 0 && s.system?.owner === this.teamName
        );
        if (idleCombat.length > 0) {
            const ownedSystems = this.map.systems.filter(s => s.owner === this.teamName);
            for (const ship of idleCombat) {
                const target = this.__findUndergarrisoned(ownedSystems, combat, ship);
                if (!target) break;
                try { ship.goToSystem(target.label.text, true); } catch (_) {}
            }
        }
    }

    /**
     * Find an owned system with fewer than 2 combat ships assigned (present or en-route).
     * Prefers systems other than the ship's current one so it doesn't spin in place.
     * @param {GEOStarSystem[]} ownedSystems
     * @param {GEOShip[]} allCombat
     * @param {GEOShip} ship - the ship we're routing
     * @returns {GEOStarSystem|null}
     */
    __findUndergarrisoned(ownedSystems, allCombat, ship) {
        // Count how many combat ships are assigned to each system
        const assigned = (sys) => allCombat.filter(s =>
            !s.isDead && (
                s.system?.id === sys.id ||
                (s.route.length > 0 && s.route[s.route.length - 1]?.label.text === sys.label.text)
            )
        ).length;

        // Prefer a system that isn't the current one, but fall back if needed
        return ownedSystems.find(sys => sys.id !== ship.system?.id && assigned(sys) < 2)
            ?? ownedSystems.find(sys => assigned(sys) < 2)
            ?? null;
    }

    /** Remove labels whose invasion ship has died or arrived without capturing. */
    __pruneTargetedLabels(invasionShips) {
        for (const label of [...this.__targetedLabels]) {
            const active = invasionShips.find(
                s => !s.isDead && s.route.length > 0
                    && s.route[s.route.length - 1]?.label.text === label
            );
            if (!active) this.__targetedLabels.delete(label);
        }
    }

    __start() {
        const fps = this.game.fps || 30;
        this.game.onStep = () => {
            this.__stepTick++;
            if (this.__stepTick >= fps * 5) {
                this.__stepTick = 0;
                this.__evaluate();
            }
        };
    }
}
