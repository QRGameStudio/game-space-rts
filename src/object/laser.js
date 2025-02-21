class GEOLaser extends GEO {
    /**
     * @param game {GEG}
     * @param owner {GEO}
     * @param isLeft {boolean}
     * @param targets {string[]}
     * @return {GEO}
     */
    constructor(game, owner, isLeft, targets) {
        super(game);
        this.owner = owner;

        const pos = GUt.pointRelativeTo(owner.x, owner.y, owner.d, owner.wh, owner.hh * 2/3 * (isLeft ? -1 : 1));
        this.x = pos.x;
        this.y = pos.y;
        this.d = owner.d;
    }
}


/**
 * @param game {GEG}
 * @param owner {GEO}
 * @param isLeft {boolean}
 * @param targets {string[]}
 * @return {GEO}
 */
function createLaser(game, owner, isLeft, targets) {
    const obj = new GEOLaser(game, owner, isLeft, targets);
    obj.h = 3;
    obj.w = owner.wh * 2/3;
    obj.s = 7;
    obj.t = 'l';

    targets.forEach((target) => obj.cwl.add(target));

    /**
     * @param ctx {CanvasRenderingContext2D}
     */
    obj.draw = (ctx) => {
        ctx.strokeStyle = 'aqua';
        ctx.lineWidth = obj.h;
        ctx.beginPath();
        ctx.moveTo(obj.x - obj.wh, obj.y);
        ctx.lineTo(obj.x + obj.wh, obj.y);
        ctx.closePath();
        ctx.stroke();
    }

    obj.oncollision = (other) => {
        other.health -= 5;
        obj.die();
    }

    MUSIC.play('laser', 1, obj.soundVolume).then();

    obj.step = () => {
      if (obj.distanceTo(PLAYER) > game.r * 10 && obj.distanceTo(owner) > game.r * 10) {
          obj.die();
      }
    };

    return obj;
}
