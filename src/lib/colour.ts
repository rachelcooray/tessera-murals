export type RGB = [number, number, number];

export function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function rgbToHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

export function hsl(h: number, s: number, l: number): string {
  return rgbToHex(hslToRgb(h, s, l));
}

export function hexToRgb(hex: string): RGB {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

/** Perceptually weighted RGB distance ("redmean"), 0 to roughly 765. */
export function colourDistance(a: RGB, b: RGB): number {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/** Similarity between two hex palettes, 0 (unrelated) to 1 (identical). */
export function paletteSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const wa = [0.6, 0.25, 0.15];
  let total = 0, weight = 0;
  a.forEach((ca, i) => {
    const ra = hexToRgb(ca);
    let best = Infinity;
    for (const cb of b) best = Math.min(best, colourDistance(ra, hexToRgb(cb)));
    const w = wa[i] ?? 0.1;
    total += w * (1 - Math.min(1, best / 420));
    weight += w;
  });
  return total / weight;
}

/** Accent colour readable on the dark wall, derived from a hue. */
export function accentFromRgb(rgb: RGB): string {
  const [h, s] = rgbToHsl(rgb);
  return hsl(h, Math.max(32, Math.min(58, s)), 64);
}

/** Dominant colours from pixel data (RGBA). Returns up to 3 hex colours, most common first. */
export function extractPalette(data: Uint8ClampedArray): string[] {
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
  const out: RGB[] = [];
  for (const e of sorted) {
    const c: RGB = [e.r / e.n, e.g / e.n, e.b / e.n];
    if (out.every((o) => colourDistance(o, c) > 90)) out.push(c);
    if (out.length === 3) break;
  }
  return out.map(rgbToHex);
}
