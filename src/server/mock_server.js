/**
 * Starts a mock server for testing purposes
 * @param {ServerConnection} con
 * @return {GameClient}
 */
function startMockServer(con) {
    console.log('[SERVER] Starting mock server');
    // !G.import('../../server/server.js');

    const server = new GameServer();
    /** @type {GameClient} */
    const client = {
        id: 'local-player',
        send: null,
        onEvent: con.sendEvent
    }

    server.addClient(client);
    return client;
}
