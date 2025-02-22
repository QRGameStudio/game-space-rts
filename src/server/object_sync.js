class ServerObjectSync {
    constructor(game, server) {
        server.onEventListener((event, source, data) => {
            if (source === server.id) {
                return;
            }
            const objectType = event.split(':')[1];
            let obj;
            switch (objectType) {
                case GEOShip.t:
                    // noinspection JSCheckFunctionSignatures
                    obj = new GEOShip(game, {server, id: data.id, local: false}, ...data.args);
                    break;
                default:
                    console.warn(`[SERVER] Unknown object type: ${objectType}`);
                    return;
            }
        }, 'obj-create');
    }
}
