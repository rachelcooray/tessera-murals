"use client";
/**
 * Paper grain. Each paper is a mask of tiny pits: wherever a pit is, a stroke loses some paint,
 * so dry and textured brushes catch on the paper like the real thing. Generated once per size, no images.
 */

export type Paper = "smooth" | "cold" | "canvas" | "sketch";
export const PAPERS: { id: Paper; label: string }[] = [
  { id: "smooth", label: "Smooth" }, { id: "cold", label: "Cold-press" }, { id: "canvas", label: "Canvas" }, { id: "sketch", label: "Sketchbook" },
];

/** How much a brush texture catches on paper: dry brushes a lot, smooth ink a little, pixels not at all. */
export const GRAIN_PICKUP: Record<string, number> = { grain: 1, scatter: 0.9, spray: 0.6, bristle: 0.75, smooth: 0.35, nib: 0.3, pixel: 0 };

const cache = new Map<string, HTMLCanvasElement>();

function rand(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** The pit mask for a paper at a canvas size: alpha 255 is a deep pit, 0 is a peak. */
export function paperPits(kind: Exclude<Paper, "smooth">, size: number): HTMLCanvasElement {
  const key = `${kind}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const d = img.data, r = rand(kind.length * 7919 + size);
  if (kind === "cold") {
    // Soft, irregular dimples: value noise at two scales.
    const cell = 6, n = Math.ceil(size / cell) + 2;
    const grid = Array.from({ length: n * n }, () => r());
    const fine = Array.from({ length: n * n * 4 }, () => r());
    const at = (g: number[], w: number, x: number, y: number) => {
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const v = (i: number, j: number) => g[(j % w) * w + (i % w)];
      const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * fx, b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * fx;
      return a + (b - a) * fy;
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = 0.65 * at(grid, n, x / cell, y / cell) + 0.35 * at(fine, n * 2, x / (cell / 2), y / (cell / 2));
      d[(y * size + x) * 4 + 3] = Math.max(0, Math.min(255, (v - 0.45) * 2.2 * 255));
    }
  } else if (kind === "canvas") {
    // A woven grid: threads across and down, with gaps between.
    const p = 7;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const ax = Math.abs(((x % p) / p) - 0.5) * 2, ay = Math.abs(((y % p) / p) - 0.5) * 2;
      const over = (Math.floor(x / p) + Math.floor(y / p)) % 2 === 0 ? ax : ay;
      d[(y * size + x) * 4 + 3] = Math.max(0, Math.min(255, (over * 0.8 + r() * 0.25 - 0.35) * 255));
    }
  } else {
    // Sketchbook: fine fibres running mostly across the page.
    for (let i = 0; i < size * 6; i++) {
      const x = r() * size, y = r() * size, len = 4 + r() * 18, a = (r() - 0.5) * 0.5;
      for (let t = 0; t < len; t++) {
        const px = Math.round(x + Math.cos(a) * t), py = Math.round(y + Math.sin(a) * t);
        if (px >= 0 && py >= 0 && px < size && py < size) d[(py * size + px) * 4 + 3] = 140 + r() * 115;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  cache.set(key, c);
  return c;
}
