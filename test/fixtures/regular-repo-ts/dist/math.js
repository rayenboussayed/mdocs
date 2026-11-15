/**
 * Add two numbers.
 * @param a - the first addend
 * @param b - the second addend
 * @returns the sum of `a` and `b`
 */
export function add(a, b) {
    return a + b;
}
/**
 * Clamp a value into the inclusive range [min, max].
 * @param value - the number to clamp
 * @param min - lower bound, defaults to 0
 * @param max - upper bound, defaults to 100
 * @returns the clamped value
 */
export function clamp(value, min = 0, max = 100) {
    return Math.min(Math.max(value, min), max);
}
/**
 * Return the first element of a list.
 * @typeParam T - element type
 * @param items - any list of items
 * @returns the first element, or `undefined` when empty
 */
export function first(items) {
    return items[0];
}
// Internal helper: exported (so mdocs sees it) but intentionally
// left without JSDoc to test graceful skip of undocumented symbols.
export function double(n) {
    return n * 2;
}
//# sourceMappingURL=math.js.map