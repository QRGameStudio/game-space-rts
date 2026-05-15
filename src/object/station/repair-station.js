class GEORepairStation extends GEOSelectable {
    static t = 'repair-station';

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
        this.health = 10;
        this.clickable = true;

        this.color = color;
        this.system = this.__systemByName(systemName);
        this.x = this.system.x + this.system.wh + 15 + this.w;
        this.y = this.system.y;
        this.sendCreationEvent(arguments);
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
        ctx.moveTo(this.x, this.y - this.hh + 10);
        ctx.lineTo(this.x, this.y + this.hh - 10);
        ctx.moveTo(this.x - this.wh + 10, this.y);
        ctx.lineTo(this.x + this.wh - 10, this.y);
        ctx.stroke();
    }

    step() {
        super.step();
    }

    die() {
        if (this.conn && this.conn.server.mainServer) {
            if (this.system && this.system.type === 'repair') {
                this.system.type = 'neutral';
            }
        }
        super.die();
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
