/**
 * @typedef {'combat' | 'invasion' | 'builder'} GEOShipClass
 */

class GEOShip extends GEOSelectable {
    static t = 'ship';

    /** Base HP per class */
    static MAX_HP = { combat: 3, invasion: 1, builder: 1, fighter: 3 };

    /** Attack cooldown in ms per veterancy level */
    static COOLDOWNS = { rookie: 2000, veteran: 1700, elite: 1400 };

    /** Speeds (units/step at 30fps → stored as step speed) */
    static SPEEDS = { combat: 2.5, invasion: 1.5, builder: 1.2, fighter: 2.5 };

    /** Materials cost */
    static COSTS = { combat: 10, invasion: 15, builder: 50 };

    /**
     * @param game {GEG}
     * @param server {GEOServerConnection}
     * @param systemName {string}
     * @param owner {string}
     * @param shipClass {GEOShipClass}
     */
    constructor(game, server, systemName, owner, shipClass) {
        super(game, server, owner);

        // Normalise legacy class names
        if (shipClass === 'fighter') shipClass = 'combat';

        this.shipClass = shipClass;

        switch (shipClass) {
            case 'combat':
                this.w = 75; this.h = 25;
                this.health = GEOShip.MAX_HP.combat;
                break;
            case 'invasion':
                this.w = 25; this.h = 25;
                this.health = GEOShip.MAX_HP.invasion;
                break;
            case 'builder':
                this.w = 20; this.h = 20;
                this.health = GEOShip.MAX_HP.builder;
                break;
            default:
                throw new Error(`Unknown ship class ${shipClass}`);
        }

        this.t = this.constructor.t;
        this.clickable = true;

        /** @type {GEOStarSystem | null} */
        this.system = this.__systemByName(systemName);
        this.x = this.system.x + Math.random() * (this.system.w * 1.5) - (this.system.w / 2);
        this.y = this.system.y + Math.random() * (this.system.h * 1.5) - (this.system.h / 2);

        /** @type {GEOStarSystem[]} */
        this.route = [];

        // Combat
        /** @type {number} timestamp of last shot */
        this.__lastFired = 0;
        /** @type {number} timestamp when this ship last entered its current system */
        this.__arrivalTime = 0;
        /** @type {GEOStarSystem|null} System the ship departed from (used for lane ownership checks) */
        this.__previousSystem = null;
        /** @type {number} XP gained from kills */
        this.xp = 0;
        /** @type {'rookie'|'veteran'|'elite'} */
        this.veterancy = 'rookie';
        /** Attrition tick counter */
        this.__attritionTick = 0;
        /** @type {null|'search'|'search-defend'|'search-destroy'|'search-resources'|'fill-borders'} Automation mode */
        this.mode = null;
        /** Tick counter for automation re-evaluation */
        this.__modeTick = 0;
        /** @type {Map<string, number>} systemId → timestamp of last visit, for mode de-prioritisation */
        this.__visitedAt = new Map();

        this.conn.patchMethod(this.goToSystem);
        this.conn.patchMethod(this.setMode);
        this.conn.patchMethod(this.stop);
        this.conn.patchMethod(this.build);
        this.sendCreationEvent(arguments);
        this.goToSystem(systemName, true);
    }

    /** Color is always derived live from the owner's registered colour. */
    get color() { return GEOStarSystem.ownerColor(this.owner); }

    onclick(x, y, clickedObject) {
        if (this.owner !== 'local') {
            return;
        }
        this.selectObject();
        return true;
    }

    get __attackCooldown() {
        return GEOShip.COOLDOWNS[this.veterancy];
    }

    __updateVeterancy() {
        const prev = this.veterancy;
        if (this.xp >= 6) this.veterancy = 'elite';
        else if (this.xp >= 3) this.veterancy = 'veteran';
        else this.veterancy = 'rookie';
        if (prev !== this.veterancy) {
            console.debug(`[Ship] ${this.id} promoted to ${this.veterancy}`);
        }
    }

