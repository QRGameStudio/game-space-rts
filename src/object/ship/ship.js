/**
 * @typedef {'combat' | 'invasion' | 'siege' | 'builder'} GEOShipClass
 */

class GEOShip extends GEOSelectable {
    static t = 'ship';

    /** Base HP per class */
    static MAX_HP = { combat: 3, invasion: 1, siege: 2, builder: 1, fighter: 3, bomber: 2 };

    /** Attack cooldown in ms per veterancy level */
    static COOLDOWNS = { rookie: 2000, veteran: 1700, elite: 1400 };

    /** Speeds (units/step at 30fps → stored as step speed) */
    static SPEEDS = { combat: 2.5, invasion: 1.5, siege: 1.0, builder: 1.2, fighter: 2.5, bomber: 1.0 };

    /** Materials cost */
    static COSTS = { combat: 10, invasion: 15, siege: 20, builder: 30 };

    /**
     * @param game {GEG}
     * @param server {GEOServerConnection}
     * @param color {string}
     * @param systemName {string}
     * @param owner {string}
     * @param shipClass {GEOShipClass}
     */
    constructor(game, server, color, systemName, owner, shipClass) {
        super(game, server, owner);

        // Normalise legacy class names
        if (shipClass === 'fighter') shipClass = 'combat';
        if (shipClass === 'bomber') shipClass = 'siege';

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
            case 'siege':
                this.w = 25; this.h = 50;
                this.health = GEOShip.MAX_HP.siege;
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
        this.color = color;

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
        /** Siege: ticks since last station hit */
        this.__siegeTick = 0;
        /** @type {null|'search'|'search-defend'|'search-destroy'} Automation mode */
        this.mode = null;
        /** Tick counter for automation re-evaluation */
        this.__modeTick = 0;

        this.conn.patchMethod(this.goToSystem);
        this.conn.patchMethod(this.setMode);
        this.conn.patchMethod(this.stop);
        this.conn.patchMethod(this.buildShipyard);
        this.sendCreationEvent(arguments);
        this.goToSystem(systemName, true);
    }

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
                const to   = this.route.length > 0 ? this.route[0] : null;
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
        } else if (this.shipClass === 'siege') {
            // Downward triangle
            ctx.moveTo(this.x, this.y + this.hh);
            ctx.lineTo(this.x + this.wh, this.y - this.hh);
            ctx.lineTo(this.x - this.wh, this.y - this.hh);
            ctx.closePath();
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
            const MODE_ICONS = { 'search': '◎', 'search-defend': '◈', 'search-destroy': '✕' };
            const MODE_COLORS = { 'search': '#00BCD4', 'search-defend': '#FFD600', 'search-destroy': '#FF1744' };
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
        // Spawn expanding ring explosion at ship position
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

    /** Builder ship: convert this system to a shipyard and consume the ship. */
    buildShipyard() {
        if (this.shipClass !== 'builder' || !this.system || this.system.owner !== this.owner) return;
        if (!this.conn.server.mainServer) return;
        const hasStation = [...this.game.objectsOfTypes(GEOStation.t)].some(st => st.system === this.system);
        if (hasStation) return;
        this.system.type = 'producing';
        new GEOStation(this.game, {server: this.conn.server}, this.color, this.system.label.text, this.owner);
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

    /** Pick next destination based on current automation mode. */
    __evaluateMode() {
        const allSystems = [...this.game.objectsOfTypes(GEOStarSystem.t)];
        const hasEnemy = (sys) => (sys.owner !== null && sys.owner !== this.owner) || [...sys.ships].some(s => s.owner !== this.owner);
        const tryGo = (sys) => { try { this.goToSystem(sys.label.text, true); } catch (_) {} };

        let actionTaken = false;

        if (this.mode === 'search-defend') {
            // Park one hop away from an enemy-occupied system
            const candidates = allSystems.filter(s => s !== this.system
                && !hasEnemy(s)
                && s.connections.some(c => hasEnemy(c)));
            if (candidates.length) {
                tryGo(candidates[Math.floor(Math.random() * candidates.length)]);
                actionTaken = true;
            }
        } else if (this.mode === 'search-destroy') {
            // Rush the nearest visible enemy system within 3 hops
            const target = this.__findEnemySystemWithinRange(3);
            if (target) {
                tryGo(target);
                actionTaken = true;
            }
        }

        if (this.mode === 'search' || (!actionTaken && (this.mode === 'search-defend' || this.mode === 'search-destroy'))) {
            // Visit non-player systems that currently have no enemies
            const candidates = allSystems.filter(s => s !== this.system
                && s.owner !== this.owner && !hasEnemy(s));
            if (candidates.length) tryGo(candidates[Math.floor(Math.random() * candidates.length)]);
        }
    }

    /** BFS: find the closest system within `range` hops that is visible and has enemy ships. */
    __findEnemySystemWithinRange(range) {
        if (!this.system) return null;
        const visited = new Set([this.system.id]);
        let frontier = [this.system];
        for (let d = 0; d < range; d++) {
            const next = [];
            for (const sys of frontier) {
                for (const c of sys.connections) {
                    if (visited.has(c.id)) continue;
                    visited.add(c.id);
                    if (GEOStarSystem.visibleIds.has(c.id)
                        && [...c.ships].some(s => s.owner !== this.owner)) return c;
                    next.push(c);
                }
            }
            frontier = next;
        }
        return null;
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
                // Priority 1: enemy combat ships; Priority 2: siege/invasion
                const target = enemiesInSystem.find(s => s.shipClass === 'combat')
                    ?? enemiesInSystem[0];
                this.fireLaser(target, this);
            }

            // Target enemy system's shield
            if (this.conn.server.mainServer && this.system && this.system.owner !== this.owner
                && this.system.shieldHp > 0 && !enemiesInSystem.length) {
                if (Date.now() - this.__lastFired >= this.__attackCooldown) {
                    this.__lastFired = Date.now();
                    this.system.hitShield(1);
                    new GEOLaser(this.game, this, this.system, this.color);
                }
            }
        }

        // --- Siege: attack enemy stations ---
        if (this.shipClass === 'siege' && this.system && this.system.owner !== this.owner && this.system.owner !== null) {
            this.__siegeTick++;
            if (this.__siegeTick >= fps * 2) {
                this.__siegeTick = 0;
                const enemyStation = [...this.game.objectsOfTypes(GEOStation.t)]
                    .find(st => st.system === this.system && st.owner !== this.owner);
                if (enemyStation) {
                    this.__fireLaser(enemyStation, enemyStation.health - 1);
                }
            }
        } else {
            this.__siegeTick = 0;
        }

        // --- Invasion: capture progress ---
        if (this.shipClass === 'invasion' && this.system
            && this.system.owner !== this.owner
            && this.route.length === 0) {
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

        // --- Territory Attrition ---
        if (this.system && this.system.owner !== null && this.system.owner !== this.owner) {
            this.__attritionTick++;
            if (this.__attritionTick >= fps * 10) {
                this.__attritionTick = 0;
                this.health -= 1;
            }
        } else {
            this.__attritionTick = 0;
        }

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

        // S&DEFEND: if already parked adjacent to an enemy, cancel any further travel
        if (this.mode === 'search-defend' && this.system && this.route.length > 0) {
            const hasEnemy = (sys) => (sys.owner !== null && sys.owner !== this.owner) || [...sys.ships].some(s => s.owner !== this.owner);
            if (this.system.connections.some(c => hasEnemy(c))) {
                this.route.length = 0;
            }
        }

        // --- Movement ---
        const enemyShipsInSystem = this.system
            ? [...this.system.ships].filter(x => x.owner !== this.owner)
            : [];

        if (this.route.length) {
            let canLeave = true;
            if (this.system) {
                // Combat ships blockade — only combat ships block movement
                if (enemyShipsInSystem.filter(s => s.shipClass === 'combat').length) {
                    canLeave = false;
                } else if (!this.__isInTransitTo(this.system)) {
                    this.__previousSystem = this.system;
                    this.system.ships.delete(this);
                    this.system = null;
                }
            }

            if (canLeave) {
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
                    this.__setFiringOffset();
                    this.s = 0;
                    this.route.shift();
                }
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
