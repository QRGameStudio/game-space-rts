/**
 * @typedef {{
 *     x: number,
 *     y: number,
 *     accuracy: number,
 *     slowTo: number,
 * }} GEOShipAutopilot
 */

class GEOShip extends GEOSelectable {
    static t = 'ship';

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
        this.w = 75;
        this.h = 25;
        this.t = this.constructor.t;
        this.conn = new ServerCommAsset(server, this);
        this.owner = owner;
        this.health = 100;
        this.clickable = true;

        this.color = color;
        this.system = this.__systemByName(systemName);
        this.x = this.system.x + Math.random() * ( this.system.w * 1.5) - ( this.system.w / 2 );
        this.y = this.system.y + Math.random() * ( this.system.h * 1.5) - ( this.system.h / 2 );

        /** @type {GEOStarSystem[]} */
        this.route = [];

        this.conn.patchMethod(this.goToSystem);

        const params = [...arguments];
        params.shift();
        params.shift();
        this.conn.sendCreationEvent(this.constructor.t, params);
    }

    onclick(x, y, clickedObject) {
        if (this.owner !== 'local') {
            return;
        }
        this.selectObject();
        return true;
    }

    draw(ctx) {
        ctx.strokeStyle = this.constructor.selectedId === this.id ? 'orange' : this.color;
        ctx.lineWidth = 5;
        ctx.beginPath();
        // front
        ctx.moveTo(this.x + this.wh, this.y);
        // bottom right
        ctx.lineTo(this.x, this.y + this.hh);
        // bottom left
        ctx.lineTo(this.x, this.y - this.hh);
        ctx.closePath();
        ctx.stroke();
    }

    step() {
        super.step();
        this.conn.syncPosition();
        if (this.route.length) {
            const nextSystem = this.route[0];
            if (this.distanceFrom(nextSystem) > this.r + nextSystem.r) {
                this.d = this.angleTo(nextSystem);[...arguments].shift()
                this.s = 2;
            } else {
                this.system = nextSystem;
                this.s = 0;
                this.route.shift();
            }
        }
    }

    /**
     * Plans a route to a system.
     * @param systemName {string} The system to go to.
     * @param replace {boolean} If true, the current route will be replaced.
     */
    goToSystem(systemName, replace = false) {
        const systemTarget = this.__systemByName(systemName);
        let systemCurr = this.system;
        const searchedSystems = new Set();
        const route = [];
        while (systemCurr !== systemTarget) {
            if (searchedSystems.has(systemCurr)) {
                break;
            }
            // Use BFS to find the shortest route
            searchedSystems.add(systemCurr.id);
            const next = systemCurr.connections.sort((a, b) => {
                const distA = a.distanceFrom(systemTarget);
                const distB = b.distanceFrom(systemTarget);
                return distA - distB;
            }).find((system) => !searchedSystems.has(system.id));
            if (!next) {
                break;
            }
            route.push(next);
            systemCurr = next;
        }

        if (replace) {
            this.route.length = 0;
        }
        this.route.push(...route);
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
