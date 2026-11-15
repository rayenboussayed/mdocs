/**
 * A point in 2D space.
 */
export class Point {
    x;
    y;
    /**
     * @param x - horizontal coordinate
     * @param y - vertical coordinate
     */
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    /**
     * Euclidean distance to another point.
     * @param other - the point to measure to
     * @returns the distance in units
     */
    distanceTo(other) {
        return Math.hypot(this.x - other.x, this.y - other.y);
    }
}
//# sourceMappingURL=geometry.js.map