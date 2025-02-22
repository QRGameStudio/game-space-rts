/**
 * Starts a mock server for testing purposes
 * @param {ServerConnection} con
 * @return {GameServer}
 */
function startMockServer(con) {
    console.log('[SERVER] Starting mock server');
    // !G.import('../../server/server.js');

    return new GameServer();
}
