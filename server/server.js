/**
 * @typedef {{
 *     id: string,
 *     onEvent: (event: string, data: any) => Promise<void>,
 *     send: (event: string, source: string, data: any) => Promise<void>,
 * }} GameClient
 */


class GameServer {
    constructor() {
        /** @type {GameClient[]} */
        this.clients = [];
    }

    /**
     * @param {GameClient} client
     */
    addClient(client) {
        for (const otherClient of this.clients) {
            if (otherClient.id === client.id) {
                throw new Error('Client with id already exists');
            }
        }
        console.log('[SERVER] New client', client.id);

        this.clients.push(client);
        client.onEvent = (event, data) => {
            // console.log(`[SERVER] Client event: ${event}`, data);
            switch (event) {
                case 'disconnect':
                    this.removeClient(client);
                    break;
                default:
                    this.clients.forEach(otherClient => {
                        if (otherClient.id !== client.id || true) {
                            otherClient.send(event, client.id, data).then()
                        }
                    });
                    break;
            }
        };
    }

    /**
     * @param {GameClient} client
     */
    removeClient(client) {
        const index = this.clients.indexOf(client);
        if (index >= 0) {
            this.clients.splice(index, 1);
        }
    }
}
