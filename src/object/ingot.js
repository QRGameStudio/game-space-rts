/**
 * @param game {GEG}
 * @param x {number}
 * @param y {number}
 * @param creator {GEO}
 * @param item {Item}
 */
function createIngot(game, x, y, creator, item) {
    let spinSpeed = (random() * 3) - 1.5;

    const obj = game.createObject();
    obj.w = 10;
    obj.h = 20;
    obj.x = x;
    obj.y = y;
    obj.s = 0.3 * random();
    obj.d = random() * 360;
    obj.t = 'ingot';
    obj.item = item;
    obj.cwl.add('p');
    obj.cwl.add('drone');

    obj.step = () => {
        obj.ia += spinSpeed;

        if (obj.distanceFrom(PLAYER) > 2 * game.r && obj.distanceFrom(creator) > 2 * game.r) {
            obj.die();
        }
    }

    /** @param other {GEOShip} */
    obj.oncollision = (other) => {
        if (other.inventory.add(obj.item.name, 1)) {
            obj.die();
        }
    };

    /**
     * @param ctx {CanvasRenderingContext2D}
     */
    obj.draw = (ctx) => {
        ctx.fillStyle = obj.item.color;
        ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
    }

    return obj;
}
