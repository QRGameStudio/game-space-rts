class GEOStarSystem extends GEOSavable {
    static t = 'system';

    /**
     * @param game {GEG}
     * @param x {number | null}
     * @param y {number | null}
     */
    constructor(game, x = null, y = null) {
        super(game);
        this.sides = 8;
        this.gonioCoefficient = 2 * PI / this.sides;

        this.spinSpeed = (random() * 7) - 3.5;

        this.w = this.h = 75;
        this.x = x === null ? game.w - this.wh + (random() * game.w * 0.05) : x;
        this.y = y === null ? game.h - this.hh + (random() * game.h * 0.05) : y;
        this.s = 0.3 * random();
        this.d = random() * 360;
        this.cwl.add('l');
    }

    step() {
        this.ia += this.spinSpeed;
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
        };
    }

    loadDict(data) {
        super.loadDict(data);
    }
}
