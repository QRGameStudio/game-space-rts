class ServerConnection {
    constructor() {
        this.__client = startMockServer(this);
        /** @type {function | null} */
        this.__listener = null;
        this.__client.send = (event, source, data) => new Promise(() => this.__listener(event, source, data));
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
     * @param {function} callback The callback function
     * @returns {void}
     */
    async onEventListener(callback) {
        this.__listener = callback;
    }
}
