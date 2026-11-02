/**
 * Turning a target image into slot colours, naming colours, tinting uploads and scoring matches.
 * Pure functions on pixel arrays, so they run in the browser and in tests alike.
 */
import { colourDistance, hexToRgb, rgbToHex, rgbToHsl, type RGB } from "../colour.ts";

export interface SlotColour {
  hex: string;
  /** A lighter and a darker note of the same colour, shown as small swatches. */
  light: string;
  dark: string;
  name: string;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Average colour of RGBA pixels, ignoring transparent ones. */
export function averageColour(data: ArrayLike<number>): RGB {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0];
}

/**
 * Splits an RGBA image (width × height) into cols × rows cells and returns each cell's colour,
 * row by row from the top left.
 */
export function sampleGrid(data: ArrayLike<number>, width: number, height: number, cols: number, rows: number): SlotColour[] {
  const out: SlotColour[] = [];
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const x0 = Math.floor((gx * width) / cols), x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / cols));
      const y0 = Math.floor((gy * height) / rows), y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / rows));
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < 128) continue;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
      const c: RGB = n ? [r / n, g / n, b / n] : [0, 0, 0];
      out.push(slotColour(c));
    }
  }
  return out;
}

export function slotColour(c: RGB): SlotColour {
  return { hex: rgbToHex(c), light: rgbToHex(mix(c, [255, 244, 228], 0.28)), dark: rgbToHex(mix(c, [0, 0, 0], 0.25)), name: colourName(c) };
}

const HUES: [number, string][] = [
  [10, "rose"], [25, "clay"], [38, "apricot"], [50, "honey"], [65, "straw"], [85, "lichen"], [140, "moss"],
  [170, "sea glass"], [200, "harbour"], [225, "slate"], [250, "ink"], [280, "plum"], [320, "orchid"], [345, "ember"], [361, "rose"],
];

/** A short, human name for a colour, such as "late apricot" or "deep harbour". */
export function colourName(c: RGB): string {
  const [h, s, l] = rgbToHsl(c);
  if (l < 9) return "coal";
  if (l > 93) return "chalk";
  if (s < 12) return l < 35 ? "charcoal" : l < 65 ? "ash" : "bone";
  const hue = HUES.find(([max]) => h < max)?.[1] ?? "rose";
  const tone = l < 28 ? "deep" : l < 45 ? "dusk" : l < 62 ? (s > 55 ? "bright" : "soft") : l < 78 ? "late" : "pale";
  return `${tone} ${hue}`;
}

/** 0 (unrelated) to 1 (identical), from the perceptual distance between two colours. */
export function colourMatch(a: RGB, b: RGB): number {
  return Math.max(0, 1 - colourDistance(a, b) / 420);
}

/**
 * Pulls RGBA pixels toward a target colour while keeping their light and shade, so a drawing
 * still reads as itself. strength 0 leaves it untouched; 1 recolours it fully. Changes data in place.
 */
export function tintPixels(data: Uint8ClampedArray | number[], targetHex: string, strength: number): void {
  const t = hexToRgb(targetHex);
  const s = Math.max(0, Math.min(1, strength));
  if (s === 0) return;
  const lt = Math.max(1, luma(t));
  for (let i = 0; i < data.length; i += 4) {
    const l = luma([data[i], data[i + 1], data[i + 2]]);
    const k = l / lt;
    for (let c = 0; c < 3; c++) {
      const recoloured = Math.min(255, t[c] * k);
      data[i + c] = Math.round(data[i + c] + (recoloured - data[i + c]) * s);
    }
  }
}

function luma(c: RGB): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/**
 * For "I already have an image": the open slot whose colour is closest to the upload.
 * Returns -1 when nothing is open.
 */
export function bestOpenSlot(average: RGB, slots: { hex: string }[], isOpen: (index: number) => boolean): number {
  let best = -1, bestD = Infinity;
  slots.forEach((s, i) => {
    if (!isOpen(i)) return;
    const d = colourDistance(average, hexToRgb(s.hex));
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
