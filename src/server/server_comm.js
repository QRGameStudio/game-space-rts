class ServerConnection {
    /** @type {GameServer | null} */
    static __mockServer = null;

    constructor(id = null, mainServer = false) {
        this.id = id || GUt.uuid();
        this.mainServer = mainServer;

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
        console.debug('[Conn] >', event, data);
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
        console.debug('[Conn] <', event, source, data);
        for (const listener of this.__listeners) {
            if (event.startsWith(listener.prefix)) {
                listener.callback(event, source, data);
            }
        }
    }
}

class ServerCommAsset {
    /**
     * @param server {{server: ServerConnection, local?: boolean, id?: string}}
     * @param parent {Object}
     * @param assetId {string | null}
     * @param assetCategory {string}
     */
    constructor(server, parent, assetId = null, assetCategory = 'asset') {
        this.server = server.server;
        this.parent = parent;
        this.local = true;
        assetId = assetId || GUt.uuid();
        this.server_id = this.server.generateAssetId(assetId, assetCategory);

        if (typeof server.local !== 'undefined') {
            this.local = server.local;
            this.server_id = server.id;
        }
    }

    patchMethodName(methodName) {
        const orig = this.parent[methodName];
        const eventName = `${this.server_id}/patchedMethod:${methodName}`;
        this.server.onEventListener((event, source, data) => {
            orig.apply(this.parent, data);
        }, eventName);
        this.parent[methodName] = (...args) => {
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