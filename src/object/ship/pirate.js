class GEOPirate extends GEOShip {
    static t = 'pirate';
    /**
     *
     * @param game {GEG}
     */
    constructor(game) {
        super(game, 'red');

        this.w = 50;
        this.h = 30;

        /**
         *
         * @type {null|GEOShip}
         */
        this.target = null;
        this.wantedTargetDistance = 30;
        this.maxTargetDistance = 20000;
        this.t = GEOPirate.t;
        this.label.text = "Pirate " + this.label.text;
        this.label.color = 'red';
        this.name = this.label.text;
        this.icon = GEOPlayer.icon;

        this.maxSpeed = 30;
        this.acceleration = 5;
        this.turnSpeed = 1;
        this.health = 20;

        this.__laserTimeout = 1500;
        this.__lasersTargets = ['p'];
    }

    draw(ctx) {
        super.draw(ctx);
    }

    async step() {
        super.step();
        if (this.target !== null && (this.target.isDead || this.distanceFrom(this.target) > this.maxTargetDistance)) {
            this.__autopilot = null;
            this.target = null;
        }

        if (this.target === null) {
            this.target = await this.getNearest(new Set([GEOPlayer.t, GEOMiner.t, GEOTrader.t]), this.maxTargetDistance) || null;
            if (this.target) {
                // noinspection JSUnresolvedReference
                console.debug('[STS] Target spotted', this.target?.t, this.target?.label?.text);
            }

            if (this.__autopilot === null && GEOAsteroidField.fields.length > 0) {
                const asteroidFields = await this.getNearests(GEOAsteroidField.t);
                const asteroidField = weightedRandomChoice(asteroidFields.map((x, i) => ({item: x, weight: asteroidFields.length - i + 1})));
                this.goto(asteroidField.x, asteroidField.y, 300);
            }
        } else {
            const targetDistance = this.distanceFrom(this.target);
            const minTargetDistance = this.r + this.target.r;
            const maxTargetDistance = minTargetDistance + this.wantedTargetDistance;
            const targetPoint = GUt.pointRelativeTo(this.target.cx, this.target.cy, GUt.absoluteAngle(this.target.d + 180), 100, 0);
            this.goto(targetPoint.x, targetPoint.y, maxTargetDistance, this.target.s);
            if (this.rotateTo(this.target.cx, this.target.cy) && targetDistance >= minTargetDistance && targetDistance < this.game.r) {
                this.fireLasers();
            }
        }
    }
}