    draw(ctx) {
        // Hide enemy ships outside the player's fog-of-war
        if (this.owner !== 'local') {
            if (this.system) {
                if (!this.system.visible) return;
            } else {
                // In transit: hide if neither the departed system nor the next waypoint is visible
                const from = this.__previousSystem;
                const to = this.route.length > 0 ? this.route[0] : null;
                if ((!from || !from.visible) && (!to || !to.visible)) return;
            }
        }

        const selected = this.constructor.selectedId === this.id;
        ctx.strokeStyle = selected ? 'orange' : this.color;
        ctx.lineWidth = selected ? 7 : 5;
        ctx.beginPath();

        if (this.shipClass === 'combat') {
            // Forward pointing triangle (diamond-ish)
            ctx.moveTo(this.x + this.wh, this.y);
            ctx.lineTo(this.x - this.wh, this.y + this.hh);
            ctx.lineTo(this.x - this.wh, this.y - this.hh);
            ctx.closePath();
        } else if (this.shipClass === 'invasion') {
            // Square outline
            ctx.rect(this.x - this.wh, this.y - this.hh, this.w, this.h);
        } else if (this.shipClass === 'builder') {
            // Cross / plus symbol
            ctx.moveTo(this.x - this.wh, this.y);
            ctx.lineTo(this.x + this.wh, this.y);
            ctx.moveTo(this.x, this.y - this.hh);
            ctx.lineTo(this.x, this.y + this.hh);
        }

        ctx.stroke();

        // Veterancy pip (tiny dot above ship)
        if (this.veterancy !== 'rookie') {
            const pips = this.veterancy === 'veteran' ? 1 : 2;
            for (let i = 0; i < pips; i++) {
                ctx.beginPath();
                ctx.arc(this.x - 5 + i * 8, this.y - this.hh - 6, 3, 0, 2 * Math.PI);
                ctx.fillStyle = '#FFD600';
                ctx.fill();
            }
        }

        // Automation mode indicator (small icon below ship)
        if (this.mode) {
            const MODE_ICONS = { 'search': '◎', 'search-defend': '◈', 'search-destroy': '✕', 'search-resources': '★', 'fill-borders': '⬡' };
            const MODE_COLORS = { 'search': '#00BCD4', 'search-defend': '#FFD600', 'search-destroy': '#FF1744', 'search-resources': '#76FF03', 'fill-borders': '#E040FB' };
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = MODE_COLORS[this.mode] ?? '#FFF';
            ctx.fillText(MODE_ICONS[this.mode] ?? '?', this.x, this.y + this.hh + 12);
        }
    }

    die() {
        if (this.system) {
            this.system.ships.delete(this);
        }
        if (this.conn) this.conn.destroy();
        super.die();
    }

    explode() {
        // Only show explosion visual and sound when in fog-of-war visible area
        const shipVisible = this.system?.visible ?? this.__previousSystem?.visible ?? false;
        if (shipVisible) {
            const x = this.x, y = this.y, color = this.color;
            const boom = new GEO(this.game);
            boom.x = x;
            boom.y = y;
            boom.w = boom.h = 400;  // large enough to always pass isVisible
            let tick = 0;
            boom.step = function () {
                tick++;
                if (tick >= 15) this.die();
            };
            boom.draw = function (ctx) {
                const r = tick * 7;
                ctx.save();
                ctx.globalAlpha = Math.max(0, 1 - tick / 15);
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            };
            IN_COMBAT_TIMEOUT = Date.now() + 5000;
            (async () => {
                (await MUSIC.get("boom")).play(0, 40);
            })();
        }
        super.explode();  // logs + calls die()
    }

    /**
     * @param {GEO & {health: number}} to
     * @param {GEOShip} [killer] - who dealt the killing blow (for XP)
     */
    fireLaser(to, killer) {
        if (this.health <= 0) return;   // zombie-proof: don't fire after death
        if (to.health <= 0) return;     // don't shoot already-dead targets
        if (Date.now() - this.__lastFired < this.__attackCooldown) return;
        this.__lastFired = Date.now();
        const homeTurf = this.system?.owner === this.owner;
        const damage = homeTurf ? 1.1 : 1.0;
        const newHp = to.health - damage;
        this.__fireLaser(to, newHp);
        if (newHp <= 0 && killer) {
            killer.xp++;
            killer.__updateVeterancy();
        }
    }

    /**
     * @param {GEO} to
     * @param {number} health
     */
    __fireLaser(to, health) {
        new GEOLaser(this.game, this, to, this.color);
        if (to.hasOwnProperty('health')) {
            to.health = health;
            to.conn?.syncHealth();
        }
    }

