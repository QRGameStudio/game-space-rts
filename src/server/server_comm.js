class ServerConnection {
    /** @type {GameServer | null} */
    static __mockServer = null;

    constructor(id = null, mainServer = false, verbose = false) {
        this.id = id || GUt.uuid();
        this.mainServer = mainServer;
        this.verbose = verbose;

        /** @type {GameClient} */
        this.__client = {
            id: this.id,
            send: (event, source, data) => this.__onServerEvent(event, source, data),
            onEvent: this.sendEvent
        };

        if (!this.constructor.__mockServer) {
            this.constructor.__mockServer = startMockServer(this);
        }

        this.constructor.__mockServer.addClient(this.__client);

        /** @type {{prefix: string, callback: function}[]} */
        this.__listeners = [];
    }

    /**
     * Generates an asset id for the server
     * @param localId {string | number} The local id of the asset
     * @param category {string} The category of the asset
     * @returns {string} The generated asset id
     */
    generateAssetId(localId, category = "asset") {
        return `${this.id}:${category}:${localId}`;
    }

    /**
     * Generates asset ID for game objects
     * @param object {GEO} The game object
     */
    generateObjectId(object) {
        return this.generateAssetId(object.id, 'object');
    }

    /**
     * Sends an event to the server
     * @param event The event name
     * @param data The event data
     * @returns {Promise<void>} A promise that resolves when the event is sent
     */
    async sendEvent(event, data) {
        data = JSON.stringify(data);
        if (this.verbose) {
            console.debug('[Conn] >', event, data);
        }
        await this.__client.onEvent(event, data);
    }

    /**
     * Sets the event listener for the server connection
     * @param {string} prefix The prefix of the event name
     * @param {function} callback The callback function
     * @returns {void}
     */
    async onEventListener(callback, prefix = '') {
        this.__listeners.push({prefix, callback});
    }

    async __onServerEvent(event, source, data) {
        data = JSON.parse(data);
        if (this.verbose) {
            console.debug('[Conn] <', event, source, data);
        }
        for (const listener of this.__listeners) {
            if (event.startsWith(listener.prefix)) {
                listener.callback(event, source, data);
            }
        }
    }
}

class ServerCommAsset {
    /** @type {Map<string, ServerCommAsset>} */
    static __mapID = new Map();

    /**
     * @param server {{server: ServerConnection, local?: boolean, id?: string}}
     * @param parent {Object}
     * @param assetId {string | null}
     * @param assetCategory {string}
     */
    constructor(server, parent, assetId = null, assetCategory = 'asset') {
        this.server = server.server;
        this.parent = parent;
        /** @type {boolean} True if the object was originally created locally */
        this.local = true;
        assetId = assetId || GUt.uuid();
        this.server_id = this.server.generateAssetId(assetId, assetCategory);

        if (typeof server.local !== 'undefined') {
            this.local = server.local;
            this.server_id = server.id;
        }

        this.server.onEventListener((event, source, data) => {
            if (source === this.server.id) {
                return;
            }
            for (const key in data) {
                this.parent[key] = data[key];
            }
        }, `${this.server_id}/sync::periodic`);
        this.server.onEventListener((event, source, data) => {
            this.constructor.__mapID.delete(data.id);
        }, `${this.server_id}/patchedMethod:die`);

        this.constructor.__mapID.set(server.id, this);

        if (parent.hasOwnProperty('die')) {
            this.patchMethod(parent.die);
        }
    }

    syncPosition() {
        if (!this.server.mainServer || Math.floor(Math.random() * 100) !== 0) {
            return;
        }

        this.server.sendEvent(`${this.server_id}/sync::periodic`, {
            id: this.server_id,
            x: this.parent.x,
            y: this.parent.y
        }).then();
    }

    patchMethodName(methodName) {
        const orig = this.parent[methodName];
        const eventName = `${this.server_id}/patchedMethod:${methodName}`;
        this.server.onEventListener((event, source, data) => {
            data = data.map(arg => {
                if (typeof arg === 'string' && arg.startsWith('GEO::')) {
                    return this.constructor.__mapID.get(arg.split('::')[1]).parent;
                }
                return arg;
            });
            orig.apply(this.parent, data);
        }, eventName);
        this.parent[methodName] = (...args) => {
            args = args.map(arg => {
               if (arg instanceof GEO && arg.conn?.server_id) {
                   return `GEO::${arg.conn.server_id}`;
               }
                return arg;
            });
            this.server.sendEvent(eventName, [...args]).then();
        }
    }

    patchMethod(method) {
        this.patchMethodName(method.name);
    }

    sendCreationEvent(name, args) {
        if (!this.local) {
            return;
        }
        this.server.sendEvent(`obj-create:${name}`, {
            id: this.server_id,
            args
        }).then();
    }
}