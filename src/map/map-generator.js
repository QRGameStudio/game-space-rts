class MapGenerator {
    /**
     * Generates a map for the game.
     * @param game {GEG}
     */
    constructor(game) {
        /** @type {GEOStarSystem[]} */
        this.systems = [];
        this.game = game;
    }

    generateSystem() {
        if (this.systems.length === 0) {
            this.systems.push(new GEOStarSystem(this.game, 75, game.w / 2, game.h / 2));
        }
    }
}