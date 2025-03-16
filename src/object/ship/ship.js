/**
 * @typedef {{
 *     x: number,
 *     y: number,
 *     accuracy: number,
 *     slowTo: number,
 * }} GEOShipAutopilot
 *
 * @typedef {'fighter' | 'bomber' | 'builder'} GEOShipClass
 */

class GEOShip extends GEOSelectable {
    static t = 'ship';

    /**
     *
     * @param game {GEG}
     * @param server {GEOServerConnection}
     * @param color {string}
     * @param systemName {string}
     * @param owner {string}
     * @param shipClass {GEOShipClass}
     */
    constructor(game, server, color, systemName, owner, shipClass) {
        super(game, server, owner);

        switch (shipClass) {
            case "builder":
                this.w = 75;
                this.h = 75;
                this.health = 75;
                break;
            case "fighter":
                this.w = 75;
                this.h = 25;
                this.health = 150;
                break;
            case "bomber":
                this.w = 25;
                this.h = 75;
                this.health = 100;
                break;
            default:
                throw new Error(`Unknown ship class ${shipClass}`);
        }

        this.t = this.constructor.t;
        this.clickable = true;

        this.color = color;
        /** @type {GEOStarSystem | null} */
        this.system = this.__systemByName(systemName);
        this.x = this.system.x + Math.random() * ( this.system.w * 1.5) - ( this.system.w / 2 );
        this.y = this.system.y + Math.random() * ( this.system.h * 1.5) - ( this.system.h / 2 );

        /** @type {GEOStarSystem[]} */
        this.route = [];

        this.conn.patchMethod(this.goToSystem);
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
            let canLeave = true;
            if (this.system) {
                if ([...this.system.ships].find(x => x.owner !== this.owner)) {
                    canLeave = false;
                } else if (!this.isInSystem(this.system)) {
                    this.system.ships.delete(this);
                    this.system = null;
                }
            }

            if (canLeave) {
                const nextSystem = this.route[0];
                if (this.isInSystem(nextSystem)) {
                    this.d = this.angleTo(nextSystem);[...arguments].shift()
                    this.s = 2;
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
        }
    }

    /**
     *
     * @param system {GEOStarSystem | null}
     * @return {boolean}
     */
    isInSystem(system) {
        if (!system) {
            return false;
        }
        return this.distanceFrom(system) > this.r + system.r;
    }

    /**
     * Plans a route to a system.
     * @param systemName {string} The system to go to.
     * @param replace {boolean} If true, the current route will be replaced.
     */
    goToSystem(systemName, replace = false) {
        const systemTarget = this.__systemByName(systemName);
        const searchedSystems = new Set();
        const route = [];
        let systemCurr = this.system;
        if (systemCurr === null) {
            console.assert(this.route.length > 0, 'No route and no current system');
            systemCurr = this.route[0];
        }
        route.push(systemCurr);
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

    /**
     *
     * @param systemName {string}
     * @return {GEOStarSystem}
     * @private
     */
    __systemByName(systemName) {
        const system = [...this.game.objectsOfTypes(GEOStarSystem.t)].find((system) => system?.label.text === systemName);
        if (!system) {
            throw new Error(`System ${systemName} not found`);
        }
        return system;
    }
}
