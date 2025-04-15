/**
 * @typedef {{server: ServerConnection, local?: boolean, id?: string}} GEOServerConnection
 */

class GEOSavable extends GEO {
    /**
     *
     * @param geg {GEG}
     * @param server {GEOServerConnection | null}
     * @param owner {string | null}
     */
    constructor(geg, server, owner) {
        super(geg);
        this.conn = server !== null ? new ServerCommAsset(server, this) : null;
        this.owner = owner;
    }

    sendCreationEvent(args) {
        if (!this.conn) {
            return;
        }
        const params = [...args];
        params.shift();
        params.shift();
        this.conn.sendCreationEvent(this.t, params);
    }

    explode() {
        console.log('Explode', this.id, this.conn.server.mainServer);
        this.die();
    }

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
