class GEOStarSystem extends GEOSelectable {
    static t = 'system';

    /** @type {Object.<string,string>} Owner → color */
    static OWNER_COLORS = {
        'local': '#00E5FF',
        null: '#546E7A',
    };

    static ownerColor(owner) {
        return GEOStarSystem.OWNER_COLORS[owner] ?? '#FF1744';
    }

    /**
     * @param game {GEG}
     * @param x {number}
     * @param y {number}
     * @param server {ServerConnection|null}
     */
    constructor(game, x, y, server = null) {
        super(game, null, null);
        /** @type {ServerConnection|null} Used only on main server for spawning */
        this.__server = server;
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
        /** @type {'neutral'|'resource'|'producing'|'repair'} */
        this.type = 'neutral';
        /** @type {number} Materials stockpile */
        this.materials = 0;
        /** @type {{shipClass: string, ticksLeft: number, cost: number}[]} */
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
    }

    /** Returns true if this system should be visible to the player */
    get visible() {
        if (this.owner === 'local') return true;
        // Adjacent to a player-owned system
        return this.connections.some(c => c.owner === 'local');
    }

    /** @param {string|null} newOwner */
    capture(newOwner) {
        this.owner = newOwner;
        this.captureProgress = 0;
        if (this.__server?.mainServer) {
            this.__server.sendEvent('system:capture', { name: this.label.text, owner: newOwner });
        }
    }

    /**
     * Queue a ship or shield build. Only works on producing nodes.
     * @param {string} shipClass
     */
    addToQueue(shipClass) {
        if (this.type !== 'producing') return;
        const COSTS   = { combat: 10, invasion: 15, siege: 20, shield: 5 };
        const TIMES   = { combat: 15 * 30, invasion: 20 * 30, siege: 30 * 30, shield: 10 * 30 };
        const cost  = COSTS[shipClass]  ?? 10;
        const ticks = TIMES[shipClass]  ?? 15 * 30;
        this.buildQueue.push({ shipClass, ticksLeft: ticks, cost });
    }

    /** @param {number} dmg */
    hitShield(dmg) {
        if (this.shieldHp <= 0) return false; // no shield
        this.shieldHp = Math.max(0, this.shieldHp - dmg);
        this.__shieldHitRecently = true;
        this.__shieldRegenTick = 0;
        return true; // shield absorbed the hit
    }

    onclick(x, y, clickedObject) {
        if (clickedObject.size > 1) return false;

        console.debug('[System] selecting', this.label.text);
        this.constructor.selectedId = this.id;
        if (GEOShip.selectedId !== null) {
            const ship = [...this.game.objectsOfTypes(GEOShip.t)].find(s => s.id === GEOShip.selectedId);
            if (ship) {
                ship.goToSystem(this.label.text);
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
        if (this.type === 'resource') {
            this.__resourceTick++;
            if (this.__resourceTick >= fps * 10) {
                this.__resourceTick = 0;
                this.__spawnTransport();
            }
        }

        // Producing node: process build queue
        if (this.type === 'producing' && this.owner !== null) {
            if (this.buildQueue.length > 0) {
                const item = this.buildQueue[0];
                item.ticksLeft--;
                if (item.ticksLeft <= 0) {
                    if (this.materials >= item.cost) {
                        this.materials -= item.cost;
                        this.buildQueue.shift();
                        if (item.shipClass === 'shield') {
                            this.shieldHp = Math.min(this.shieldHp + this.shieldMaxHp, this.shieldMaxHp);
                        } else {
                            this.__spawnFleet(item.shipClass);
                        }
                    } else {
                        item.ticksLeft = 0; // wait for materials
                    }
                }
            }
        }

        // Repair node: heal friendly ships
        if (this.type === 'repair' && this.owner !== null) {
            this.__repairTick++;
            if (this.__repairTick >= fps * 5) {
                this.__repairTick = 0;
                for (const ship of this.ships) {
                    if (ship.owner === this.owner) {
                        const maxHp = GEOShip.MAX_HP[ship.shipClass] ?? 3;
                        if (ship.health < maxHp) ship.health = Math.min(ship.health + 1, maxHp);
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
    }

    __spawnTransport() {
        if (!this.__server?.mainServer) return;
        const systems = [...this.game.objectsOfTypes(GEOStarSystem.t)];
        const target = systems
            .filter(s => s !== this && s.type === 'producing' && s.buildQueue.length > 0)
            .sort((a, b) => GEG.distanceBetween(this, a) - GEG.distanceBetween(this, b))[0];
        if (!target) return;
        const color = '#546E7A';
        new GEOTransport(this.game, this.label.text, this.owner, color, target.label.text);
    }

    __spawnFleet(shipClass) {
        if (!this.__server?.mainServer) return;
        const color = GEOStarSystem.ownerColor(this.owner);
        new GEOShip(this.game, {server: this.__server}, color, this.label.text, this.owner, shipClass);
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
            ctx.strokeStyle = laneVisible ? '#546E7A' : '#1a2030';
            ctx.lineWidth = 2;
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
        const TYPE_COLORS = { resource: '#FFD600', producing: '#00E676', repair: '#2979FF', neutral: null };
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
            const connection = [...this.game.objectsOfTypes(GEOStarSystem.t)].find(s => s?.label.text === connectionName);
            if (connection) {
                this.connections.push(connection);
                connection.connections.push(this);
            }
        }
    }
}
