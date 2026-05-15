class GEOStation extends GEOSelectable {
    static t = 'station';
    static MAX_HP = 8;

    /**
     *
     * @param game {GEG}
     * @param server {GEOServerConnection}
     * @param systemName {string}
     * @param owner {string}
     */
    constructor(game, server, systemName, owner) {
        super(game, server, owner);
        this.w = 40;
        this.h = 40;
        this.t = this.constructor.t;
        this.health = GEOStation.MAX_HP;
        this.clickable = true;

        this.system = this.__systemByName(systemName);
        this.x = this.system.x + this.system.wh + 15 + this.w;
        this.y = this.system.y;
        this.__repairTick = 0;
        this.conn.patchMethod(this.build);
        this.conn.patchMethod(this.dismantle);
        this.sendCreationEvent(arguments);
    }

    /** Color is always derived live from the owner's registered colour. */
    get color() { return GEOStarSystem.ownerColor(this.owner); }

    /**
     * Queue a ship build. Only runs on authoritative server to prevent free spawns
     * on non-main-server clients whose system type may not be synced.
     */
    build(objClass) {
        if (!this.conn.server.mainServer) return;
        if (this.system && this.system.type === 'producing') {
            this.system.addToQueue(objClass);
        }
    }

    /**
     * Dismantle this shipyard: refund 20 materials, revert system to neutral.
     */
    dismantle() {
        if (!this.conn.server.mainServer) return;
        if (!this.system) return;
        this.system.materials = (this.system.materials || 0) + 20;
        this.die();
    }

    onclick(x, y, clickedObject) {
        if (this.owner !== 'local') {
            return false;
        }
        if ([...clickedObject].find(x => x.t === GEOShip.t)) {
            // if also ship is clicked, prefer the ship
            return false;
        }
        this.selectObject();
        return true;
    }

    draw(ctx) {
        if (this.owner !== 'local') {
            if (!this.system || !this.system.visible) return;
        }
        ctx.strokeStyle = this.constructor.selectedId === this.id ? 'orange' : this.color;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.rect(this.x - this.wh, this.y - this.hh, this.w, this.h);
        ctx.rect(this.x - this.wh - (this.wh * 0.5), this.y - (ctx.lineWidth / 2), this.wh * 0.5, ctx.lineWidth);
        ctx.rect(this.x + this.wh, this.y - (ctx.lineWidth / 2), this.wh * 0.5, ctx.lineWidth);
        ctx.rect(this.x - this.wh - (this.wh * 0.5) - (ctx.lineWidth / 2), this.y - (this.wh * 0.75), ctx.lineWidth, this.h * 0.75);
        ctx.rect(this.x + this.wh + (this.wh * 0.5), this.y - (this.wh * 0.75), ctx.lineWidth, this.h * 0.75);
        ctx.closePath();
        ctx.stroke();
    }

    explode() {
        const x = this.x, y = this.y, color = this.color;
        const boom = new GEO(this.game);
        boom.x = x; boom.y = y; boom.w = boom.h = 400;
        let tick = 0;
        boom.step = function () { tick++; if (tick >= 20) this.die(); };
        boom.draw = function (ctx) {
            const r = tick * 8;
            ctx.save();
            ctx.globalAlpha = Math.max(0, 1 - tick / 20);
            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.stroke();
            if (tick > 3) {
                ctx.beginPath();
                ctx.arc(x, y, (tick - 3) * 10, 0, Math.PI * 2);
                ctx.strokeStyle = '#FF6F00';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            ctx.restore();
        };
        if (this.system?.visible) {
            (async () => {
                (await MUSIC.get("boom")).play(0, 60);
            })();
        }
        super.explode();  // logs + calls die()
    }

    step() {
        super.step();
        const fps = this.game?.fps || 30;

        // Death check
        if (this.health <= 0) {
            this.explode();
            return;
        }

        // Slow repair (1 HP per 9s): prioritize self, then most-damaged ship in system
        if (this.conn.server.mainServer && this.system?.owner === this.owner) {
            this.__repairTick++;
            if (this.__repairTick >= fps * 9) {
                this.__repairTick = 0;
                if (this.health < GEOStation.MAX_HP) {
                    this.health = Math.min(this.health + 1, GEOStation.MAX_HP);
                } else {
                    const ships = [...this.system.ships].filter(s => s.owner === this.owner);
                    const damaged = ships.filter(s => s.health < (GEOShip.MAX_HP[s.shipClass] ?? 3));
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

        // Fire lasers every 5 seconds
        if (this.conn.server.mainServer) {
            if (!this.__laserTick) this.__laserTick = 0;
            this.__laserTick++;
            if (this.__laserTick >= fps * 5) {
                this.__laserTick = 0;
                this.__fireLaser();
            }
        }
    }

    __fireLaser() {
        if (!this.system) return;
        const enemies = [...this.system.ships].filter(s => s.owner !== this.owner);
        if (enemies.length > 0) {
            const target = enemies[0];
            new GEOLaser(this.game, this, target, this.color);
            target.health -= 1;
        }
    }

    die() {
        if (this.conn && this.conn.server.mainServer) {
            if (this.system && this.system.type === 'producing') {
                this.system.type = 'neutral';
            }
        }
        super.die();
    }

    saveDict() {
        const data = super.saveDict();
        data.systemName = this.system?.label.text;
        return data;
    }

    loadDict(data) {
        super.loadDict(data);
        if (data.systemName) {
            this.system = this.__systemByName(data.systemName);
        }
    }

    __systemByName(systemName) {
        return [...this.game.objectsOfTypes(GEOStarSystem.t)].find((system) => system?.label.text === systemName);
    }
}
