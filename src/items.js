/**
 * @typedef {{name: string, basePrice: number, color: string, dropRate: number, mineable: boolean, crafting: {[itemName: string]: number} | null, storable: boolean}} Item
 */

/**
 *
 * @type {Item[]}
 */
const ITEMS_ARR = [{
    name: 'metal',
    basePrice: 1,
    color: 'gray',
    dropRate: 100,
    mineable: true,
    crafting: null,
    storable: true
}, {
    name: "gold",
    basePrice: 10,
    color: "yellow",
    dropRate: 10,
    mineable: true,
    crafting: null,
    storable: true
}, {
    name: "copper",
    basePrice: 2,
    color: "orange",
    dropRate: 60,
    mineable: true,
    crafting: null,
    storable: true
}, {
    name: "ice",
    basePrice: 8,
    color: "blue",
    dropRate: 20,
    mineable: true,
    crafting: null,
    storable: true
}, {
    name: "water",
    basePrice: 2,
    color: "blue",
    dropRate: 20,
    mineable: false,
    storable: true,
    crafting: {
        "ice": 1
    }
}, {
    name: "battery",
    basePrice: 25,
    color: "blue",
    dropRate: 5,
    mineable: false,
    crafting: {
        "copper": 2,
        "gold": 1,
        "metal": 2
    },
    storable: true
}, {
    name: "trader ship",
    basePrice: 800,
    color: "cyan",
    dropRate: 1,
    mineable: false,
    crafting: {
        "copper": 10,
        "gold": 5,
        "metal": 10,
        "battery": 5
    },
    storable: false
}];


// Automatically create dictionary with items
/**
 *
 * @type {{[name: string]: Item}}
 */
const ITEMS = {};
ITEMS_ARR.forEach(x => ITEMS[x.name] = x);
