"use client";
/**
 * Perspective for the transform tool: draws a square image into any four-cornered shape by
 * splitting it into small triangles. Corners go top-left, top-right, bottom-right, bottom-left.
 */

export type Quad = [[number, number], [number, number], [number, number], [number, number]];

/** The four corners of a square leaned back (positive) or forward (negative), across and down. */
export function keystone(size: number, across: number, down: number): Quad {
  const kx = (size * across) / 200, ky = (size * down) / 200;
  return [
    [Math.max(0, ky), Math.max(0, kx)],
    [size - Math.max(0, ky), Math.max(0, -kx)],
    [size - Math.max(0, -ky), size - Math.max(0, -kx)],
    [Math.max(0, -ky), size - Math.max(0, kx)],
  ];
}

const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Where the point (u, v) of the unit square lands inside the quad. */
export function quadPoint(q: Quad, u: number, v: number): [number, number] {
  return lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v);
}

function triangle(ctx: CanvasRenderingContext2D, img: CanvasImageSource, s: [number, number][], d: [number, number][]) {
  const [[x0, y0], [x1, y1], [x2, y2]] = s, [[u0, v0], [u1, v1], [u2, v2]] = d;
  const den = x0 * (y2 - y1) - x1 * y2 + x2 * y1 + (x1 - x2) * y0;
  if (!den) return;
  const a = -(y0 * (u2 - u1) - y1 * u2 + y2 * u1 + (y1 - y2) * u0) / den;
  const b = (y1 * v2 + y0 * (v1 - v2) - y2 * v1 + (y2 - y1) * v0) / den;
  const c = (x0 * (u2 - u1) - x1 * u2 + x2 * u1 + (x1 - x2) * u0) / den;
  const dd = -(x1 * v2 + x0 * (v1 - v2) - x2 * v1 + (x2 - x1) * v0) / den;
  const e = (x0 * (y2 * u1 - y1 * u2) + y0 * (x1 * u2 - x2 * u1) + (x2 * y1 - x1 * y2) * u0) / den;
  const f = (x0 * (y2 * v1 - y1 * v2) + y0 * (x1 * v2 - x2 * v1) + (x2 * y1 - x1 * y2) * v0) / den;
  // Grow each triangle by half a pixel so no seams show between them.
  const cx = (u0 + u1 + u2) / 3, cy = (v0 + v1 + v2) / 3;
  const grow = (p: [number, number]): [number, number] => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + (dx / l) * 0.6, p[1] + (dy / l) * 0.6]; };
  const g = d.map(grow);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(g[0][0], g[0][1]); ctx.lineTo(g[1][0], g[1][1]); ctx.lineTo(g[2][0], g[2][1]); ctx.closePath(); ctx.clip();
  ctx.transform(a, b, c, dd, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/** Draws img (size × size) onto ctx so its corners land on the quad. */
export function drawWarped(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, q: Quad, steps = 12) {
  const S = img.width;
  for (let j = 0; j < steps; j++) for (let i = 0; i < steps; i++) {
    const u0 = i / steps, u1 = (i + 1) / steps, v0 = j / steps, v1 = (j + 1) / steps;
    const s: [number, number][] = [[u0 * S, v0 * S], [u1 * S, v0 * S], [u1 * S, v1 * S], [u0 * S, v1 * S]];
    const d = [quadPoint(q, u0, v0), quadPoint(q, u1, v0), quadPoint(q, u1, v1), quadPoint(q, u0, v1)];
    triangle(ctx, img, [s[0], s[1], s[2]], [d[0], d[1], d[2]]);
    triangle(ctx, img, [s[0], s[2], s[3]], [d[0], d[2], d[3]]);
  }
}
