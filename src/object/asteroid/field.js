class GEOAsteroidField extends GEOSavable {
    /**
     *
     * @type {(GPoint & {id: number, name: string})[]}
     */
    static fields = [];

    /**
     * @type {Set<GPoint>}
     */
    static depleted = new Set();

    static t = 'asteroid-field';

    static icon = GUt.ud('8J+qqA==');

    /**
     *
     * @param game {GEG}
     * @param x {number}
     * @param y {number}
     * @param asteroidsCount {number | null}
     */
    constructor(game, x, y, asteroidsCount = null) {
        super(game);
        this.x = x;
        this.y = y;
        this.t = GEOAsteroidField.t;
        this.uuid = GUt.uuid();
        this.icon = GEOAsteroidField.icon;
        this.depleted = false;
        this.ore = GEOAsteroid.randomOre;
        this.name = randomName(5, 10) + ` ${this.ore.name} field`;
        this.label = new GEOLabel(game, this, this.name);

        GEOAsteroidField.fields.push({x: Math.floor(x), y: Math.floor(y), id: this.id, name: this.name});
        this.__field_radius = Math.random() * 1000;
        /**
         *
         * @type {GEO[]}
         */
        this.asteroids = [];
        this.minAsteroids = 3;
        this.asteroidsCount = asteroidsCount !== null ? asteroidsCount : this.minAsteroids + Math.floor(Math.random() * this.__field_radius / 10);
        this.generateAsteroids(this.asteroidsCount);
    }

    step() {
        super.step();
        this.asteroids = this.asteroids.filter((a) => !a.isDead || a.distanceFrom(this) > this.__field_radius * 1.5);
        if (this.asteroids.length < Math.max(this.minAsteroids, 0.1 * this.asteroidsCount)) {
            this.die();
        }
    }

    die() {
        this.depleted = true;
        const index = GEOAsteroidField.fields.findIndex((x) => x.id === this.id);
        if (index > -1) {
            GEOAsteroidField.depleted.add(GEOAsteroidField.fields.splice(index, 1)[0]);
        }
        super.die();
    }

    saveDict() {
        return {
            ...super.saveDict(),
            name: this.name,
            uuid: this.uuid,
            radius: this.__field_radius,
            ore: this.ore
        };
    }

    loadDict(data) {
        super.loadDict(data);
        this.name = this.label.text = data.name;
        this.uuid = data.uuid;
        this.ore = data.ore;
        this.__field_radius = data.radius
    }

    /**
     *
     * @param count {number}
     */
    generateAsteroids(count) {
        for (let i = 0; i < count; i++) {
            const x = this.x + 2 * Math.random() * this.__field_radius - this.__field_radius;
            const y = this.y + 2 * Math.random() * this.__field_radius - this.__field_radius;
            const asteroid = new GEOAsteroid(this.game, 30 + Math.random() * 75, x, y, this, this.ore)
            asteroid.s = 0;
            this.asteroids.push(asteroid);
        }
    }
}
