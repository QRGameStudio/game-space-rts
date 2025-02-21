class SystemMap {
    constructor() {
        this.__ship_types = new Set([GEOPlayer.t, GEOPirate.t, GEOTrader.t, GEOMiner.t]);
        this.__ship_radar_range = 2000000;

        const btnMap = $('#btnMap');
        new GRenderer(btnMap).render();  // render icon

        btnMap.onclick = async () => {
            // noinspection JSUnusedGlobalSymbols
            const functions = {
                gotoObject: (point) => {
                    PLAYER.goto(point.x, point.y, 200);
                    functions.hideModal();
                }
            }

            let intervalRender = null;

            const backData = {};
            const modalClose = MODAL.show('targetSelection', await this.__getRendererData(), functions, backData);
            const rendered = await MODAL.fetchRendererFromBackData(backData);

            this.__scrollToPlayer();
            this.__resolveSystemOverlaps();
            this.__connectLines()
            intervalRender = setInterval(async () => {
                rendered.variables = await this.__getRendererData();
                rendered.render();
                this.__resolveSystemOverlaps();
                this.__connectLines();
            }, 2000);

            modalClose.then(() => clearInterval(intervalRender));
        }
    }

    __scrollToPlayer() {
        setTimeout(() => {
            const mapContainer = $('.system-map-container');

            // Scroll map to the player position
            const mapPlayer = $('.system-player');
            const containerRect = mapContainer.getBoundingClientRect();
            const playerRect = mapPlayer.getBoundingClientRect();
            const verticalOffset = playerRect.top - containerRect.top + mapContainer.scrollTop;
            const horizontalOffset = playerRect.left - containerRect.left + mapContainer.scrollLeft;
            const verticalScrollTo = verticalOffset - (mapContainer.clientHeight / 2) + (mapPlayer.clientHeight / 2);
            const horizontalScrollTo = horizontalOffset - (mapContainer.clientWidth / 2) + (mapPlayer.clientWidth / 2);
            mapContainer.scrollTop = verticalScrollTo;
            mapContainer.scrollLeft = horizontalScrollTo;
        });
    }

    __resolveSystemOverlaps() {
        function checkOverlap(element1, element2) {
            const rect1 = element1.getBoundingClientRect();
            const rect2 = element2.getBoundingClientRect();

            return !(rect1.right < rect2.left ||
                rect1.left > rect2.right ||
                rect1.bottom < rect2.top ||
                rect1.top > rect2.bottom);
        }

        function moveRight(element, referenceElement) {
            const referenceRect = referenceElement.getBoundingClientRect();
            const currentLeft = parseInt(window.getComputedStyle(element).left, 10);
            element.style.left = `${currentLeft + referenceRect.width + 10}px`; // Move right by the width of referenceElement + some margin
        }

        const children = document.querySelectorAll('.system-map > .system-label');
        let moved;

        do {
            moved = false;
            for (let i = 0; i < children.length; i++) {
                for (let j = i + 1; j < children.length; j++) {
                    if (checkOverlap(children[i], children[j])) {
                        moveRight(children[j], children[i]);
                        moved = true;
                    }
                }
            }
        } while (moved);
    }

    __connectLines() {
        const mapContainer = $('.system-map-container');
        const containerPos = mapContainer.getBoundingClientRect();

        document.querySelectorAll('.system-map > .system-line').forEach((line) => {
            const objectId = line.id.split('-')[2];
            if (!objectId) {
                return;
            }
            const elIcon = document.getElementById(`system-icon-${objectId}`);
            const elDot = document.getElementById(`system-dot-${objectId}`);

            const pos1 = elIcon.getBoundingClientRect();
            const pos2 = elDot.getBoundingClientRect();

            const x1 = pos1.left + pos1.width / 2 - containerPos.left + mapContainer.scrollLeft;
            const y1 = pos1.top + pos1.height / 2 - containerPos.top + mapContainer.scrollTop;
            const x2 = pos2.left + pos2.width / 2 - containerPos.left + mapContainer.scrollLeft;
            const y2 = pos2.top + pos2.height / 2 - containerPos.top + mapContainer.scrollTop;

            const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
            const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;

            line.style.width = length + 'px';
            line.style.transform = `rotate(${angle}deg)`;
            line.style.top = y1 + 'px';
            line.style.left = x1 + 'px';
        });
    }

    async __getRendererData() {
        const radarSources = [
            PLAYER, ...[...GAME.objectsOfTypes(new Set([GEOTrader.t]))].filter(x => x?.owned)
        ];

        const fields = [
            ...(await GAME.getNearest(PLAYER, NAVIGABLE_TYPES)),
            ...radarSources.map((x) => [...GAME.getInRange(x, this.__ship_types, this.__ship_radar_range)]).flat(),
            ...radarSources
        ].filter((field, index, self) =>
                index === self.findIndex((t) => (
                    t.id === field.id
                ))
        );

        const minX = Math.min(...fields.map(x => x.x));
        const minY = Math.min(...fields.map(x => x.y));
        const maxX = Math.max(...fields.map(x => x.x));
        const maxY = Math.max(...fields.map(x => x.y));
        const mapPrecision = 10000;

        const mapFields = fields.map((obj) => {
            const distance = GEG.distanceBetween(PLAYER, obj); // meters
            return {
                x: obj.x,
                y: obj.y,
                id: obj.id,
                map: {
                    x: Math.floor((obj.x - minX) / mapPrecision) + 100,
                    y: Math.floor((obj.y - minY) / mapPrecision) + 100,
                },
                isNavigable: NAVIGABLE_TYPES.has(obj.t),
                isPlayer: obj.t === PLAYER.t,
                name: obj?.label?.text,
                distance: `${Math.round(distance) / 1000} km`,
                distanceFloor: `${Math.floor(distance / 1000)} km`,
                time: formatTime(Math.floor(distance / (PLAYER.maxSpeed * GAME.fps))),
                icon: obj?.icon,
                color: obj?.label?.color
            }
        });

        return {
            fields: {
                navigable: [...mapFields.filter(x => x.isNavigable)],
                all: mapFields
            },
            map: {
                max: {
                    x: Math.floor((maxX - minX) / mapPrecision) + 200,
                    y: Math.floor((maxY - minY) / mapPrecision) + 200
                }
            }
        };
    }
}
