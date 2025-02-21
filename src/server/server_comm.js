class ServerConnection {
    constructor() {
        this.__client = startMockServer(this);
        /** @type {function | null} */
        this.__listener = null;
        this.__client.send = (event, source, data) => new Promise(() => this.__listener(event, source, data));
    }

    async sendEvent(event, data) {
        await this.__client.onEvent(event, data);
    }

    async onEventListener(callback) {
        this.__listener = callback;
    }
}
