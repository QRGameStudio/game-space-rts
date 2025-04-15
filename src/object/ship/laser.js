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
        setTimeout(() => this.die(), 300);
    }

    draw(ctx) {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const pointStart = GUt.pointRelativeTo(this.from.x, this.from.y, this.from.d, this.from.wh, 0);
        ctx.moveTo(pointStart.x, pointStart.y);
        const pointEnd = GUt.pointRelativeTo(this.to.x, this.to.y, this.to.d, this.to.wh / 2, 0);
        ctx.lineTo(pointEnd.x, pointEnd.y);
        ctx.closePath();
        ctx.stroke();
    }
}
