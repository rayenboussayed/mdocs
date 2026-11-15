/**
 * A point in 2D space.
 */
export declare class Point {
    x: number;
    y: number;
    /**
     * @param x - horizontal coordinate
     * @param y - vertical coordinate
     */
    constructor(x: number, y: number);
    /**
     * Euclidean distance to another point.
     * @param other - the point to measure to
     * @returns the distance in units
     */
    distanceTo(other: Point): number;
}
/**
 * Anything that knows its own area.
 */
export interface Shape {
    /** @returns the area in square units */
    area(): number;
}
/**
 * A pair of coordinates.
 */
export type Vector2 = [number, number];
//# sourceMappingURL=geometry.d.ts.map