class GEODrone extends GEOShip {
    static t = 'drone';

    /**
     *
     * @param game {GEG}
     * @param owner {GEOShip}
     */
    constructor(game, owner) {
        super(game, owner.color);

        this.w = 25;
        this.h = 25;
        this.maxSpeed = 30;
        this.turnSpeed = 3;

        this.owner = owner;
        this.returnToOwner = false;
        this.maxOwnerDistance = Math.min(this.game.w, this.game.h);
        this.inventory.size = 1;

        /**
         *
         * @type {null|GEO}
         */
        this.target = null;
        this.wantedTargetDistance = 120;
        this.maxTargetDistance = 1000;
        this.t = GEODrone.t;
        this.label.text = "";

        this.__laserTimeout = 2000;

        this.__docked = false;
        /**
         *
         * @type {GPoint}
         * @private
         */
        this.__docked_size = {x: this.w, y: this.h};

        this.__idle = false;

        this.dock();
    }

    /**
     *
     * @return {boolean}
     */
    get idle() {
        return this.owner.inventory.full || this.__idle;
    }

    /**
     *
     * @return {boolean}
     */
    get docked() {
        return this.__docked;
    }

    /**
     * @return {boolean}
     */
    get inRangeForDock() {
        return !this.returnToOwner && this.distanceFrom(this.owner) <= this.owner.r * 1.5;
    }

    dock() {
        if (this.__docked) {
            return;
        }

        this.__idle = false;
        this.__docked = true;
        this.__docked_size = {x: this.w, y: this.h};
        this.w = 0;
        this.h = 0;
        this.x = -1111111;
        this.y = -1010101;
    }

    /**
     *
     * @param point {GPoint}
     */
    launch(point) {
        if (!this.__docked) {
            return;
        }

        this.x = point.x;
        this.y = point.y;
        this.w = this.__docked_size.x;
        this.h = this.__docked_size.y;

        this.__docked = false;
        this.__idle = false;
    }

    draw(ctx) {
        if (this.__docked) {
            return;
        }
        super.draw(ctx);
    }

    async step() {
        if (this.__docked) {
            return;
        }

        super.step();

        if (this.returnToOwner || this.inventory.full || this.idle || this.distanceFrom(this.owner) > this.maxOwnerDistance) {
            this.returnToOwner = true;
            this.target = null;

            if (this.goto(this.owner.cx, this.owner.cy, this.owner.r)) {
                this.inventory.keys().forEach((key) => {
                    if (this.owner.inventory.add(key, this.inventory.get(key))) {
                        this.inventory.set(key, 0);
                    }
                });
                this.returnToOwner = false;
            }
        } else {
            if (this.target !== null && (this.target.isDead || this.distanceFrom(this.target) > this.maxTargetDistance)) {
                this.target = null;
            }

            if (this.target === null) {
                this.target = await this.getNearest('ingot', this.maxTargetDistance) || await this.getNearest(GEOAsteroid.t, this.maxTargetDistance);
                if (this.target === null) {
                    this.returnToOwner = true;
                    this.__idle = true;
                }
            } else {
                this.__idle = false;
                switch (this.target.t) {
                    case GEOAsteroid.t:
                        const maxTargetDistance = this.r + this.wantedTargetDistance + this.target.r - this.target.s * 2;
                        if (this.goto(this.target.cx, this.target.cy, maxTargetDistance, this.target.s * 2) && this.rotateTo(this.target.cx, this.target.cy)) {
                            this.fireLasers();
                        }
                        break;
                    case 'ingot':
                        this.goto(this.target.cx, this.target.cy);
                        break;
                }
            }
        }
    }
}
