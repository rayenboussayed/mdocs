
/**
 * Return its argument unchanged.
 * @typeParam T - the type of the value
 * @param x - any value
 * @returns the very same value
 */
export function identity<T>(x: T): T {
  return x;
}
