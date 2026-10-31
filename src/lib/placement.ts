import { KIND_MOOD, type ArtKind } from "./art";
import { paletteSimilarity } from "./colour";
import type { Tile } from "./types";

export interface Spot { x: number; y: number; score: number; why: string }

/**
 * Scores every free cell by how well the new palette matches its approved neighbours
 * (radius 1 weighted 1, radius 2 weighted 0.35) and returns the best few, spread apart.
 * Phase 4 adds an image embedding to the score.
 */
export function suggestSpots(tiles: Tile[], palette: string[], n = 20, count = 3): Spot[] {
  const grid = new Map<number, Tile>();
  for (const t of tiles) if (t.status === "approved" || t.status === "pending") grid.set(t.y * n + t.x, t);
  const scored: Spot[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (grid.has(y * n + x)) continue;
    let total = 0, weight = 0;
    const kinds = new Map<ArtKind, number>();
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dy) continue;
      const nb = grid.get((y + dy) * n + (x + dx));
      if (!nb || nb.status !== "approved" || x + dx < 0 || x + dx >= n) continue;
      const w = Math.max(Math.abs(dx), Math.abs(dy)) === 1 ? 1 : 0.35;
      const sim = paletteSimilarity(palette, nb.palette);
      total += w * sim; weight += w;
      if (w === 1 && nb.art && sim > 0.55) kinds.set(nb.art.kind, (kinds.get(nb.art.kind) ?? 0) + 1);
    }
    const centre = 1 - Math.hypot(x - n / 2, y - n / 2) / n;
    const score = weight ? total / weight + Math.min(weight, 6) * 0.01 : 0.1 * centre;
    const top = [...kinds.entries()].sort((a, b) => b[1] - a[1])[0];
    const words = ["", "one", "two", "three", "four", "five", "six", "seven", "eight"];
    const why = !weight ? "Be one of the first here" : top ? `Beside ${words[top[1]]} ${KIND_MOOD[top[0]][top[1] === 1 ? 0 : 1]} in your colours` : score > 0.5 ? "Among tiles in similar colours" : "A quieter corner, close in mood";
    scored.push({ x, y, score, why });
  }
  scored.sort((a, b) => b.score - a.score);
  const out: Spot[] = [];
  for (const s of scored) {
    if (out.every((o) => Math.max(Math.abs(o.x - s.x), Math.abs(o.y - s.y)) >= 3)) out.push(s);
    if (out.length === count) break;
  }
  return out;
}
