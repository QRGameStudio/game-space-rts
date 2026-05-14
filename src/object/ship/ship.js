/**
 * @typedef {'combat' | 'invasion' | 'siege'} GEOShipClass
 */

class GEOShip extends GEOSelectable {
    static t = 'ship';

    /** Base HP per class */
    static MAX_HP = { combat: 3, invasion: 1, siege: 2, fighter: 3, bomber: 2, builder: 3 };

    /** Attack cooldown in ms per veterancy level */
    static COOLDOWNS = { rookie: 2000, veteran: 1700, elite: 1400 };

    /** Speeds (units/step at 30fps → stored as step speed) */
    static SPEEDS = { combat: 2.5, invasion: 1.5, siege: 1.0, fighter: 2.5, bomber: 1.0, builder: 1.5 };

    /** Materials cost */
    static COSTS = { combat: 10, invasion: 15, siege: 20 };

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
        if (shipClass === 'builder') shipClass = 'combat';

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
        /** @type {number} XP gained from kills */
        this.xp = 0;
        /** @type {'rookie'|'veteran'|'elite'} */
        this.veterancy = 'rookie';
        /** Attrition tick counter */
        this.__attritionTick = 0;
        /** Siege: ticks since last station hit */
        this.__siegeTick = 0;

        this.conn.patchMethod(this.goToSystem);
        this.conn.patchMethod(this.__fireLaser);
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
    }

    die() {
        if (this.system) {
            this.system.ships.delete(this);
        }
        super.die();
    }

    /**
     * @param {GEO & {health: number}} to
     * @param {GEOShip} [killer] - who dealt the killing blow (for XP)
     */
    fireLaser(to, killer) {
        if (Date.now() - this.__lastFired < this.__attackCooldown) return;
        this.__lastFired = Date.now();
        const newHp = to.health - 1;
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

            if (this.conn.server.mainServer && this.owner === 'local' && enemiesInSystem.length) {
                // Priority 1: enemy combat ships; Priority 2: siege/invasion; Priority 3: shield
                const target = enemiesInSystem.find(s => s.shipClass === 'combat')
                    ?? enemiesInSystem[0];
                this.fireLaser(target, this);
            } else if (this.conn.server.mainServer && this.owner !== 'local') {
                // AI combat ships also fight
                if (enemiesInSystem.length) {
                    const target = enemiesInSystem.find(s => s.shipClass === 'combat') ?? enemiesInSystem[0];
                    this.fireLaser(target, this);
                }
            }

            // Target enemy system's shield (combat ships hit shields too)
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
                    this.system.ships.delete(this);
                    this.system = null;
                }
            }

            if (canLeave) {
                const nextSystem = this.route[0];
                if (this.__isInTransitTo(nextSystem)) {
                    this.d = this.angleTo(nextSystem);
                    this.s = GEOShip.SPEEDS[this.shipClass] ?? 2;
                } else {
                    if (this.system) {
                        this.system.ships.delete(this);
                    }
                    this.system = nextSystem;
                    this.system.ships.add(this);
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
        const systemTarget = this.__systemByName(systemName);
        const searched = new Set();
        const route = [];
        let curr = this.system;
        if (curr === null) {
            console.assert(this.route.length > 0, 'No route and no current system');
            curr = this.route[0];
        }
        route.push(curr);
        while (curr !== systemTarget) {
            if (searched.has(curr.id)) break;
            searched.add(curr.id);
            const next = [...curr.connections]
                .sort((a, b) => a.distanceFrom(systemTarget) - b.distanceFrom(systemTarget))
                .find(s => !searched.has(s.id));
            if (!next) break;
            route.push(next);
            curr = next;
        }
        if (replace) this.route.length = 0;
        this.route.push(...route);
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