    /**
     * Builds the selected structure in the current system
     * @param {"shipyard"|"repair-station"|"shield"|"jump-inhibitor"} action 
     */
    build(action) {
        if (this.shipClass !== 'builder' || !this.system || this.system.owner !== this.owner) {
            console.debug('[BUILDER] build failed: invalid ship class, system, or ownership');
            return;
        }
        if (!this.conn.server.mainServer) {
            return;
        }
        const hasStation = [...this.game.objectsOfTypes(GEOStation.t)].some(st => st.system === this.system);
        const hasRepairStation = [...this.game.objectsOfTypes(GEORepairStation.t)].some(st => st.system === this.system);
        const hasInhibitor = [...this.game.objectsOfTypes(GEOJumpInhibitor.t)].some(j => j.system === this.system);
        if (action !== "shield" && (hasStation || hasRepairStation || hasInhibitor)) {
            console.debug('[BUILDER] build failed: station, repair station, or inhibitor already exists');
            return;
        }

        console.debug(`[BUILDER] build action: ${action} at system ${this.system.label.text} by ship ${this.id}`);
        switch (action) {
            case 'shipyard':
                console.debug('[BUILDER] buildShipyard: converting system to producing and creating station');
                this.system.type = 'producing';
                new GEOStation(this.game, { server: this.conn.server }, this.system.label.text, this.owner);
                break;
            case 'repair-station':
                console.debug('[BUILDER] buildRepairStation: converting system to repair and creating repair station');
                this.system.type = 'repair';
                new GEORepairStation(this.game, { server: this.conn.server }, this.system.label.text, this.owner);
                break;
            case 'shield':
                console.debug('[BUILDER] buildShield: adding shield to system');
                this.system.shieldHp = this.system.shieldMaxHp;
                break;
            case 'jump-inhibitor':
                console.debug('[BUILDER] buildJumpInhibitor: creating jump inhibitor');
                this.system.type = 'inhibitor';
                new GEOJumpInhibitor(this.game, { server: this.conn.server }, this.system.label.text, this.owner);
                break;
            default:
                console.error('[BUILDER] Unknown build action:', action);
        }
        this.die();
    }

    /** Stop at the next system and clear any automation. */
    stop() {
        this.mode = null;
        this.__modeTick = 0;
        if (this.route.length > 1) this.route.splice(1);
    }

    /** Set an automation mode for this combat ship. */
    setMode(mode) {
        this.mode = mode;
        this.__modeTick = 0;
        this.__evaluateMode();
    }

    /** How long (ms) before a visited system loses its visit penalty. */
    static VISIT_COOLDOWN = 90000;

    /** Global per-owner+mode visit memory. Key = 'owner:mode:systemId' → timestamp. */
    static __globalVisitedAt = new Map();

    /** Penalty multiplier applied to scores when a system was globally visited by same owner+mode. */
    static GLOBAL_VISIT_PENALTY = 0.7;

    /** BFS hop distances from current system to all reachable systems. */
    __bfsDistances() {
        const dist = new Map();
        if (!this.system) return dist;
        const visited = new Set([this.system.id]);
        let frontier = [this.system];
        let d = 0;
        while (frontier.length > 0) {
            const next = [];
            for (const sys of frontier) {
                for (const c of sys.connections) {
                    if (visited.has(c.id)) continue;
                    visited.add(c.id);
                    dist.set(c.id, d + 1);
                    next.push(c);
                }
            }
            frontier = next;
            d++;
        }
        return dist;
    }

