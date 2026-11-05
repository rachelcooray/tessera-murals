/**
 * The paint tool's record of how a tile was made: one entry per stroke, never the picture itself.
 * Reviewers see the summary, and a tile with almost no painting is flagged.
 */

export interface StrokeRecord {
  tool: string;
  /** Milliseconds since the epoch. */
  start: number;
  end: number;
  /** "pen", "touch" or "mouse". */
  input: string;
}

export interface PaintStats {
  strokes: number;
  /** Time spent painting: stroke time plus pauses, each pause counted up to `idleCapMs`. */
  activeMs: number;
  inputs: string[];
  tools: string[];
  /** Timelapse frames for the reviewer, from the paint tool. */
  strip?: string | null;
}

export function paintStats(records: StrokeRecord[], idleCapMs = 30_000): PaintStats {
  const sorted = [...records].sort((a, b) => a.start - b.start);
  let activeMs = 0;
  sorted.forEach((r, i) => {
    activeMs += Math.max(0, r.end - r.start);
    if (i > 0) activeMs += Math.min(idleCapMs, Math.max(0, r.start - sorted[i - 1].end));
  });
  return {
    strokes: sorted.length,
    activeMs,
    inputs: [...new Set(sorted.map((r) => r.input))],
    tools: [...new Set(sorted.map((r) => r.tool))],
  };
}

/** A reviewer flag when a painted tile shows very little work, or null. */
export function effortFlag(stats: PaintStats, minStrokes: number, minSeconds: number): string | null {
  if (stats.strokes >= minStrokes && stats.activeMs >= minSeconds * 1000) return null;
  return `Very little painting (${stats.strokes} stroke${stats.strokes === 1 ? "" : "s"}, ${Math.round(stats.activeMs / 1000)} s)`;
}

/** "3 min 12 s", "45 s". */
export function durationLabel(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
}
