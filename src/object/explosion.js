class GEOExplosion extends GEO {
    /**
     *
     * @param game {GEG}
     * @param x {number}
     * @param y {number}
     */
    constructor(game, x, y) {
        super(game);

        this.x = x;
        this.y = y;

        this.__ttl_inital = Math.floor(this.game.fps * 0.75);
        this.__ttl = this.__ttl_inital;
        this.w = this.h = 0;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, this.w, 0, 2 * Math.PI, false);
        ctx.fillStyle = 'yellow';
        ctx.fill();
        ctx.lineWidth = this.w * 0.2;
        ctx.strokeStyle = 'orange';
        ctx.stroke();
        ctx.closePath();
    }

    step() {
        super.step();

        this.w = this.h = 40 * (1 - Math.abs(this.__ttl_inital / 2 - this.__ttl) / (this.__ttl_inital / 2));

        if (this.__ttl-- <= 0) {
            this.die();
        }
    }
}
