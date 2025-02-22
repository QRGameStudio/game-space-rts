class GEOStarSystem extends GEOSavable {
    static t = 'system';

    /**
     * @param game {GEG}
     * @param x {number}
     * @param y {number}
     */
    constructor(game, x, y) {
        super(game);
        this.sides = 8;
        this.t = GEOStarSystem.t;
        this.x = x;
        this.y = y;
        this.gonioCoefficient = 2 * PI / this.sides;

        this.w = this.h = 75;

        /** @type {GEOStarSystem[]} */
        this.connections = [];
    }

    step() {

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

        for (const connection of this.connections) {
            if (connection.id < this.id) {
                continue;
            }
            ctx.beginPath();
            const angleTo = GUt.countAngle(connection.x - this.x, connection.y - this.y);
            const pointStart = GUt.pointRelativeToAngle(this.x, this.y, this.d, this.w / 2, angleTo);
            const pointEnd = GUt.pointRelativeToAngle(connection.x, connection.y, connection.d, connection.w / 2, angleTo + 180);
            ctx.moveTo(pointStart.x, pointStart.y);
            ctx.lineTo(pointEnd.x, pointEnd.y);
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 4;
            ctx.stroke();
        }
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
