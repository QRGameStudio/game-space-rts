class GEOStarSystem extends GEOSelectable {
    static t = 'system';

    /** Precomputed set of system IDs visible to the player. Updated each tick by computeVisibility(). */
    static visibleIds = new Set();

    /** Timestamp (ms) of when each system was last in the visible set. Used for fog-of-war linger. */
    static __lastVisibleTime = new Map();

    /**
     * Recompute fog-of-war visibility for the local player and cache in visibleIds.
     * Rules:
     *   - Owned systems + their range-1 neighbours
     *   - Player ships in a system + range-1 neighbours
     *   - Player stations + range-2 neighbourhood
     * @param {GEG} game
     */
    static computeVisibility(game) {
        const visible = new Set();

        const addRange1 = (sys) => {
            visible.add(sys.id);
            for (const c of sys.connections) visible.add(c.id);
        };

        const addRange2 = (sys) => {
            visible.add(sys.id);
            for (const c of sys.connections) {
                visible.add(c.id);
                for (const c2 of c.connections) visible.add(c2.id);
            }
        };

        for (const sys of game.objectsOfTypes(GEOStarSystem.t)) {
            if (sys.owner === 'local') addRange1(sys);
        }
        for (const ship of game.objectsOfTypes(GEOShip.t)) {
            if (ship.owner !== 'local') continue;
            if (ship.system) {
                addRange1(ship.system);
            } else {
                // In transit: reveal both the system departed from and the next waypoint
                if (ship.__previousSystem) addRange1(ship.__previousSystem);
                if (ship.route && ship.route.length > 0) addRange1(ship.route[0]);
            }
        }
        for (const station of game.objectsOfTypes(GEOStation.t)) {
            if (station.owner === 'local' && station.system) addRange2(station.system);
        }

        GEOStarSystem.visibleIds = visible;

        // Update linger timestamps for newly-visible systems
        const now = Date.now();
        for (const id of visible) {
            GEOStarSystem.__lastVisibleTime.set(id, now);
        }
    }

    /** @type {Object.<string,string>} Owner → color. Built dynamically via registerOwnerColor(). */
    static OWNER_COLORS = {
        null: '#546E7A',
    };

    /**
     * Register a team colour and broadcast it to all clients via a server event.
     * Call this on the main server before creating any ships or stations.
     * All clients should call listenForColors() so they receive remote registrations.
     * @param {ServerConnection} server
     * @param {string} owner
     * @param {string} color
     */
    static registerOwnerColor(server, owner, color) {
        GEOStarSystem.OWNER_COLORS[owner] = color;
        if (server?.mainServer) {
            server.sendEvent('player:color', { owner, color });
        }
    }

    /**
     * Set up a listener on `server` so incoming player:color events update the local map.
     * Call this on every ServerConnection (main + AI) before colors are registered.
     * @param {ServerConnection} server
     */
    static listenForColors(server) {
        server.onEventListener((ev, src, data) => {
            GEOStarSystem.OWNER_COLORS[data.owner] = data.color;
        }, 'player:color');
    }

    static ownerColor(owner) {
        return GEOStarSystem.OWNER_COLORS[owner] ?? '#888888';
    }

    /**
     * @param game {GEG}
     * @param x {number}
     * @param y {number}
     * @param server {GEOServerConnection}
     */
    constructor(game, x, y, server) {
        console.assert(game instanceof GEG, '[GEOStarSystem] game must be an instance of GEG');
        console.assert(typeof server.server === 'undefined', '[GEOStarSystem] server.server must be defined');
        super(game, server, null);
        this.sides = 8;
        this.t = GEOStarSystem.t;
        this.x = x;
        this.y = y;
        /** @type {Set<GEOShip>} */
        this.ships = new Set();
        this.label = new GEOLabel(this.game, this, randomName());
        this.gonioCoefficient = 2 * PI / this.sides;
        this.clickable = true;

        this.w = this.h = 75;

        /** @type {GEOStarSystem[]} */
        this.connections = [];

        // Ownership & economy
        /** @type {string|null} 'local', AI team name, or null (neutral) */
        this.owner = null;
        /** @type {'neutral'|'resource'|'producing'|'repair'|'inhibitor'} */
        this.type = 'neutral';
        /** @type {number} Materials stockpile */
        this.materials = 0;
        /** @type {{shipClass: string, ticksLeft: number}[]} */
        this.buildQueue = [];
        /** @type {number} 0–100; invasion fleet increments this */
        this.captureProgress = 0;

        // Planetary shield
        /** @type {number} Current shield HP (0 = no shield) */
        this.shieldHp = 0;
        /** @type {number} Max shield HP when built */
        this.shieldMaxHp = 20;
        /** @type {number} Ticks since last shield hit (for regen delay) */
        this.__shieldRegenTick = 0;
        this.__shieldHitRecently = false;

        // Tick counters (steps at 30fps)
        this.__resourceTick = 0;
        this.__repairTick = 0;

        this.conn.patchMethod(this.capture);
        this.conn.patchMethod(this.buildShields);
        this.conn.patchMethod(this.hitShield);
    }

    /** Returns true if this system is currently visible to the player (fog of war, with 2s linger). */
    get visible() {
        if (GEOStarSystem.visibleIds.has(this.id)) return true;
        const last = GEOStarSystem.__lastVisibleTime.get(this.id);
        return last !== undefined && Date.now() - last < 2000;
    }

    /** @param {string|null} newOwner */
    capture(newOwner) {
        this.owner = newOwner;
        this.captureProgress = 0;
    }

    /**
     * Queue a ship or shield build. Only works on producing nodes.
     * Materials are deducted immediately on queuing.
     * @param {string} shipClass
     */
    addToQueue(shipClass) {
        if (this.type !== 'producing') return;
        const COSTS = { combat: 10, invasion: 15, shield: 5, builder: 50 };
        const TIMES = { combat: 15 * 30, invasion: 20 * 30, shield: 10 * 30, builder: 25 * 30 };
        const cost  = COSTS[shipClass]  ?? 10;
        const ticks = TIMES[shipClass]  ?? 15 * 30;
        if (this.materials < cost) return; // insufficient materials — silently ignore

        // Fleet capacity: 1 per owned system + 2 per owned shipyard, minimum 3 (shields don't count)
        if (shipClass !== 'shield') {
            const allSystems = [...this.game.objectsOfTypes(GEOStarSystem.t)];
            const allStations = [...this.game.objectsOfTypes(GEOStation.t)];
            const ownedSystems  = allSystems.filter(s => s.owner === this.owner).length;
            const ownedStations = allStations.filter(s => s.owner === this.owner).length;
            const cap = Math.max(3, ownedSystems + ownedStations * 2);
            const activeShips = [...this.game.objectsOfTypes(GEOShip.t)].filter(s => s.owner === this.owner).length;
            const queuedShips = allSystems
                .filter(s => s.owner === this.owner)
                .reduce((n, s) => n + s.buildQueue.filter(q => q.shipClass !== 'shield').length, 0);
            if (activeShips + queuedShips >= cap) return; // at fleet cap
        }

        this.materials -= cost;
        this.buildQueue.push({ shipClass, ticksLeft: ticks });
    }

    /** @param {number} dmg */
    hitShield(dmg) {
        if (this.shieldHp <= 0) return false; // no shield
        this.shieldHp = Math.max(0, this.shieldHp - dmg);
        this.__shieldHitRecently = true;
        this.__shieldRegenTick = 0;
        return true; // shield absorbed the hit
    }

    /**
     * Instantly restore shields to max HP
     */
    buildShields() {
        this.shieldHp = this.shieldMaxHp;
    }

    onclick(x, y, clickedObject) {
        if (clickedObject.size > 1) return false;

        console.debug('[System] selecting', this.label.text);
        this.constructor.selectedId = this.id;
        if (GEOShip.selectedId !== null) {
            const ship = [...this.game.objectsOfTypes(GEOShip.t)].find(s => s.id === GEOShip.selectedId);
            if (ship) {
                ship.stop();
                ship.goToSystem(this.label.text, true);
                setTimeout(() => {
                    if (this.constructor.selectedId === this.id) {
                        this.constructor.selectedId = null;
                        GEOShip.selectedId = null;
                    }
                }, 200);
            }
        } else {
            this.selectObject();
        }
        return true;
    }

    step() {
        const fps = this.game.fps || 30;

        // Resource node: spawn transports
        if (this.type === 'resource' && this.owner !== null) {
            this.__resourceTick++;
            if (this.__resourceTick >= fps * 10) {
                this.__resourceTick = 0;
                this.__spawnTransport();
            }
        }

        // Producing node: process build queue (materials already deducted at queue time)
        if (this.type === 'producing' && this.owner !== null) {
            if (this.buildQueue.length > 0) {
                const item = this.buildQueue[0];
                item.ticksLeft--;
                if (item.ticksLeft <= 0) {
                    this.buildQueue.shift();
                    if (item.shipClass === 'shield') {
                        this.shieldHp = Math.min(this.shieldHp + this.shieldMaxHp, this.shieldMaxHp);
                    } else {
                        this.__spawnFleet(item.shipClass);
                    }
                }
            }
        }

        // Repair node: heal 1 entity per 5s — station self-repair first, then most-damaged ship
        if (this.type === 'repair' && this.owner !== null) {
            this.__repairTick++;
            if (this.__repairTick >= fps * 5) {
                this.__repairTick = 0;
                const repairSt = [...this.game.objectsOfTypes(GEORepairStation.t)].find(st => st.system === this);
                if (repairSt && repairSt.health < GEORepairStation.MAX_HP) {
                    repairSt.health = Math.min(repairSt.health + 1, GEORepairStation.MAX_HP);
                } else {
                    const candidates = [...this.ships].filter(s => s.owner === this.owner);
                    const damaged = candidates.filter(s => s.health < (GEOShip.MAX_HP[s.shipClass] ?? 3));
                    if (damaged.length > 0) {
                        const target = damaged.reduce((a, b) => {
                            const aDmg = (GEOShip.MAX_HP[a.shipClass] ?? 3) - a.health;
                            const bDmg = (GEOShip.MAX_HP[b.shipClass] ?? 3) - b.health;
                            return aDmg > bDmg ? a : b;
                        });
                        target.health = Math.min(target.health + 1, GEOShip.MAX_HP[target.shipClass] ?? 3);
                    }
                }
            }
        }

        // Shield regen (1 HP per 5s, only if not hit recently)
        if (this.shieldHp > 0 && this.shieldHp < this.shieldMaxHp) {
            if (this.__shieldHitRecently) {
                this.__shieldRegenTick++;
                if (this.__shieldRegenTick >= fps * 5) {
                    this.__shieldHitRecently = false;
                    this.__shieldRegenTick = 0;
                }
            } else {
                this.__shieldRegenTick++;
                if (this.__shieldRegenTick >= fps * 5) {
                    this.__shieldRegenTick = 0;
                    this.shieldHp = Math.min(this.shieldHp + 1, this.shieldMaxHp);
                }
            }
        }

        // Revert capture progress if no invasion fleet is present
        if (this.captureProgress > 0) {
            const hasInvasion = [...this.ships].some(s => s.shipClass === 'invasion' && s.owner !== this.owner);
            if (!hasInvasion) {
                this.captureProgress = Math.max(0, this.captureProgress - 0.1);
            }
        }
    }

    __spawnTransport() {
        if (!this.conn.server.mainServer) return;
        const systems = [...this.game.objectsOfTypes(GEOStarSystem.t)];
        const target = systems
            .filter(s => s !== this && s.owner === this.owner && s.type === 'producing' && s.materials < 50)
            .sort((a, b) => GEG.distanceBetween(this, a) - GEG.distanceBetween(this, b))[0];
        if (!target) return;
        const color = '#546E7A';
        new GEOTransport(this.game, this.label.text, this.owner, color, target.label.text);
    }

    __spawnFleet(shipClass) {
        if (!this.conn.server.mainServer) return;
        new GEOShip(this.game, {server: this.conn.server}, this.label.text, this.owner, shipClass);
    }

    draw(ctx) {
        const color = GEOStarSystem.ownerColor(this.owner);
        const isSelected = this.constructor.selectedId === this.id;
        const isVisible = this.visible;

        // Draw lane connections (always visible but dim if both ends hidden)
        for (const connection of this.connections) {
            // Only draw once per edge (lower id draws)
            if (this.id >= connection.id) continue;
            ctx.beginPath();
            const angleTo = GUt.countAngle(connection.x - this.x, connection.y - this.y);
            const pointStart = GUt.pointRelativeToAngle(this.x, this.y, this.d, this.w / 2, angleTo);
            const pointEnd = GUt.pointRelativeToAngle(connection.x, connection.y, connection.d, connection.w / 2, angleTo + 180);
            ctx.moveTo(pointStart.x, pointStart.y);
            ctx.lineTo(pointEnd.x, pointEnd.y);
            const laneVisible = isVisible || connection.visible;
            const sharedOwner = this.owner !== null && this.owner === connection.owner;
            ctx.strokeStyle = (sharedOwner && laneVisible)
                ? GEOStarSystem.ownerColor(this.owner)
                : (laneVisible ? '#546E7A' : '#1a2030');
            ctx.lineWidth = (sharedOwner && laneVisible) ? 3 : 2;
            ctx.stroke();
        }

        // Hidden systems: just a dim dot
        if (!isVisible) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, 8, 0, 2 * PI);
            ctx.fillStyle = '#1a2030';
            ctx.fill();
            return;
        }

        // Planetary shield ring (outermost)
        if (this.shieldHp > 0) {
            const shieldRadius = this.wh + 18;
            const shieldAlpha = 0.15 + 0.35 * (this.shieldHp / this.shieldMaxHp);
            ctx.beginPath();
            ctx.arc(this.x, this.y, shieldRadius, 0, 2 * PI);
            ctx.strokeStyle = `rgba(0, 150, 255, ${shieldAlpha + 0.3})`;
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(this.x, this.y, shieldRadius, 0, 2 * PI);
            ctx.fillStyle = `rgba(0, 100, 255, ${shieldAlpha})`;
            ctx.fill();
        }

        // System octagon
        ctx.beginPath();
        for (let i = 0; i < this.sides; i++) {
            const sideX = this.x - this.wh * cos(this.gonioCoefficient * i);
            const sideY = this.y - this.hh * sin(this.gonioCoefficient * i);
            if (i === 0) ctx.moveTo(sideX, sideY);
            else ctx.lineTo(sideX, sideY);
        }
        ctx.closePath();
        ctx.strokeStyle = isSelected ? 'orange' : color;
        ctx.lineWidth = isSelected ? 6 : 4;
        ctx.stroke();

        // Type indicator dot
        const TYPE_COLORS = { resource: '#FFD600', producing: '#00E676', repair: '#2979FF', inhibitor: '#FF1744', neutral: null };
        const dotColor = TYPE_COLORS[this.type];
        if (dotColor) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, 6, 0, 2 * PI);
            ctx.fillStyle = dotColor;
            ctx.fill();
        }

        // Capture progress bar
        if (this.captureProgress > 0) {
            const barW = this.w;
            const barH = 5;
            const barX = this.x - barW / 2;
            const barY = this.y + this.hh + 8;
            ctx.fillStyle = '#1a2236';
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = '#FF6F00';
            ctx.fillRect(barX, barY, barW * (this.captureProgress / 100), barH);
        }

        // Ship count per faction (drawn above system)
        if (this.ships.size > 0) {
            // Group by owner
            const counts = {};
            for (const ship of this.ships) {
                counts[ship.owner] = (counts[ship.owner] || 0) + 1;
            }
            let offsetX = this.x - 20;
            const textY = this.y - this.hh - 14;
            ctx.font = 'bold 14px monospace';
            for (const [owner, count] of Object.entries(counts)) {
                ctx.fillStyle = GEOStarSystem.ownerColor(owner);
                ctx.textAlign = 'left';
                ctx.fillText(`${count}`, offsetX, textY);
                offsetX += 18;
            }
        }

        // Materials label (producing nodes)
        if (this.type === 'producing' && this.owner !== null && this.materials > 0) {
            ctx.fillStyle = '#00E676';
            ctx.font = '11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${Math.floor(this.materials)}M`, this.x, this.y + this.hh + 22);
        }
    }

    saveDict() {
        return {
            ...super.saveDict(),
            name: this.label.text,
            connections: this.connections.map(c => c.label.text),
            owner: this.owner,
            type: this.type,
            materials: this.materials,
            shieldHp: this.shieldHp,
        };
    }

    loadDict(data) {
        super.loadDict(data);
        this.label.text = data.name;
        this.owner = data.owner ?? null;
        this.type = data.type ?? 'neutral';
        this.materials = data.materials ?? 0;
        this.shieldHp = data.shieldHp ?? 0;
        for (const connectionName of data.connections) {
            /** @type {GEOStarSystem} */
            const connection = [...this.game.objectsOfTypes(GEOStarSystem.t)].find(s => s?.label.text === connectionName);
            if (connection) {
                this.connections.push(connection);
                connection.connections.push(this);
            }
        }
    }
}
