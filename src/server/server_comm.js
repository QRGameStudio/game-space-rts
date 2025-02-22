class ServerConnection {
    constructor(id) {
        this.id = id;
        this.__client = startMockServer(this);
        /** @type {{prefix: string, callback: function}[]} */
        this.__listeners = [];
        this.__client.send = (event, source, data) => {
            for (const listener of this.__listeners) {
                if (event.startsWith(listener.prefix)) {
                    listener.callback(event, source, data);
                }
            }
        };
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
}

class ServerCommAsset {
    /**
     * @param server {ServerConnection}
     * @param assetId {string | null}
     * @param assetCategory {string}
     */
    constructor(server, assetId = null, assetCategory = 'asset') {
        this.server = server;
        assetId = assetId || GUt.uuid();
        this.server_id = server.generateAssetId(assetId, assetCategory);
    }

    patchMethodName(methodName) {
        const orig = this[methodName];
        this.server.onEventListener((event, source, data) => {
            orig.apply(this, data);
        }, `${this.server_id}/${methodName}`);
        this[methodName] = () => {
            this.server.sendEvent(`${this.server_id}/${methodName}`, arguments).then();
        }
    }

    patchMethod(method) {
        this.patchMethodName(method.name);
    }
}