class GEOStation extends GEOSavable {
    static t = 'station';
    static selectedId = null;

    /**
     *
     * @param game {GEG}
     * @param server {{server: ServerConnection, local?: boolean, id?: string}}
     * @param color {string}
     * @param systemName {string}
     * @param owner {string}
     */
    constructor(game, server, color, systemName, owner) {
        super(game);
        this.w = 40;
        this.h = 40;
        this.t = this.constructor.t;
        this.conn = new ServerCommAsset(server, this);
        this.owner = owner;
        this.health = 100;
        this.clickable = true;

        this.color = color;
        this.system = this.__systemByName(systemName);
        this.x = this.system.x + Math.random() * ( this.system.w * 1.5) - ( this.system.w / 2 );
        this.y = this.system.y + Math.random() * ( this.system.h * 1.5) - ( this.system.h / 2 );

        const params = [...arguments];
        params.shift();
        params.shift();
        this.conn.sendCreationEvent(this.constructor.t, params);
    }

    onclick(x, y, clickedObject) {
        if (this.owner !== 'local') {
            return;
        }
        this.constructor.selectedId = this.id;
        return true;
    }

    draw(ctx) {
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
        data.autopilot = this.__autopilot;
        data.inventory = this.inventory.stringify();
        data.label = this.label.text;

        return data;
    }

    loadDict(data) {
        super.loadDict(data);
        this.__autopilot = data.autopilot;
        this.label.text = data.label;
        this.inventory.parse(data.inventory);
    }

    __systemByName(systemName) {
        return [...this.game.objectsOfTypes(GEOStarSystem.t)].find((system) => system?.label.text === systemName);
    }
}
