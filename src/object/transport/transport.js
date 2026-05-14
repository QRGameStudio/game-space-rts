class GEOTransport extends GEO {
    static t = 'transport';

    /**
     * A lightweight material carrier. Auto-routes from a resource node to
     * the nearest same-owner producing node. Defenseless — destroyed on contact
     * with any enemy combat ship.
     *
     * @param game {GEG}
     * @param fromSystemName {string}
     * @param owner {string|null}
     * @param color {string}
     * @param toSystemName {string}
     */
    constructor(game, fromSystemName, owner, color, toSystemName) {
        super(game);
        this.t = GEOTransport.t;
        this.w = 12;
        this.h = 12;
        this.owner = owner;
        this.color = color;

        /** @type {GEOStarSystem|null} */
        this.system = this.__systemByName(fromSystemName);
        this.x = this.system.x;
        this.y = this.system.y;

        /** @type {GEOStarSystem[]} */
        this.route = [];

        // Plan route to destination
        this.__routeTo(toSystemName);
    }

    /** @private */
    __systemByName(name) {
        return [...this.game.objectsOfTypes(GEOStarSystem.t)].find(s => s.label.text === name) ?? null;
    }

    /** @private */
    __routeTo(targetName) {
        const target = this.__systemByName(targetName);
        if (!target) return;

        const searched = new Set();
        const route = [];
        let curr = this.system;
        if (!curr) return;

        route.push(curr);
        while (curr !== target) {
            if (searched.has(curr.id)) break;
            searched.add(curr.id);
            const next = [...curr.connections]
                .sort((a, b) => a.distanceFrom(target) - b.distanceFrom(target))
                .find(s => !searched.has(s.id));
            if (!next) break;
            route.push(next);
            curr = next;
        }
        this.route = route;
    }

    step() {
        if (!this.route.length) {
            this.die();
            return;
        }

        // Check for enemy combat ships in same system → die
        if (this.system) {
            const threat = [...this.system.ships].find(s => s.owner !== this.owner && s.shipClass === 'combat');
            if (threat) {
                this.die();
                return;
            }
        }

        const nextSystem = this.route[0];
        const inTransit = this.distanceFrom(nextSystem) > this.r + nextSystem.r;

        if (inTransit) {
            this.d = this.angleTo(nextSystem);
            this.s = 3;
        } else {
            // Arrived at next system
            if (this.system) this.system.ships.delete(this);
            this.system = nextSystem;
            this.s = 0;
            this.route.shift();

            if (!this.route.length) {
                // Delivered — add materials to destination
                if (nextSystem.type === 'producing') {
                    nextSystem.materials += 1;
                }
                this.die();
            }
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 5, 0, 2 * Math.PI);
        ctx.fill();
    }
}
