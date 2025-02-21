class GEOAsteroid extends GEOSavable {
    static t = 'asteroid';

    /**
     * @param game {GEG}
     * @param size {number}
     * @param x {number | null}
     * @param y {number | null}
     * @param field {GEOAsteroidField | null}
     * @param item {Item | null}
     */
    constructor(game, size = 75, x = null, y = null, field = null, item = null) {
        super(game);
        this.sides = 8;
        this.gonioCoefficient = 2 * PI / this.sides;

        this.spinSpeed = (random() * 7) - 3.5;
        this.fieldId = field ? field.uuid : null;
        this.item = item || GEOAsteroid.randomOre;

        this.w = this.h = size;
        this.x = x === null ? game.w - this.wh + (random() * game.w * 0.05) : x;
        this.y = y === null ? game.h - this.hh + (random() * game.h * 0.05) : y;
        this.s = 0.3 * random();
        this.d = random() * 360;
        this.t = GEOAsteroid.t;
        this.cwl.add('l');
    }

    step() {
        this.ia += this.spinSpeed;

        if (this.w <= 10) {
            this.die();
        }
    }

    oncollision(other) {
        switch (other.t) {
            case 'l':
                // noinspection JSValidateTypes
                /** @type {GEOLaser} */
                const laser = other;
                // laser hit
                // noinspection JSIgnoredPromiseFromCall
                MUSIC.play('boom', 1, 0.5 * this.soundVolume);
                if (this.w >= 30) {
                    new GEOAsteroid(this.game, this.wh, this.x - this.wh, this.y, null, this.item);
                    new GEOAsteroid(this.game, this.wh, this.x + this.wh, this.y, null, this.item);
                } else {
                    let ingotItem = this.item;
                    if (Math.random() > 0.9) {
                        this.item = GEOAsteroid.randomOre;
                    }
                    createIngot(this.game, this.cx, this.cy, laser.owner, ingotItem);
                }
                this.die();
                other.die();
                break;
        }
    }

    draw(ctx) {
        ctx.beginPath();
        for (let i = 0; i < this.sides; i++) {
            const sideX = this.x - this.wh * cos(this.gonioCoefficient * i);
            const sideY = this.y - this.hh * sin(this.gonioCoefficient * i);
            if (i === 0) {
                ctx.moveTo(sideX, sideY);
            } else {
                ctx.lineTo(sideX, sideY);
            }
        }
        ctx.closePath();
        ctx.strokeStyle = 'orange';
        ctx.lineWidth = 4;
        ctx.stroke();
    }

    saveDict() {
        return {
            ...super.saveDict(),
            size: this.w,
            spinSpeed: this.spinSpeed,
            fieldId: this.fieldId,
            item: this.item
        };
    }

    loadDict(data) {
        super.loadDict(data);
        this.spinSpeed = data.spinSpeed;
        this.fieldId = data.fieldId;
        this.w = this.h = data.size;
        this.item = data.item
    }

    /**
     * @return {Item}
     */
    static get randomOre() {
        return weightedRandomChoice(ITEMS_ARR.filter(x => x.mineable).map(item => ({item, weight: item.dropRate})));
    }
}
