class GEOJumpInhibitor extends GEOSelectable {
    static t = 'jump-inhibitor';
    static MAX_HP = 4;

    /**
     * @param game {GEG}
     * @param server {GEOServerConnection}
     * @param systemName {string}
     * @param owner {string}
     */
    constructor(game, server, systemName, owner) {
        super(game, server, owner);
        this.w = 35;
        this.h = 35;
        this.t = this.constructor.t;
        this.health = GEOJumpInhibitor.MAX_HP;
        this.clickable = true;

        this.system = this.__systemByName(systemName);
        // Placed to the left of the star system (opposite side from stations)
        this.x = this.system.x - this.system.wh - 15 - this.w;
        this.y = this.system.y;
        this.conn.patchMethod(this.dismantle);
        this.sendCreationEvent(arguments);
    }

    /** Color is always derived live from the owner's registered colour. */
    get color() { return GEOStarSystem.ownerColor(this.owner); }

    /**
     * Dismantle this inhibitor: refund 10 materials, revert system type to neutral.
     */
    dismantle() {
        if (!this.conn.server.mainServer) return;
        if (!this.system) return;
        this.system.materials = (this.system.materials || 0) + 10;
        this.die();
    }

    onclick(x, y, clickedObject) {
        if (this.owner !== 'local') return false;
        if ([...clickedObject].find(x => x.t === GEOShip.t)) return false;
        this.selectObject();
        return true;
    }

    draw(ctx) {
        if (this.owner !== 'local') {
            if (!this.system || !this.system.visible) return;
        }
        ctx.strokeStyle = this.constructor.selectedId === this.id ? 'orange' : this.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        // Diamond/rhombus outline
        ctx.moveTo(this.x, this.y - this.hh);
        ctx.lineTo(this.x + this.wh, this.y);
        ctx.lineTo(this.x, this.y + this.hh);
        ctx.lineTo(this.x - this.wh, this.y);
        ctx.closePath();
        // Inner X to indicate blocking
        ctx.moveTo(this.x - this.wh * 0.45, this.y - this.hh * 0.45);
        ctx.lineTo(this.x + this.wh * 0.45, this.y + this.hh * 0.45);
        ctx.moveTo(this.x + this.wh * 0.45, this.y - this.hh * 0.45);
        ctx.lineTo(this.x - this.wh * 0.45, this.y + this.hh * 0.45);
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
        if (this.health <= 0) {
            this.explode();
        }
    }

    die() {
        if (this.conn && this.conn.server.mainServer) {
            if (this.system && this.system.type === 'inhibitor') {
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
        return [...this.game.objectsOfTypes(GEOStarSystem.t)].find(s => s?.label.text === systemName);
    }
}
