class GEOMiner extends GEOShip {
    static t = 'miner';

    /**
     *
     * @param game {GEG}
     */
    constructor(game) {
        super(game, 'green');
        this.t = GEOMiner.t;
        this.label.text = "Miner " + this.label.text;
        this.name = this.label.text;
        this.icon = GEOPlayer.icon;

        /**
         *
         * @type {null|GEOShip}
         */
        this.target = null;
        this.drone = new GEODrone(this.game, this);
        this.maxTargetDistance = this.game.r * 2;
        this.wantedTargetDistance = 150 + this.r;

        this.maxSpeed = 150;
        this.health = 50;
        this.inventory.size = 1;

        this.w = 40;
        this.h = 60;

        this.__stay_timeout = 0;
    }

    async step() {
        super.step();

        if (this.__stay_timeout > 0) {
            this.__stay_timeout -= 1;
            return;
        }

        if (!this.drone.docked) {
            this.target = null;
            if (this.drone.idle && this.drone.inRangeForDock) {
                this.drone.dock();
            }
            return;
        }

        if ((this.target !== null && this.target.t !== GEOStation.t && (this.target.isDead || this.distanceFrom(this.target) > this.maxTargetDistance))
        ) {
            this.__autopilot = null;
            this.target = null;
        }

        if (this.target === null) {
            if (this.inventory.full) {
                this.target = await this.getNearest(GEOStation.t);
            } else {
                this.target = await this.getNearest(GEOAsteroid.t, this.maxTargetDistance) || null;

                if (this.__autopilot === null && GEOAsteroidField.fields.length > 0) {
                    const asteroidFields = await this.getNearests(GEOAsteroidField.t);
                    const asteroidField = weightedRandomChoice(asteroidFields.map(x => ({item: x, weight: this.distanceFrom(x)})), true);
                    this.goto(asteroidField.x, asteroidField.y, 0);
                }
            }
        } else {
            this.goto(this.target.x, this.target.y, 0, 0);
            const targetDistance = this.distanceFrom(this.target);
            if (targetDistance < this.wantedTargetDistance) {
                if (this.target.t === GEOStation.t) {
                    this.cancelGoto();
                    console.assert(this.target instanceof GEOStation, 'Target is not a station');
                    // noinspection JSValidateTypes
                    /** @type {GEOStation} */
                    const targetStation = this.target;
                    this.inventory.keys().forEach((item) => {
                        const count = GEOStation.transferCargo(this, this.target, item, this.inventory.get(item));
                        console.debug(`[STS] Miner deposited ${count} of ${item} at ${targetStation.name}`);
                        (new GPopup(`${this.label.text} deposited ${count} of ${item} at ${targetStation.name}`)).show();
                    });
                    this.__stay_timeout = (2 + Math.floor(15 * Math.random())) * this.game.fps;
                } else if (this.drone.docked) {
                    const stoppingPoint = GUt.pointRelativeTo(this.cx, this.cy, 0, 500, 0);
                    this.goto(stoppingPoint.x, stoppingPoint.y, this.r * 4, 0);
                    this.drone.launch(this);
                }
                this.target = null;
            }
        }
    }
}
