/**
 * Brush presets and colour helpers for the paint tool. Pure data and maths, so they run in tests too.
 */
import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb, type RGB } from "../../colour.ts";
import type { SlotColour } from "../colours.ts";

/** How a brush lays down paint. */
export type Texture = "smooth" | "grain" | "scatter" | "spray" | "bristle";

export interface BrushPreset {
  id: string;
  name: string;
  set: string;
  /** Diameter in canvas pixels at full pressure. */
  size: number;
  /** 0 to 1. The most a single stroke can cover. */
  opacity: number;
  /** 0 = soft edge, 1 = hard edge. */
  hardness: number;
  /** 0 to 1. How much paint each dab lays down. */
  flow: number;
  /** Distance between dabs as a share of the size. */
  spacing: number;
  texture: Texture;
  pressureSize: boolean;
  pressureOpacity: boolean;
  /** 0 to 1. Steadies the line. */
  smoothing: number;
}

const b = (set: string, id: string, name: string, size: number, opacity: number, hardness: number, flow: number, spacing: number, texture: Texture, pressureSize = true, pressureOpacity = false, smoothing = 0.3): BrushPreset =>
  ({ id, name, set, size, opacity, hardness, flow, spacing, texture, pressureSize, pressureOpacity, smoothing });

export const BRUSHES: BrushPreset[] = [
  b("Sketching", "pencil-hb", "Pencil HB", 6, 0.9, 0.8, 0.6, 0.15, "grain", true, true, 0.2),
  b("Sketching", "pencil-6b", "6B pencil", 12, 0.85, 0.6, 0.55, 0.15, "grain", true, true, 0.2),
  b("Sketching", "graphite", "Graphite", 20, 0.6, 0.4, 0.35, 0.12, "grain", true, true, 0.25),
  b("Inking", "ink-pen", "Ink pen", 10, 1, 1, 1, 0.08, "smooth", true, false, 0.5),
  b("Inking", "fineliner", "Fineliner", 5, 1, 1, 1, 0.08, "smooth", false, false, 0.5),
  b("Inking", "brush-pen", "Brush pen", 22, 1, 0.9, 1, 0.06, "smooth", true, false, 0.55),
  b("Painting", "oil", "Oil", 48, 1, 0.7, 0.9, 0.08, "bristle", true, false, 0.3),
  b("Painting", "gouache", "Gouache", 40, 0.95, 0.85, 0.85, 0.1, "smooth", true, false, 0.3),
  b("Painting", "acrylic", "Acrylic", 36, 1, 0.75, 0.9, 0.08, "bristle", true, false, 0.3),
  b("Watercolour", "wet-wash", "Wet wash", 72, 0.5, 0.1, 0.25, 0.12, "smooth", true, true, 0.4),
  b("Watercolour", "bleed", "Bleed", 96, 0.35, 0, 0.15, 0.12, "smooth", false, true, 0.4),
  b("Watercolour", "dry-brush", "Dry brush", 44, 0.6, 0.5, 0.5, 0.1, "scatter", true, true, 0.3),
  b("Airbrush", "air-soft", "Soft", 90, 0.3, 0, 0.08, 0.1, "smooth", false, true, 0.2),
  b("Airbrush", "air-hard", "Hard", 40, 0.8, 0.7, 0.2, 0.1, "smooth", false, true, 0.2),
  b("Airbrush", "spray", "Spray", 70, 0.8, 0.5, 0.5, 0.2, "spray", false, true, 0.1),
  b("Texture", "crayon", "Crayon", 26, 0.85, 0.7, 0.7, 0.12, "scatter", true, false, 0.2),
  b("Texture", "charcoal", "Charcoal", 34, 0.75, 0.5, 0.55, 0.12, "grain", true, true, 0.2),
  b("Texture", "chalk", "Chalk", 30, 0.7, 0.6, 0.5, 0.14, "scatter", true, false, 0.2),
  b("Marker", "felt-tip", "Felt tip", 18, 0.85, 0.9, 0.9, 0.06, "smooth", false, false, 0.4),
  b("Marker", "highlighter", "Highlighter", 40, 0.4, 0.95, 1, 0.05, "smooth", false, false, 0.5),
  b("Marker", "paint-marker", "Paint marker", 22, 1, 0.95, 1, 0.06, "smooth", false, false, 0.45),
];

export const BRUSH_SETS: string[] = [...new Set(BRUSHES.map((x) => x.set))];

export function brushById(id: string): BrushPreset {
  return BRUSHES.find((x) => x.id === id) ?? BRUSHES[0];
}

const shift = (hex: string, dh: number, ds: number, dl: number): string => {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb(h + dh, Math.max(0, Math.min(100, s + ds)), Math.max(4, Math.min(96, l + dl))));
};

/** Eight colours built from a slot colour: lighter and darker notes, the colour itself, two accents and cream. */
export function paletteFor(slot: SlotColour): { hex: string; label: string }[] {
  return [
    { hex: shift(slot.hex, 0, -6, 24), label: "Lightest" },
    { hex: slot.light, label: "Lighter" },
    { hex: slot.hex, label: "Your slot colour" },
    { hex: slot.dark, label: "Darker" },
    { hex: shift(slot.hex, 0, 4, -26), label: "Darkest" },
    { hex: shift(slot.hex, 35, 10, 12), label: "Warm accent" },
    { hex: shift(slot.hex, 180, -10, -18), label: "Cool accent" },
    { hex: "#efe3cc", label: "Cream" },
  ];
}

/** Hue 0 to 360, saturation and value 0 to 1. */
export function hexToHsv(hex: string): [number, number, number] {
  const [r, g, bl] = hexToRgb(hex).map((v) => v / 255) as RGB;
  const max = Math.max(r, g, bl), min = Math.min(r, g, bl), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - bl) / d) % 6;
    else if (max === g) h = (bl - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

export function hsvToHex(h: number, s: number, v: number): string {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, bl] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex([(r + m) * 255, (g + m) * 255, (bl + m) * 255]);
}

export function isHex(s: string): boolean {
  return /^#?[0-9a-f]{6}$/i.test(s.trim());
}
