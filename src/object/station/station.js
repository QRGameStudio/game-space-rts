class GEOStation extends GEOSavable {
    /**
     *
     * @type {(GPoint & {name: string})[]}
     */
    static stations = [];

    static t = 'space-station';

    static icon = GUt.ud('8J+PsA==');

    /**
     *
     * @param game {GEG}
     * @param x {number} x-position
     * @param y {number} y-position
     */
    constructor(game, x, y) {
        super(game);
        this.x = x;
        this.y = y;
        this.t = GEOStation.t;
        this.w = this.h = 120;
        this.clickable = true;
        this.__spin_speed = 1;

        this.__craftingTimeout = 0;

        this.icon = GEOStation.icon;
        this.name = randomName(5, 10) + ' station';
        this.label = new GEOLabel(game, this, this.name);
        this.inventory = new Inventory(2000);

        const inventoryFill = Math.floor(Math.random() * 0.75 * this.inventory.size);
        while (this.inventory.sum() < inventoryFill) {
            const count = Math.round(Math.min(Math.random() * inventoryFill * 0.1, inventoryFill - this.inventory.sum()));
            const item = weightedRandomChoice(ITEMS_ARR.map(item => ({item, weight: item.dropRate})));
            this.inventory.add(item.name, count);
        }

        this.inventory.onchange = (_, __) => {
            if (this.__modal_renderer) {
                this.__modal_renderer.render();
            }
        }

        /**
         * @type {GRenderer|null}
         * @private
         */
        this.__modal_renderer = null;

        GEOStation.stations.push({x: this.x, y: this.y, name: this.name});
    }

    onclick(x, y, clickedObject) {
        if (this.distanceFrom(PLAYER) > this.r  + 300) {
            return false;
        }

        console.debug("[STS] Welcome to", this.name);

        const backData = {};
        MODAL.show('station', {
            station: this,
            player: PLAYER,
            items: ITEMS_ARR
        }, {
            /**
             * @param item {string}
             * @param count {number | null}
             */
            buy: async (item, count) => {
                if (count === null) {
                    count = Math.min(PLAYER.inventory.free, this.inventory.get(item));
                }

                const sellingPrice = await this.sellingPrice(item);
                let price = sellingPrice * count;
                if (price > SCORE.get()) {
                    return;
                }
                count = GEOStation.transferCargo(this, PLAYER, item, count);
                SCORE.inc(-1 * count * sellingPrice).then();
                this.__modal_renderer?.render();

                if (item === 'trader ship') {
                    const trader = new GEOTrader(this.game);
                    trader.x = this.x;
                    trader.y = this.y;
                    trader.owned = true;
                    PLAYER.inventory.add(item, -count);
                }
            },
            /**
             * @param item {string}
             * @param count {number | null}
             */
            sell: async (item, count) => {
                if (count === null) {
                    count = Math.min(this.inventory.free, PLAYER.inventory.get(item));
                }

                const price = await this.buyingPrice(item);
                count = GEOStation.transferCargo(PLAYER, this, item, count);
                SCORE.inc(count * price).then();
                this.__modal_renderer?.render();
            }
        }, backData).then(() => this.__modal_renderer = null);
        MODAL.fetchRendererFromBackData(backData).then((renderer) => this.__modal_renderer = renderer);

        return true;
    }

    /**
     *
     * @param itemName {string}
     * @param stationPrices {{[stationId: number]: number}}
     * @return {Promise<number>}
     */
    async itemPrice(itemName, stationPrices = {}) {
        const item = ITEMS[itemName];

        let price = item.basePrice;

        if (item.mineable) {
            let field = (await this.getNearests(GEOAsteroidField.t)).find(x => x?.ore.name === itemName);

            if (field === undefined) {
                price = (price + 1) ** 2;
            } else {
                price += item.basePrice * this.distanceFrom(field) / (4 * 500 * 1000);  // 500km ~ 1min of travel with basic ship
            }
        }

        if (item.crafting) {
            for (const requiredItemName in item.crafting) {
                price += await this.itemPrice(requiredItemName) * item.crafting[requiredItemName];
            }
        }

        stationPrices[this.id] = price;

        let otherModifier = 0;
        let otherCount = 0;
        for (const obj of this.game.objectsOfTypes(new Set([GEOStation.t]))) {
            if (obj.id === this.id) {
                continue;
            }
            if (obj.id in stationPrices) {
                otherModifier += stationPrices[obj.id];
                continue;
            }
            // noinspection JSValidateTypes
            /** @type {GEOStation} */
            const station = obj;
            otherModifier += await station.itemPrice(itemName, stationPrices) * this.distanceFrom(station) / (8 * 500 * 1000);   // 500km ~ 1min of travel with basic ship
        }

        if (otherCount) {
            price += otherModifier / otherCount;
        }

        return price;
    }

    /**
     *
     * @param item {string}
     * @return {Promise<number>}
     */
    async buyingPrice(item) {
        if (this.inventory.full) {
            return 0;
        }

        let price = await this.itemPrice(item);
        price *= 1 - (this.inventory.get(item) / this.inventory.size);
        price = Math.round(price * 100) / 100;
        return price;
    }

    /**
     *
     * @param item {string}
     * @return {Promise<number>}
     */
    async sellingPrice(item) {
        if (this.inventory.get(item) === 0) {
            return 0;
        }

        let price = await this.buyingPrice(item) * 1.3;
        price = Math.round(price * 100) / 100;
        return price;
    }

    step() {
        super.step();
        this.ia += this.__spin_speed;

        if (this.__craftingTimeout <= 0) {
            const canBeCrafted = ITEMS_ARR.filter(x => {
                if (!x.crafting) {
                    return false;
                }
                // check that this station has enough of each item
                for (const requiredItem in x.crafting) {
                    if (this.inventory.get(requiredItem) < x.crafting[requiredItem]) {
                        return false;
                    }
                }
                return true;
            });

            if (canBeCrafted.length) {
                const craftedItem = weightedRandomChoice(canBeCrafted.map(item => ({item, weight: item.basePrice})));
                for (const requiredItem in craftedItem.crafting) {
                    this.inventory.remove(requiredItem, craftedItem.crafting[requiredItem]);
                }
                this.inventory.add(craftedItem.name, 1);
                console.debug(`[STS] ${this.name} crafted ${craftedItem.name}`);
            }

            this.__craftingTimeout = Math.floor(2 + 180 * Math.random()) * this.game.fps;
        } else {
            this.__craftingTimeout -= 1;
        }
    }

    draw(ctx) {
        ctx.strokeStyle = 'gray';
        ctx.lineWidth = 7;
        ctx.strokeRect(this.x - this.wh, this.y - this.hh, this.w, this.h);
    }

    saveDict() {
        return {
            ...super.saveDict(),
            name: this.name,
            inventory: this.inventory.stringify(),
            craftingTimeout: this.__craftingTimeout
        };
    }

    loadDict(data) {
        this.name = this.label.text = data.name;
        this.inventory.parse(data.inventory);
        this.__craftingTimeout = data.craftingTimeout;
        super.loadDict(data);
    }

    /**
     * @param from {GEOShip|GEOStation}
     * @param to {GEOShip|GEOStation}
     * @param type {string | null}
     * @param volume {number | null}
     * @return {number}
     */
    static transferCargo(from, to, type = null, volume  = null) {
        if (type === null) {
            const cargoTypes = from.inventory.keys();
            if (!cargoTypes.length || to.inventory.full) {
                return 0;
            }
            type = cargoTypes[Math.floor(cargoTypes.length * Math.random())];
        }

        const cargoStock = from.inventory.get(type);
        if (volume === null) {
            volume = Math.floor((Math.random() *  Math.min(to.inventory.free, cargoStock)) + 1);
        }

        volume = Math.min(to.inventory.free, volume, cargoStock);
        to.inventory.add(type, volume);
        from.inventory.remove(type, volume);

        return volume;
    }
}
