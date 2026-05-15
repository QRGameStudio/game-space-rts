class ServerObjectSync {
    /**
     *
     * @param game {GEG}
     * @param server {ServerConnection}
     */
    constructor(game, server) {
        server.onEventListener((event, source, data) => {
            if (source === server.id) {
                return;
            }
            console.debug(`[SERVER] Received object create event from ${source} to ${server.id}`, event, data);
            const objectType = event.split(':')[1];
            let obj;
            switch (objectType) {
                case GEOShip.t:
                    // args: [systemName, owner, shipClass]
                    obj = new GEOShip(game, {server, id: data.id, local: false}, ...data.args);
                    break;
                case GEOStation.t:
                    // args: [systemName, owner]
                    obj = new GEOStation(game, {server, id: data.id, local: false}, ...data.args);
                    break;
                case GEORepairStation.t:
                    // args: [systemName, owner]
                    obj = new GEORepairStation(game, {server, id: data.id, local: false}, ...data.args);
                    break;
                case GEOJumpInhibitor.t:
                    // args: [systemName, owner]
                    obj = new GEOJumpInhibitor(game, {server, id: data.id, local: false}, ...data.args);
                    break;
                default:
                    console.warn(`[SERVER] Unknown object type: ${objectType}`);
                    return;
            }
        }, 'obj-create');
    }
}
