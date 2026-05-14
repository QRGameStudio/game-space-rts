class GEOLabel extends GEO {
    /**
     * Adds a label to an object
     * @param game {GEG} The game object
     * @param owner {GEO} The object that owns the label
     * @param text {string} The text to display
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
        if (!this.owner.isVisible || !this.text) return;
        // Respect fog of war: owner may define a `visible` fog-of-war flag
        if ('visible' in this.owner && !this.owner.visible) return;

        ctx.fillStyle = this.color;
        ctx.font = "24px sans";
        const measure = ctx.measureText(this.text);
        ctx.fillText(this.text, this.x - measure.width / 2, this.y + this.h + 15);
    }
}
