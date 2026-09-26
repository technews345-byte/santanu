/**
 * Geometry for the app's line charts, kept free of React so it can be tested.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * A smooth path through the points that never overshoots them.
 *
 * Most smoothing (Catmull-Rom, cardinal splines) bulges past the data between
 * points, so a running total that only ever rises would be drawn dipping
 * between two days — a movement that never happened. This is the monotone
 * cubic of Fritsch and Carlson (d3's curveMonotoneX): the curve is smooth, but
 * between any two points it stays within their range.
 *
 * Returns the SVG path and its length, which the draw-on animation needs and
 * which the renderer cannot report back synchronously.
 */
export function monotoneCurve(points: Point[]): { d: string; length: number } {
  const n = points.length;
  if (n === 0) return { d: '', length: 0 };
  if (n === 1) return { d: `M${points[0].x},${points[0].y}`, length: 0 };

  const t = new Array<number>(n).fill(0);
  const secant = (i: number) => {
    const h = points[i + 1].x - points[i].x;
    return h === 0 ? 0 : (points[i + 1].y - points[i].y) / h;
  };

  for (let i = 1; i < n - 1; i++) {
    const h0 = points[i].x - points[i - 1].x;
    const h1 = points[i + 1].x - points[i].x;
    const s0 = secant(i - 1);
    const s1 = secant(i);
    const p = h0 + h1 === 0 ? 0 : (s0 * h1 + s1 * h0) / (h0 + h1);
    t[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }

  if (n === 2) {
    t[0] = t[1] = secant(0);
  } else {
    // The ends take the slope implied by their neighbour, halved toward the
    // secant, so the curve leaves and arrives without a kink.
    const endSlope = (i: number, neighbour: number) => {
      const s = secant(Math.min(i, neighbour));
      return (3 * s - t[neighbour]) / 2;
    };
    t[0] = endSlope(0, 1);
    t[n - 1] = endSlope(n - 2, n - 2);
    // Never let an end tangent point against its segment's direction.
    if (Math.sign(t[0]) !== Math.sign(secant(0))) t[0] = 0;
    if (Math.sign(t[n - 1]) !== Math.sign(secant(n - 2))) t[n - 1] = 0;
  }

  let d = `M${fmt(points[0].x)},${fmt(points[0].y)}`;
  let length = 0;
  for (let i = 0; i < n - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = (b.x - a.x) / 3;
    const c1 = { x: a.x + dx, y: a.y + dx * t[i] };
    const c2 = { x: b.x - dx, y: b.y - dx * t[i + 1] };
    d += `C${fmt(c1.x)},${fmt(c1.y)} ${fmt(c2.x)},${fmt(c2.y)} ${fmt(b.x)},${fmt(b.y)}`;
    length += bezierLength(a, c1, c2, b);
  }
  return { d, length };
}

/** The line closed down to a baseline, for the wash beneath it. */
export function areaUnder(points: Point[], baseline: number): string {
  if (points.length < 2) return '';
  const { d } = monotoneCurve(points);
  const last = points[points.length - 1];
  return `${d}L${fmt(last.x)},${fmt(baseline)}L${fmt(points[0].x)},${fmt(baseline)}Z`;
}

/** A bar with its data end rounded and its base square on the axis. */
export function roundedTopBar(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0 || w <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return (
    `M${fmt(x)},${fmt(y + h)}` +
    `L${fmt(x)},${fmt(y + rr)}` +
    `Q${fmt(x)},${fmt(y)} ${fmt(x + rr)},${fmt(y)}` +
    `L${fmt(x + w - rr)},${fmt(y)}` +
    `Q${fmt(x + w)},${fmt(y)} ${fmt(x + w)},${fmt(y + rr)}` +
    `L${fmt(x + w)},${fmt(y + h)}Z`
  );
}

function bezierLength(p0: Point, p1: Point, p2: Point, p3: Point, steps = 16): number {
  let length = 0;
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
    const y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
    length += Math.hypot(x - prev.x, y - prev.y);
    prev = { x, y };
  }
  return length;
}

function fmt(v: number): string {
  return (Math.round(v * 100) / 100).toString();
}
