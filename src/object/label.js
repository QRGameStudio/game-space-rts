class GEOLabel extends GEO {
    /**
     *
     * @param game {GEG}
     * @param owner {GEO}
     * @param text {string}
     */
    constructor(game, owner, text) {
        super(game);
        this.text = text;
        this.owner = owner;
        this.color = "white";
    }

    step() {
        super.step();

        if (this.owner.isDead) {
            this.die();
        }
        this.x = this.owner.x;
        this.y = this.owner.y + this.owner.h + 15;
    }

    draw(ctx) {
        if (!this.owner.isVisible || !this.text) {
            return;
        }

        ctx.fillStyle = this.color;
        ctx.font = "24px sans";
        const measure = ctx.measureText(this.text);
        ctx.fillText(this.text, this.x - measure.width / 2, this.y + this.h + 15);
    }
}
