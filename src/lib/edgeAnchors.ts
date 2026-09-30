import { Position } from '@xyflow/react';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Axis = 'vertical' | 'horizontal';

export interface AutoSides {
  source: Position;
  target: Position;
}

function verticalSides(source: Rect, target: Rect): AutoSides | null {
  if (target.y >= source.y + source.height) return { source: Position.Bottom, target: Position.Top };
  if (target.y + target.height <= source.y) return { source: Position.Top, target: Position.Bottom };
  return null;
}

function horizontalSides(source: Rect, target: Rect): AutoSides | null {
  if (target.x >= source.x + source.width) return { source: Position.Right, target: Position.Left };
  if (target.x + target.width <= source.x) return { source: Position.Left, target: Position.Right };
  return null;
}

/**
 * Picks which side of each node an edge should leave/enter from, based on where
 * the nodes sit relative to each other. The preferred axis is used whenever the
 * nodes are separated along it (e.g. top-to-bottom layouts always leave from the
 * bottom when the target is lower); otherwise the other axis is used.
 */
export function pickAutoSides(source: Rect, target: Rect, preferredAxis: Axis = 'vertical'): AutoSides {
  const [first, second] = preferredAxis === 'vertical'
    ? [verticalSides, horizontalSides]
    : [horizontalSides, verticalSides];
  return (
    first(source, target) ??
    second(source, target) ??
    (preferredAxis === 'vertical'
      ? { source: Position.Bottom, target: Position.Top }
      : { source: Position.Right, target: Position.Left })
  );
}

/** Returns the midpoint of the given side of a rectangle. */
export function getSidePoint(rect: Rect, side: Position): { x: number; y: number } {
  switch (side) {
    case Position.Top:
      return { x: rect.x + rect.width / 2, y: rect.y };
    case Position.Right:
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
    case Position.Bottom:
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    case Position.Left:
      return { x: rect.x, y: rect.y + rect.height / 2 };
  }
}

/**
 * Returns the point at `t` (0–1) along a single cubic bezier SVG path
 * (`M x,y C x,y x,y x,y`, as produced by `getBezierPath`), or null if the path
 * isn't in that form.
 */
export function pointOnCubicPath(path: string, t: number): { x: number; y: number } | null {
  if (!/^\s*M[^C]*C[^MCLQ]*$/.test(path)) return null;
  const n = path.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number);
  if (!n || n.length !== 8) return null;
  const [x0, y0, x1, y1, x2, y2, x3, y3] = n;
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * x0 + b * x1 + c * x2 + d * x3, y: a * y0 + b * y1 + c * y2 + d * y3 };
}

/**
 * Where along an edge its label should sit. When several edges fan out of the same
 * source they overlap near it, so labels move towards the target (and vice versa
 * for fan-in) to keep sibling labels apart.
 */
export function getLabelT(fanOut: number, fanIn: number): number {
  if (fanOut > fanIn) return 0.7;
  if (fanIn > fanOut) return 0.3;
  return 0.5;
}
