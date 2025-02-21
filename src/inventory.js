class Inventory {
    /**
     *
     * @param size {number}
     */
    constructor(size) {
        /** @type {Map<string, number>} */
        this.__content = new Map();
        this.size = size;
    }

    /**
     *
     * @return {boolean}
     */
    get full() {
        return this.sum() >= this.size;
    }

    /**
     *
     * @return {number}
     */
    get free() {
        return this.size - this.sum();
    }

    /**
     *
     * @param item {string}
     * @param count {number}
     */
    set(item, count) {
        if (count <= 0) {
            this.__content.delete(item);
        } else {
            this.__content.set(item, count);
        }
        this.onchange(item, count);
    }

    /**
     *
     * @param item {string}
     * @param count {number}
     * @return {boolean}
     */
    add(item, count) {
        if (this.sum() + count  > this.size) {
            return false;
        }
        this.set(item, this.get(item) + count);
        return true;
    }

    /**
     *
     * @param item {string}
     * @param count {number}
     * @return {boolean}
     */
    remove(item, count) {
        const stock = this.get(item);
        this.set(item, Math.max(this.get(item) - count, 0));
        return count <= stock;
    }

    /**
     *
     * @param item {string}
     * @param count {number}
     */
    onchange(item, count) {

    }


    /**
     *
     * @param item {string}
     * @return {number}
     */
    get(item) {
        return this.__content.get(item) || 0;
    }

    clear() {
        this.__content.clear();
    }

    /**
     *
     * @return {string[]}
     */
    keys() {
        return [...this.__content.keys()];
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     *
     * @return {number}
     */
    sum() {
        return [...this.__content.values()].reduce((a, b) => a + b, 0);
    }

    /**
     *
     * @return {string}
     */
    stringify() {
        return JSON.stringify([...this.__content.entries()]);
    }

    /**
     *
     * @param data {string}
     */
    parse(data) {
        this.__content = new Map(JSON.parse(data));
    }
}
