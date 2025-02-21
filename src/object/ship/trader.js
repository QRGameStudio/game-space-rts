class GEOTrader extends GEOShip {
    static t = 'trader';

    /**
     * @typedef {{command: string, description: string, data: any}} GEOTraderOrder
     */

    /**
     *
     * @param game {GEG}
     */
    constructor(game) {
        super(game, 'cyan');
        this.t = GEOTrader.t;
        this.label.text = "Trader " + this.label.text;
        this.name = this.label.text;
        this.icon = GEOPlayer.icon;
        this.__owned = false;

        /** @type {GEOTraderOrder[]} */
        this.__orders = [];

        /**
         *
         * @type {null|GEOStation}
         */
        this.target = null;
        this.wantedTargetDistance = 100 + this.r;

        this.maxSpeed = 250;
        this.health = 70;
        this.inventory.size = 64;

        this.w = 60;
        this.h = 60;

        this.__stay_timeout = 0;
        /**
         * @type {null|GPoint}
         * @private
         */
        this.__point_last_buy = null;
    }

    get owned() {
        return this.__owned;
    }

    set owned(value) {
        this.__owned = value;
        this.label.color = value ? "green" : "white";
    }

    async openCommands() {
        if (!this.owned) {
            return;
        }

        let backData = {};
        /** @type {GRenderer} */
        let renderer;
        MODAL.show('trader-commands', {
            trader: {
                name: this.label.text,
            },
            orders: this.__orders,
            commands: {
                goto: {
                    description: "Go to a station",
                    data: [...await this.game.getNearest(this, GEOStation.t)].map(x => ({
                        id: x.id,
                        text: x?.name
                    }))
                },
                sell: {
                    description: "Sell cargo",
                    data: [...this.inventory.keys()].map((x) => ({id: x, text: x}))
                },
                buy: {
                    description: "Buy cargo",
                    data: [...this.inventory.keys()].map((x) => ({id: x, text: x}))
                }
            }
        }, {
            $onValueChange: () => {
                if (!renderer) {
                    return;
                }

                renderer.render();
            },
            sendCommand: (command, data) => {
                this.__orders.push({command, data, description: `${command} ${data}`});
                if (this.__orders.length === 1) {
                    this.target = null;
                }
                renderer.render();
            }
        }, backData).then();
        renderer = await MODAL.fetchRendererFromBackData(backData);
    }

    async step() {
        super.step();

        if (this.__stay_timeout > 0) {
            this.__stay_timeout -= 1;
            return;
        }

        if ((this.target !== null && this.target.isDead )
        ) {
            this.__autopilot = null;
            this.target = null;
        }

        if (this.target === null) {
            if (this.__orders) {
                const gotoOrder = this.__orders.find(x => x.command === "goto");
                if (gotoOrder) {
                    this.target = gotoOrder.data;
                }
            }

            const stations = await this.getNearests(GEOStation.t);
            // noinspection JSValidateTypes
            this.target = weightedRandomChoice(stations.map((x, i) => ({item: x, weight: (i + 2) ** 2})), true);
        } else {
            if (this.goto(this.target.x, this.target.y, this.wantedTargetDistance, 0)) {
                const gotoOrder = this.__orders.find(x => x.command === "goto");
                if (gotoOrder) {
                    if (this.target === gotoOrder.data) {
                        this.__orders.splice(this.__orders.indexOf(gotoOrder), 1);
                    }
                }

                let salary = 0;
                if (this.__point_last_buy) {
                    salary = Math.round(Math.max(0, Math.log10(this.distanceTo(this.__point_last_buy)) ** 2));
                    if (salary === Infinity) {
                        salary = 0;
                    }
                }

                const cargoTypeSell = this.__orders.find(x => x.command === "sell")?.data || null;
                const cargoTypeBuy = this.__orders.find(x => x.command === "buy")?.data || null;

                let from = 0;
                let to = 0;
                if (!cargoTypeBuy || cargoTypeSell) {
                    to  = GEOStation.transferCargo(this, this.target, cargoTypeSell);
                }
                if (!cargoTypeSell || cargoTypeBuy) {
                    from = GEOStation.transferCargo(this.target, this, cargoTypeBuy);
                }
                console.debug(`[STS] Trader transferred cargo to ${this.target.name} for ${salary} C`, to, from, this.inventory.size);
                if (salary && this.owned) {
                    (new GPopup(`${this.label.text} transferred cargo to ${this.target.name} for ${salary} C`)).show();
                    SCORE.inc(salary).then();
                }

                this.target = null;
                this.__stay_timeout = (10 + Math.floor(30 * Math.random())) * this.game.fps;
                this.__point_last_buy = this.pos;
            }
        }
    }

    saveDict() {
        return {...super.saveDict(), stayTimeout: this.__stay_timeout, pointLastBuy: this.__point_last_buy, owner: this.owned ? "PLAYER" : null};
    }

    loadDict(data) {
        this.__stay_timeout = data.stayTimeout;
        this.__point_last_buy = data.pointLastBuy;
        this.owned = data?.owner === "PLAYER";
        super.loadDict(data);
    }
}
