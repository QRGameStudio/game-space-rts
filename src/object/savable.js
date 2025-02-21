class GEOSavable extends GEO {
    /**
     * Save
     * @return {Object}
     */
    saveDict() {
        return {
            x: this.x,
            y: this.y,
            s: this.s,
            d: this.d
        }
    }

    /**
     * Loads dict
     * @param data {Object}
     */
    loadDict(data) {
        this.x = data.x;
        this.y = data.y;
        this.s = data.s;
        this.d = data.d;
    }
}
