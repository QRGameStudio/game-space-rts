/**
 * Generates a random name
 * @param lengthMin {number} minimum length of the name
 * @param lengthMax {number} maximum length of the name
 * @returns {string} the generated name
 */
function randomName(lengthMin, lengthMax) {
    const chars = lengthMin + Math.floor(Math.random() * (lengthMax - lengthMin));
    let name = '';

    const charlist = ['mnvcxlkjhgfdspztrwq', 'euioa'];
    for (let i = 0; i < chars; i++) {
        const list = charlist[i % 2];
        let char = list[Math.floor(Math.random() * list.length)];
        if (i === 0) {
            char = char.toUpperCase();
        }
        name += char;
    }

    return name;
}


/**
 * Chooses a random element from a list of items with weights
 * @template T
 * @param items {{item: T, weight: number}[]}
 * @param reversed {boolean}
 * @return T
 */
function weightedRandomChoice(items, reversed = false) {
    if (reversed) {
        const maxWeight = (items.map(x => x.weight)).reduce((a, b) => a + b, 0);
        items = items.map((x) => ({...x, weight: maxWeight - x.weight}))
    }

    items.sort((a, b) => a.weight - b.weight);
    const weightSumMax = items.map((x) => x.weight).reduce((a, b) => a + b, 0);
    const randomWeight = weightSumMax * Math.random();

    let weightSum = 0;
    for (const item of items) {
        weightSum += item.weight;
        if (weightSum >= randomWeight) {
            return item.item;
        }
    }
}

/**
 * @param seconds {number} time in seconds
 * @return {string} formatted time in HH:MM:SS
 */
function formatTime(seconds) {
    let hours = Math.floor(seconds / 3600);
    let minutes = Math.floor((seconds - hours * 3600) / 60);
    let secs = seconds - hours * 3600 - minutes * 60;

    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
