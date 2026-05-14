class GEOStation extends GEOSelectable {
    static t = 'station';

    /**
     *
     * @param game {GEG}
     * @param server {GEOServerConnection}
     * @param color {string}
     * @param systemName {string}
     * @param owner {string}
     */
    constructor(game, server, color, systemName, owner) {
        super(game, server, owner);
        this.w = 40;
        this.h = 40;
        this.t = this.constructor.t;
        this.health = 100;
        this.clickable = true;

        this.color = color;
        this.system = this.__systemByName(systemName);
        this.x = this.system.x + this.system.wh + 15 + this.w;
        this.y = this.system.y
        this.conn.patchMethod(this.build);
        this.sendCreationEvent(arguments);
    }

    build(objClass) {
        if (this.system && this.system.type === 'producing') {
            this.system.addToQueue(objClass);
        } else {
            // Fallback: immediate spawn if not a producing node
            new GEOShip(this.game, {server: this.conn.server}, this.color, this.system.label.text, this.owner, objClass);
        }
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
        ctx.rect(this.x - this.wh - (this.wh * 0.5) - (ctx.lineWidth / 2),  this.y - (this.wh * 0.75), ctx.lineWidth, this.h * 0.75);
        ctx.rect(this.x + this.wh + (this.wh * 0.5),  this.y - (this.wh * 0.75), ctx.lineWidth, this.h * 0.75);
        ctx.closePath();
        ctx.stroke();
    }

    step() {
        super.step();
    }

    saveDict() {
        const data = super.saveDict();
        data.systemName = this.system?.label.text;
        data.color = this.color;
        return data;
    }

    loadDict(data) {
        super.loadDict(data);
        this.color = data.color;
        if (data.systemName) {
            this.system = this.__systemByName(data.systemName);
        }
    }

    __systemByName(systemName) {
        return [...this.game.objectsOfTypes(GEOStarSystem.t)].find((system) => system?.label.text === systemName);
    }
}
