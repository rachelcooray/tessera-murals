/**
 * Every shape the paint tool can draw, as point lists fitted to a dragged box. Pure maths, so it runs in tests.
 */

export type ShapeKind =
  | "line" | "curve" | "rect" | "roundrect" | "ellipse" | "triangle" | "righttriangle" | "diamond" | "pentagon" | "hexagon"
  | "arrowRight" | "arrowLeft" | "arrowUp" | "arrowDown" | "star4" | "star5" | "star6" | "calloutRound" | "calloutOval" | "heart" | "lightning";

export const SHAPES: { id: ShapeKind; label: string }[] = [
  { id: "line", label: "Line" }, { id: "curve", label: "Curve" }, { id: "rect", label: "Rectangle" }, { id: "roundrect", label: "Rounded rectangle" },
  { id: "ellipse", label: "Oval" }, { id: "triangle", label: "Triangle" }, { id: "righttriangle", label: "Right triangle" }, { id: "diamond", label: "Diamond" },
  { id: "pentagon", label: "Pentagon" }, { id: "hexagon", label: "Hexagon" }, { id: "arrowRight", label: "Right arrow" }, { id: "arrowLeft", label: "Left arrow" },
  { id: "arrowUp", label: "Up arrow" }, { id: "arrowDown", label: "Down arrow" }, { id: "star4", label: "4-point star" }, { id: "star5", label: "5-point star" },
  { id: "star6", label: "6-point star" }, { id: "calloutRound", label: "Rounded callout" }, { id: "calloutOval", label: "Oval callout" },
  { id: "heart", label: "Heart" }, { id: "lightning", label: "Lightning" },
];

export interface ShapePath { points: [number, number][]; closed: boolean }

type Unit = [number, number][];

const regular = (n: number): Unit => Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]; });
const star = (n: number, inner: number): Unit => Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? 0.5 * inner : 0.5; return [0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]; });
const ARROW: Unit = [[0, 0.3], [0.6, 0.3], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.7], [0, 0.7]];

const UNITS: Partial<Record<ShapeKind, Unit>> = {
  rect: [[0, 0], [1, 0], [1, 1], [0, 1]],
  triangle: [[0.5, 0], [1, 1], [0, 1]],
  righttriangle: [[0, 0], [1, 1], [0, 1]],
  diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  pentagon: regular(5),
  hexagon: regular(6),
  arrowRight: ARROW,
  arrowLeft: ARROW.map(([x, y]) => [1 - x, y]),
  arrowDown: ARROW.map(([x, y]) => [y, x]),
  arrowUp: ARROW.map(([x, y]) => [y, 1 - x]),
  star4: star(4, 0.38),
  star5: star(5, 0.42),
  star6: star(6, 0.55),
  lightning: [[0.55, 0], [0.15, 0.55], [0.45, 0.55], [0.3, 1], [0.85, 0.4], [0.55, 0.4], [0.75, 0]],
  heart: Array.from({ length: 64 }, (_, i) => {
    const t = (i / 64) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [0.5 + x / 34, 0.47 - y / 34] as [number, number];
  }),
};

function roundRect(l: number, t: number, w: number, h: number, tail: boolean): [number, number][] {
  const r = Math.min(w, h) * 0.15, pts: [number, number][] = [];
  const arc = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 8; i++) { const a = a0 + (i / 8) * (Math.PI / 2); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  arc(l + w - r, t + r, -Math.PI / 2);
  arc(l + w - r, t + h - r, 0);
  if (tail) pts.push([l + w * 0.42, t + h], [l + w * 0.12, t + h * 1.25], [l + w * 0.25, t + h]);
  arc(l + r, t + h - r, Math.PI / 2);
  arc(l + r, t + r, Math.PI);
  return pts;
}

function oval(cx: number, cy: number, rx: number, ry: number, tail: boolean): [number, number][] {
  const pts: [number, number][] = [];
  let tipped = false;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2, deg = (a * 180) / Math.PI;
    if (tail && deg > 100 && deg < 125) {
      if (!tipped) { pts.push([cx - rx * 0.55, cy + ry * 1.45]); tipped = true; }
      continue;
    }
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

/** The shape fitted to the box from (x0, y0) to (x1, y1). */
export function shapePath(kind: ShapeKind, x0: number, y0: number, x1: number, y1: number): ShapePath {
  if (kind === "line" || kind === "curve") return { points: [[x0, y0], [x1, y1]], closed: false };
  const l = Math.min(x0, x1), t = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
  if (kind === "ellipse") return { points: oval(l + w / 2, t + h / 2, w / 2, h / 2, false), closed: true };
  if (kind === "roundrect") return { points: roundRect(l, t, w, h, false), closed: true };
  if (kind === "calloutRound") return { points: roundRect(l, t, w, h * 0.8, true), closed: true };
  if (kind === "calloutOval") return { points: oval(l + w / 2, t + h * 0.4, w / 2, h * 0.4, true), closed: true };
  const unit = UNITS[kind] ?? UNITS.rect!;
  return { points: unit.map(([ux, uy]) => [l + ux * w, t + uy * h]), closed: true };
}

/** Points along a quadratic curve from a to b, bent towards c. */
export function curvePoints(a: [number, number], c: [number, number], b: [number, number], steps = 48): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps, u = 1 - t;
    return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
  });
}
