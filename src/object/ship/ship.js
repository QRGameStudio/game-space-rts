/**
 * @typedef {{
 *     x: number,
 *     y: number,
 *     accuracy: number,
 *     slowTo: number,
 * }} GEOShipAutopilot
 */

class GEOShip extends GEOSavable {
    /**
     *
     * @param game {GEG}
     * @param color {string}
     * @param system {GEOStarSystem}
     */
    constructor(game, color, system) {
        super(game);
        this.w = 75;
        this.h = 25;
        this.t = 'ship';
        this.health = 100;
        this.turnSpeed = 5;
        this.maxSpeed = 300;
        this.acceleration = 30;
        this.color = color;
        this.system = system;
        this.x = this.system.x + Math.random() * ( this.system.w * 1.5) - ( this.system.w / 2 );
        this.y = this.system.y + Math.random() * ( this.system.h * 1.5) - ( this.system.h / 2 );

        /** @type {GEOStarSystem[]} */
        this.route = [];
    }

    draw(ctx) {
        ctx.strokeStyle = this.color;
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
        if (this.s > 0 && this.fwd) {
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y + (this.hh * 2/3));
            ctx.lineTo(this.x - (this.wh * random()), this.y);
            ctx.lineTo(this.x, this.y - (this.hh * 2/3));
            ctx.moveTo(this.x, this.y + (this.hh * 2/3));
            ctx.closePath();
            ctx.stroke();
        }
    }

    step() {
        super.step();
        if (this.route.length) {
            const nextSystem = this.route[0];
            if (this.distanceFrom(nextSystem) > this.r + nextSystem.r) {
                this.d = this.angleTo(nextSystem);
                this.s = 5;
            } else {
                this.system = nextSystem;
                this.s = 0;
                this.route.shift();
            }
        }

        if (!this.route.length) {
            // noinspection JSValidateTypes
            /** @type {GEOStarSystem[]} */
            const systems = [...this.game.objectsOfTypes(GEOStarSystem.t)];
            this.goToSystem(systems[Math.floor(Math.random() * systems.length)]);
        }
    }

    /**
     * Plans a route to a system.
     * @param system {GEOStarSystem} The system to go to.
     * @param replace {boolean} If true, the current route will be replaced.
     */
    goToSystem(system, replace = false) {
        let systemCurr = this.system;
        const searchedSystems = new Set();
        const route = [];
        while (systemCurr !== system) {
            if (searchedSystems.has(systemCurr)) {
                break;
            }
            searchedSystems.add(systemCurr);
            const nextSystem = systemCurr.connections.reduce((prev, curr) => {
                const prevDistance = GEG.distanceBetween(prev, system);
                const currDistance = GEG.distanceBetween(curr, system);
                return prevDistance < currDistance ? prev : curr;
            });
            route.push(nextSystem);
            systemCurr = nextSystem;
        }

        if (replace) {
            this.route.length = 0;
        }
        this.route.push(...route);

        console.debug('[Ship] Route planned', this.route.map((system) => system.label.text));
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
}
