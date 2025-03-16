class GEOStarSystem extends GEOSelectable {
    static t = 'system';

    /**
     * @param game {GEG}
     * @param x {number}
     * @param y {number}
     */
    constructor(game, x, y) {
        super(game);
        this.sides = 8;
        this.t = GEOStarSystem.t;
        this.x = x;
        this.y = y;
        this.label = new GEOLabel(this.game, this, randomName());
        this.gonioCoefficient = 2 * PI / this.sides;
        this.clickable = true;

        this.w = this.h = 75;

        /** @type {GEOStarSystem[]} */
        this.connections = [];
    }

    onclick(x, y, clickedObject) {
        if (clickedObject.size > 1) {
            return false;
        }

        console.debug('[System] selecting', this.label.text);
        this.constructor.selectedId = this.id;
        if (GEOShip.selectedId !== null) {
            /** @type {GEOShip | undefined} */
            const ship = [...this.game.objectsOfTypes(GEOShip.t)].find((ship) => ship.id === GEOShip.selectedId);
            if (ship) {
                ship.goToSystem(this.label.text);
                setTimeout(() =>{
                    if (this.constructor.selectedId === this.id) {
                        this.constructor.selectedId = null;
                        GEOShip.selectedId = null;
                    }
                }, 200);
            }
        } else {
            this.selectObject();
        }

        return true;
    }

    step() {

    }

    draw(ctx) {
        ctx.beginPath();
        for (let i = 0; i < this.sides; i++) {
            const sideX = this.x - this.wh * cos(this.gonioCoefficient * i);
            const sideY = this.y - this.hh * sin(this.gonioCoefficient * i);
            if (i === 0) {
                ctx.moveTo(sideX, sideY);
            } else {
                ctx.lineTo(sideX, sideY);
            }
        }
        ctx.closePath();
        ctx.strokeStyle = this.constructor.selectedId === this.id ? 'orange' : 'white';
        ctx.lineWidth = this.constructor.selectedId === this.id ? 6 : 4;
        ctx.stroke();

        for (const connection of this.connections) {
            ctx.beginPath();
            const angleTo = GUt.countAngle(connection.x - this.x, connection.y - this.y);
            const pointStart = GUt.pointRelativeToAngle(this.x, this.y, this.d, this.w / 2, angleTo);
            const pointEnd = GUt.pointRelativeToAngle(connection.x, connection.y, connection.d, connection.w / 2, angleTo + 180);
            ctx.moveTo(pointStart.x, pointStart.y);
            ctx.lineTo(pointEnd.x, pointEnd.y);
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 4;
            ctx.stroke();
        }
    }

    saveDict() {
        return {
            ...super.saveDict(),
            name: this.label.text,
            connections: this.connections.map((connection) => connection.label.text),
        };
    }

    loadDict(data) {
        super.loadDict(data);
        this.label.text = data.name;
        for (const connectionName of data.connections) {
            /** @type {GEOStarSystem} */
            const connection = [...this.game.objectsOfTypes(GEOStarSystem.t)].find((system) => system?.label.text === connectionName);
            if (connection) {
                this.connections.push(connection);
                connection.connections.push(this);
            }
        }
    }
}
