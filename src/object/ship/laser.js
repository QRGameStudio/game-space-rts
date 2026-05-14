class GEOLaser extends GEO {
    static t = 'laser';

    /**
     *
     * @param game {GEG}
     * @param from {GEOShip}
     * @param to {GEO}
     * @param color {string}
     */
    constructor(game, from, to, color = 'lightblue') {
        super(game);
        this.t = this.constructor.t;
        this.from = from;
        this.to = to;
        this.color = color;
        // Large enough bounding box so isVisible() passes while laser is on screen.
        // Centered between from and to; w/h cover the full span.
        this.w = 2000;
        this.h = 2000;
        setTimeout(() => this.die(), 500);
    }

    step() {
        // Keep position at midpoint of from→to so isVisible() stays correct.
        this.x = (this.from.x + this.to.x) / 2;
        this.y = (this.from.y + this.to.y) / 2;
    }

    draw(ctx) {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        const pointStart = GUt.pointRelativeTo(this.from.x, this.from.y, this.from.d, this.from.wh, 0);
        ctx.moveTo(pointStart.x, pointStart.y);
        const pointEnd = GUt.pointRelativeTo(this.to.x, this.to.y, this.to.d, this.to.wh / 2, 0);
        ctx.lineTo(pointEnd.x, pointEnd.y);
        ctx.closePath();
        ctx.stroke();
    }
}
