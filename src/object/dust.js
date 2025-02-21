class GEODust extends GEO {
    /**
     * @type {number}
     */
    static count = 0;

    /**
     *
     * @param game {GEG}
     * @param visible {boolean} if set to true then dust is spawned within visible player range
     */
    constructor(game, visible = false) {
        super(game);
        this.w = this.h = 6;
        const relativePosition = GUt.pointRelativeTo(
            PLAYER.x,
            PLAYER.y,
            Math.random() * 360,
            (visible ? 0 : game.r) + Math.random() * game.r,
            (visible ? 0 : game.r) + Math.random() * game.r,
        );

        this.x = relativePosition.x;
        this.y = relativePosition.y;
        GEODust.count ++;
    }

    die() {
        super.die();
        GEODust.count --;
    }

    draw(ctx) {
        ctx.fillStyle = 'gray';
        ctx.fillRect(this.x, this.y, this.w, this.h);
    }

    step() {
        super.step();
        if (this.distanceFrom(PLAYER) > this.game.r * 2) {
            this.die();
        }
    }
}
