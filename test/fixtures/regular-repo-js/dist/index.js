/**
 * Greet someone by name.
 * @param {string} name - the person to greet
 * @returns {string} a friendly greeting
 * @example
 * greet("Ada"); // "Hello, Ada!"
 */
export function greet(name) {
    return `Hello, ${name}!`;
}
/**
 * Sum a list of numbers, starting from an offset.
 * @param {number[]} list - the numbers to add up
 * @param {number} [start=0] - the initial value
 * @returns {number} the total
 * @example
 * sum([1, 2, 3]); // 6
 */
export function sum(list, start = 0) {
    return list.reduce((acc, n) => acc + n, start);
}
/**
 * A simple counter.
 */
export class Counter {
    /**
     * @param {number} [initial=0] - starting value
     */
    constructor(initial = 0) {
        /** @type {number} */
        this.value = initial;
    }
    /**
     * Increment the counter.
     * @param {number} [step=1] - how much to add
     * @returns {number} the new value
     */
    increment(step = 1) {
        this.value += step;
        return this.value;
    }
}
//# sourceMappingURL=index.js.map