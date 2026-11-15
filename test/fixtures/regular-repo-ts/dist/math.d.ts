/**
 * Add two numbers.
 * @param a - the first addend
 * @param b - the second addend
 * @returns the sum of `a` and `b`
 */
export declare function add(a: number, b: number): number;
/**
 * Clamp a value into the inclusive range [min, max].
 * @param value - the number to clamp
 * @param min - lower bound, defaults to 0
 * @param max - upper bound, defaults to 100
 * @returns the clamped value
 */
export declare function clamp(value: number, min?: number, max?: number): number;
/**
 * Return the first element of a list.
 * @typeParam T - element type
 * @param items - any list of items
 * @returns the first element, or `undefined` when empty
 */
export declare function first<T>(items: T[]): T | undefined;
export declare function double(n: number): number;
//# sourceMappingURL=math.d.ts.map