/**
 * A point in 2D space.
 */
export class Point {
  /**
   * @param x - horizontal coordinate
   * @param y - vertical coordinate
   */
  constructor(
    public x: number,
    public y: number,
  ) {}

  /**
   * Euclidean distance to another point.
   * @param other - the point to measure to
   * @returns the distance in units
   */
  distanceTo(other: Point): number {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }
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