    /**
     * Deterministic best-pick: highest score wins among fresh candidates
     * (unvisited or cooldown-expired). Falls back to highest score among all
     * candidates if everything is in cooldown — combat ships never wait.
     * @param {GEOStarSystem[]} candidates
     * @param {(sys: GEOStarSystem) => number} scoreFn  — higher = better, ≤0 = invalid
     * @param {number} skip  — skip the top N picks (used when multiple peers share a system)
     * @returns {GEOStarSystem|null}
     */
    __bestCandidate(candidates, scoreFn, skip = 0) {
        if (!candidates.length) return null;
        const now = Date.now();
        const modeKey = this.owner + ':' + this.mode + ':';
        const scored = candidates
            .map(s => {
                let score = scoreFn(s);
                // Apply global per-mode penalty so ships of the same automation don't all pick the same path
                const globalT = GEOShip.__globalVisitedAt.get(modeKey + s.id) ?? 0;
                if (now - globalT < GEOShip.VISIT_COOLDOWN) score *= GEOShip.GLOBAL_VISIT_PENALTY;
                return { s, score, t: this.__visitedAt.get(s.id) ?? 0 };
            })
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score);
        if (!scored.length) return null;
        const fresh = scored.filter(x => now - x.t >= GEOShip.VISIT_COOLDOWN);
        const pool = fresh.length ? fresh : scored;
        return pool[Math.min(skip, pool.length - 1)].s;
    }

    /**
     * Like __bestCandidate but returns null when all candidates are in cooldown,
     * so invasion ships wait rather than oscillate between recently-visited nodes.
     * @param {GEOStarSystem[]} candidates
     * @param {(sys: GEOStarSystem) => number} scoreFn
     * @param {number} skip
     * @returns {GEOStarSystem|null}
     */
    __bestInvasionCandidate(candidates, scoreFn, skip = 0) {
        if (!candidates.length) return null;
        const now = Date.now();
        const modeKey = this.owner + ':' + this.mode + ':';
        const fresh = candidates
            .map(s => {
                let score = scoreFn(s);
                // Apply global per-mode penalty
                const globalT = GEOShip.__globalVisitedAt.get(modeKey + s.id) ?? 0;
                if (now - globalT < GEOShip.VISIT_COOLDOWN) score *= GEOShip.GLOBAL_VISIT_PENALTY;
                return { s, score };
            })
            .filter(x => x.score > 0 && now - (this.__visitedAt.get(x.s.id) ?? 0) >= GEOShip.VISIT_COOLDOWN)
            .sort((a, b) => b.score - a.score);
        if (!fresh.length) return null;
        return fresh[Math.min(skip, fresh.length - 1)].s;
    }

    /**
     * Among ships at the same system with the same mode, return this ship's rank (0-based)
     * sorted by ID. Used to spread multiple peers across different target candidates.
     */
    __peerRank() {
        return [...this.game.objectsOfTypes(GEOShip.t)]
            .filter(s => s.system === this.system && s.mode === this.mode && !s.isDead)
            .sort((a, b) => (a.id < b.id ? -1 : 1))
            .findIndex(s => s.id === this.id);
    }

    /** Pick next destination based on current automation mode. */
    __evaluateMode() {
        const allSystems = [...this.game.objectsOfTypes(GEOStarSystem.t)];
        const isEnemy = (s) => (s.owner !== null && s.owner !== this.owner) || [...s.ships].some(sh => sh.owner !== this.owner);
        // Only commit to the next single hop — ship re-evaluates on every arrival.
        const tryGo = (sys) => {
            try { this.goToSystem(sys.label.text, true); } catch (_) { return; }
            if (this.route.length > 2) this.route.length = 2;
        };
        const dist = this.__bfsDistances();
        const hops = (s) => dist.get(s.id) ?? 999;
        const rank = this.__peerRank();

        if (this.mode === 'search-destroy') {
            const candidates = allSystems.filter(s => s !== this.system && s.owner !== this.owner);
            const target = this.__bestCandidate(candidates, s => {
                const enemyShips = [...s.ships].filter(sh => sh.owner !== this.owner).length;
                const base = enemyShips * 50 + (s.owner !== null ? 10 : 1);
                return base / (1 + hops(s));
            }, rank);
            if (target) tryGo(target);
            return;
        }

        if (this.mode === 'search-defend') {
            const candidates = allSystems.filter(s => s !== this.system && !isEnemy(s));
            const target = this.__bestCandidate(candidates, s => {
                const adjEnemies = s.connections.filter(c => isEnemy(c)).length;
                const base = adjEnemies > 0 ? 10 + adjEnemies * 2 : 1;
                return base / (1 + hops(s));
            }, rank);
            if (target) tryGo(target);
            return;
        }

        if (this.mode === 'search') {
            const candidates = allSystems.filter(s => s !== this.system && !isEnemy(s) && s.owner !== this.owner);
            const target = this.__bestCandidate(candidates, s => 1 / (1 + hops(s)), rank);
            if (target) tryGo(target);
        }
    }

    /** Pick next destination for invasion automation modes. */
    __evaluateInvasionMode() {
        const allSystems = [...this.game.objectsOfTypes(GEOStarSystem.t)];
        // Only commit to the next single hop — ship re-evaluates on every arrival.
        const tryGo = (sys) => {
            try { this.goToSystem(sys.label.text, true); } catch (_) { return; }
            if (this.route.length > 2) this.route.length = 2;
        };
        const tryGoSafe = (sys) => {
            this.__goToSystemAvoidEnemy(sys.label.text);
            if (this.route.length > 2) this.route.length = 2;
        };
        const dist = this.__bfsDistances();
        const hops = (s) => dist.get(s.id) ?? 999;
        const rank = this.__peerRank();

        if (this.mode === 'search-resources') {
            const candidates = allSystems.filter(s => s !== this.system && s.owner === null);
            const target = this.__bestInvasionCandidate(candidates, s => {
                const base = s.type === 'resource' ? 10 : 1;
                return base / (1 + hops(s));
            }, rank);
            if (target) tryGoSafe(target);
            return;
        }

        if (this.mode === 'fill-borders') {
            const ownedSystems = new Set(allSystems.filter(s => s.owner === this.owner));
            const candidates = allSystems.filter(s =>
                s !== this.system && s.owner === null && s.connections.some(c => ownedSystems.has(c))
            );
            const target = this.__bestInvasionCandidate(candidates, s => {
                const ownedNeighbors = s.connections.filter(c => ownedSystems.has(c)).length;
                const base = ownedNeighbors >= 2 ? 10 : 1;
                return base / (1 + hops(s));
            }, rank);
            if (target) tryGo(target);
        }
    }

    /**
     * Route to a system via BFS that avoids passing through enemy-owned systems.
     * Falls back to normal goToSystem if no safe path exists.
     * Only modifies this.route directly (no server broadcast) — intended for
     * server-authoritative automation code only.
     * @param {string} systemName
     */
    __goToSystemAvoidEnemy(systemName) {
        const target = this.__systemByName(systemName);
        const start = this.system ?? (this.route.length > 0 ? this.route[0] : null);
        if (!start || !target) return;

        const prev = new Map();
        prev.set(start.id, null);
        const queue = [start];
        let found = false;
        outer: while (queue.length > 0) {
            const node = queue.shift();
            for (const neighbor of node.connections) {
                if (prev.has(neighbor.id)) continue;
                // Skip enemy-owned intermediate systems (target is always allowed)
                if (neighbor !== target && neighbor.owner !== null && neighbor.owner !== this.owner) continue;
                prev.set(neighbor.id, node);
                if (neighbor === target) { found = true; break outer; }
                queue.push(neighbor);
            }
        }
        if (!found) {
            // No safe path — fall back to normal routing through enemy territory
            try { this.goToSystem(systemName, true); } catch (_) { }
            return;
        }
        const path = [];
        let node = target;
        while (node !== null) {
            path.unshift(node);
            node = prev.get(node.id);
        }
        this.route.length = 0;
        this.route.push(...path);
    }

    /**
     * When a ship arrives at a system, set its __lastFired:
     * - Intruder (doesn't own the system): must wait a full cooldown before firing,
     *   guaranteeing the defender fires at least once first.
     * - Defender (owns the system): stagger 100ms per arrival order so multiple
     *   friendly ships don't all fire at the same instant.
     */
    __setFiringOffset() {
        if (!this.system) return;
        const owner = this.system.owner;

        if (owner !== null && this.owner !== owner) {
            // Intruder in owned territory: wait full cooldown — defender fires first
            this.__lastFired = Date.now();
            return;
        }

        // Defender in owned territory, or any ship in neutral territory:
        // stagger by arrival order (earliest-arrived fires first)
        const candidates = owner === null
            ? [...this.system.ships]
            : [...this.system.ships].filter(s => s.owner === owner);
        candidates.sort((a, b) => (a.__arrivalTime || 0) - (b.__arrivalTime || 0));
        const rank = candidates.findIndex(s => s.id === this.id);
        if (rank >= 0) {
            this.__lastFired = Date.now() - this.__attackCooldown + rank * 100;
        }

        // When a defender arrives, re-apply the full cooldown to any intruders
        // whose penalty has already expired (i.e. they arrived before the defender settled)
        if (owner !== null) {
            for (const ship of this.system.ships) {
                if (ship.owner !== owner && Date.now() - ship.__lastFired >= this.__attackCooldown) {
                    ship.__lastFired = Date.now();
                }
            }
        }
    }

    step() {
        super.step();
        this.conn.syncPosition();

        const fps = this.game.fps || 30;

        // --- Combat (combat class only) ---
        if (this.shipClass === 'combat') {
            const enemiesInSystem = this.system
                ? [...this.system.ships].filter(s => s.owner !== this.owner)
                : [];

            if (this.conn.server.mainServer && enemiesInSystem.length) {
                // Priority 1: enemy combat ships; Priority 2: other ships
                const target = enemiesInSystem.find(s => s.shipClass === 'combat')
                    ?? enemiesInSystem[0];
                this.fireLaser(target, this);
            }

            // Target structures: shield must be destroyed first; then attack enemy stations
            if (this.conn.server.mainServer && this.system && !enemiesInSystem.length) {
                if (this.system.owner !== this.owner && this.system.shieldHp > 0) {
                    // Phase 1: destroy the shield
                    if (Date.now() - this.__lastFired >= this.__attackCooldown) {
                        this.__lastFired = Date.now();
                        this.system.hitShield(1);
                        new GEOLaser(this.game, this, this.system, this.color);
                    }
                } else if (this.system.owner !== this.owner) {
                    // Phase 2: enemy system, shield down — attack enemy structures directly
                    // noinspection JSValidateTypes
                    /** @type {GEOStation | GEORepairStation | GEOJumpInhibitor | undefined} */
                    const enemyStation = [
                        ...this.game.objectsOfTypes(GEOStation.t), ...this.game.objectsOfTypes(GEORepairStation.t), ...this.game.objectsOfTypes(GEOJumpInhibitor.t)
                    ].find(x => x.system === this.system);
                    if (typeof enemyStation !== 'undefined') {
                        this.fireLaser(enemyStation, this);
                    }
                }
            }
        }

        // --- Invasion: capture progress ---
        if (this.shipClass === 'invasion' && this.system
            && this.system.owner !== this.owner
            && this.route.length === 0) {
            // Mode-specific capture gates: don't capture pass-through nodes
            const skipCapture =
                (this.mode === 'search-resources' && this.system.type !== 'resource')
                || (this.mode === 'fill-borders' && this.system.owner === null
                    && !this.system.connections.some(c => c.owner === this.owner));
            if (!skipCapture) {
                // Cannot capture while shield is up or enemy combat ships present
                const enemyCombat = [...this.system.ships].filter(
                    s => s.owner !== this.owner && s.shipClass === 'combat'
                );
                if (enemyCombat.length === 0 && this.system.shieldHp <= 0) {
                    this.system.captureProgress = Math.min(100, this.system.captureProgress + 0.3);
                    if (this.system.captureProgress >= 100) {
                        this.system.capture(this.owner);
                    }
                }
            }
        }

        // --- Territory Attrition (removed) ---

        // --- Death check ---
        if (this.health <= 0) {
            this.explode();
            return;
        }

        // --- Automation modes (combat ships only, server-authoritative) ---
        if (this.mode && this.shipClass === 'combat' && this.system
            && this.route.length === 0 && this.conn.server.mainServer) {
            this.__modeTick++;
            if (this.__modeTick >= fps * 3) {
                this.__modeTick = 0;
                this.__evaluateMode();
            }
        }

        // --- Automation modes (invasion ships, server-authoritative) ---
        // Re-evaluate when at owned system, OR at an unclaimed pass-through node that
        // the current mode should not capture (so ship moves on instead of idling).
        if (this.mode && this.shipClass === 'invasion' && this.system
            && this.route.length === 0 && this.conn.server.mainServer) {
            const atPassThrough =
                (this.mode === 'search-resources' && this.system.owner === null && this.system.type !== 'resource')
                || (this.mode === 'fill-borders' && this.system.owner === null
                    && !this.system.connections.some(c => c.owner === this.owner));
            if (this.system.owner === this.owner || atPassThrough) {
                this.__modeTick++;
                if (this.__modeTick >= fps * 3) {
                    this.__modeTick = 0;
                    this.__evaluateInvasionMode();
                }
            }
        }

        // Jump inhibitor: at enemy inhibitor system, can only retreat to previous system
        if (this.system && this.system.type === 'inhibitor' && this.system.owner !== this.owner) {
            if (this.route.length > 0 && this.route[0] !== this.__previousSystem) {
                this.route.length = 0;
            }
        }

        // --- Movement ---
        // Include ships physically within system radius that haven't formally arrived yet,
        // so a ship can't depart the moment before an enemy arrives.
        const enemyShipsInSystem = this.system
            ? [...this.game.objectsOfTypes(GEOShip.t)].filter(x =>
                x.owner !== this.owner &&
                (x.system === this.system ||
                 (x.system === null && x.route.length > 0 &&
                  x.route[0] === this.system && !x.__isInTransitTo(this.system)))
              )
            : [];

        if (this.system && enemyShipsInSystem.length > 0) {
            // Locked: opposing ships present — cannot depart under any circumstances
            this.s = 0;
        } else if (this.route.length) {
            // Depart from current system if physically still inside it
            if (this.system && !this.__isInTransitTo(this.system)) {
                this.__previousSystem = this.system;
                this.system.ships.delete(this);
                this.system = null;
            }

            const nextSystem = this.route[0];
            if (this.__isInTransitTo(nextSystem)) {
                this.d = this.angleTo(nextSystem);
                const base = GEOShip.SPEEDS[this.shipClass] ?? 2;
                const friendlyLane = this.__previousSystem?.owner === this.owner
                    && nextSystem.owner === this.owner;
                this.s = friendlyLane ? base * 1.3 : base;
            } else {
                if (this.system) {
                    this.system.ships.delete(this);
                }
                this.system = nextSystem;
                this.system.ships.add(this);
                this.__arrivalTime = Date.now();
                this.__visitedAt.set(this.system.id, Date.now());
                // Record visit globally for per-mode path diversity
                if (this.mode) {
                    GEOShip.__globalVisitedAt.set(this.owner + ':' + this.mode + ':' + this.system.id, Date.now());
                }
                this.__setFiringOffset();
                this.s = 0;
                this.route.shift();
            }
        } else {
            // Idle: collision avoidance within system
            if (this.system) {
                const ships = [...this.system.ships].filter(x => x.id !== this.id);
                for (let i = 0; i < 10; i++) {
                    const colliding = ships.find(x => this.distanceFrom(x) < this.r + x.r);
                    if (!colliding) break;
                    if (Math.random() > 0.5) {
                        this.x += (this.x - colliding.x) * 0.5;
                    } else {
                        this.y += (this.y - colliding.y) * 0.5;
                    }
                }
            }
        }
    }

    /**
     * Returns true while the ship is still travelling toward the system (hasn't arrived yet).
     * @param {GEOStarSystem} system
     * @return {boolean}
     */
    __isInTransitTo(system) {
        if (!system) return false;
        return this.distanceFrom(system) > this.r + system.r;
    }

    /**
     * Plans a route to a system.
     * @param {string} systemName
     * @param {boolean} replace
     */
    goToSystem(systemName, replace = false) {
        if (!replace) this.mode = null;
        const target = this.__systemByName(systemName);
        let start = this.system;
        if (start === null) {
            console.assert(this.route.length > 0, 'No route and no current system');
            start = this.route[0];
        }

        // BFS: guarantees shortest path on the system graph
        const prev = new Map();   // systemId → predecessor system
        prev.set(start.id, null);
        const queue = [start];
        let found = false;
        outer: while (queue.length > 0) {
            const node = queue.shift();
            for (const neighbor of node.connections) {
                if (!prev.has(neighbor.id)) {
                    prev.set(neighbor.id, node);
                    if (neighbor === target) { found = true; break outer; }
                    queue.push(neighbor);
                }
            }
        }
        if (!found) return;  // target unreachable

        // Reconstruct path: target → ... → start, then reverse
        const path = [];
        let node = target;
        while (node !== null) {
            path.unshift(node);
            node = prev.get(node.id);
        }

        if (replace) this.route.length = 0;
        this.route.push(...path);
    }

    saveDict() {
        const data = super.saveDict();
        data.xp = this.xp;
        data.veterancy = this.veterancy;
        data.shipClass = this.shipClass;
        return data;
    }

    loadDict(data) {
        super.loadDict(data);
        this.xp = data.xp ?? 0;
        this.veterancy = data.veterancy ?? 'rookie';
        this.shipClass = data.shipClass ?? 'combat';
    }

    /**
     * @param {string} systemName
     * @return {GEOStarSystem}
     * @private
     */
    __systemByName(systemName) {
        const system = [...this.game.objectsOfTypes(GEOStarSystem.t)].find(s => s?.label.text === systemName);
        if (!system) throw new Error(`System ${systemName} not found`);
        return system;
    }
}
