/**
 * Adjustments, filters and retouch dabs for the paint tool. Each works in place on RGBA pixels,
 * so they run in the browser and in tests alike. Fully transparent pixels are left alone.
 */
import type { RGB } from "../../colour.ts";

export interface Px { data: Uint8ClampedArray; width: number; height: number }

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function eachPixel(p: Px, fn: (r: number, g: number, b: number, i: number) => [number, number, number]) {
  const d = p.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const [r, g, b] = fn(d[i], d[i + 1], d[i + 2], i);
    d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b);
  }
}

/* ---------- adjustments ---------- */

/** Hue in degrees, saturation and brightness from -100 to 100. */
export function adjustHsb(p: Px, hue: number, saturation: number, brightness: number) {
  eachPixel(p, (r, g, b) => {
    if (hue || saturation) {
      const [h, s, l] = rgbToHsl(r, g, b);
      [r, g, b] = hslToRgb(h + hue, Math.max(0, Math.min(1, s * (1 + saturation / 100))), l);
    }
    const k = brightness * 2.55;
    return [r + k, g + k, b + k];
  });
}

/** Both from -100 to 100. */
export function brightnessContrast(p: Px, brightness: number, contrast: number) {
  const c = (contrast + 100) / 100, f = c * c, k = brightness * 2.55;
  eachPixel(p, (r, g, b) => [(r - 128) * f + 128 + k, (g - 128) * f + 128 + k, (b - 128) * f + 128 + k]);
}

/** Shifts each channel, -100 to 100. */
export function colourBalance(p: Px, red: number, green: number, blue: number) {
  eachPixel(p, (r, g, b) => [r + red * 1.28, g + green * 1.28, b + blue * 1.28]);
}

/** Input black and white points (0 to 255) and a midtone gamma (0.1 to 3). */
export function levels(p: Px, black: number, white: number, gamma: number) {
  const span = Math.max(1, white - black), table = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) table[v] = 255 * Math.pow(Math.max(0, Math.min(1, (v - black) / span)), 1 / gamma);
  eachPixel(p, (r, g, b) => [table[r], table[g], table[b]]);
}

export function invert(p: Px) { eachPixel(p, (r, g, b) => [255 - r, 255 - g, 255 - b]); }

export function desaturate(p: Px) { eachPixel(p, (r, g, b) => { const l = lum(r, g, b); return [l, l, l]; }); }

/** Steps per channel, 2 to 32. */
export function posterize(p: Px, steps: number) {
  const n = Math.max(2, Math.round(steps)) - 1;
  eachPixel(p, (r, g, b) => [Math.round((r / 255) * n) * (255 / n), Math.round((g / 255) * n) * (255 / n), Math.round((b / 255) * n) * (255 / n)]);
}

export function threshold(p: Px, t: number) { eachPixel(p, (r, g, b) => { const v = lum(r, g, b) >= t ? 255 : 0; return [v, v, v]; }); }

/** Dark parts take the first colour, light parts the second. */
export function gradientMap(p: Px, dark: RGB, light: RGB) {
  eachPixel(p, (r, g, b) => { const t = lum(r, g, b) / 255; return [dark[0] + (light[0] - dark[0]) * t, dark[1] + (light[1] - dark[1]) * t, dark[2] + (light[2] - dark[2]) * t]; });
}

/* ---------- filters ---------- */

/** Three box-blur passes (close to a Gaussian), weighted by alpha so transparent edges don't darken. */
export function boxBlur(p: Px, r: number) {
  r = Math.round(r);
  if (r < 1) return;
  const { data: d, width: w, height: h } = p, n = w * h;
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) { const a = d[i * 4 + 3] / 255; ch[0][i] = d[i * 4] * a; ch[1][i] = d[i * 4 + 1] * a; ch[2][i] = d[i * 4 + 2] * a; ch[3][i] = d[i * 4 + 3]; }
  const tmp = new Float32Array(n);
  const pass = (src: Float32Array) => {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) { tmp[y * w + x] = sum / (2 * r + 1); sum += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]; }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) { src[y * w + x] = sum / (2 * r + 1); sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
    }
  };
  for (let k = 0; k < 3; k++) for (const c of ch) pass(c);
  for (let i = 0; i < n; i++) {
    const a = ch[3][i], inv = a > 0 ? 255 / a : 0;
    d[i * 4 + 3] = a; d[i * 4] = ch[0][i] * inv; d[i * 4 + 1] = ch[1][i] * inv; d[i * 4 + 2] = ch[2][i] * inv;
  }
}

/** Streaks along an angle (degrees) for `distance` pixels. */
export function motionBlur(p: Px, angle: number, distance: number) {
  const { data: d, width: w, height: h } = p, src = d.slice();
  const steps = Math.max(1, Math.round(distance)), dx = Math.cos((angle * Math.PI) / 180), dy = Math.sin((angle * Math.PI) / 180);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let s = -steps / 2; s <= steps / 2; s++) {
      const sx = Math.round(x + dx * s), sy = Math.round(y + dy * s);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const i = (sy * w + sx) * 4, al = src[i + 3];
      r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al; a += al; n++;
    }
    const o = (y * w + x) * 4;
    if (a > 0) { d[o] = r / a; d[o + 1] = g / a; d[o + 2] = b / a; }
    d[o + 3] = n ? a / n : 0;
  }
}

/** Unsharp mask with a small radius. Amount 0 to 3. */
export function sharpen(p: Px, amount: number) {
  const blurred: Px = { data: p.data.slice(), width: p.width, height: p.height };
  boxBlur(blurred, 1);
  const b = blurred.data;
  eachPixel(p, (r, g, bl, i) => [r + (r - b[i]) * amount, g + (g - b[i + 1]) * amount, bl + (bl - b[i + 2]) * amount]);
}

export function noise(p: Px, amount: number, rnd: () => number = Math.random) {
  eachPixel(p, (r, g, b) => { const n = (rnd() - 0.5) * amount * 2; return [r + n, g + n, b + n]; });
}

/** Big square cells of their average colour. */
export function pixelate(p: Px, cell: number) {
  const { data: d, width: w, height: h } = p, c = Math.max(2, Math.round(cell));
  for (let y0 = 0; y0 < h; y0 += c) for (let x0 = 0; x0 < w; x0 += c) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let y = y0; y < Math.min(h, y0 + c); y++) for (let x = x0; x < Math.min(w, x0 + c); x++) { const i = (y * w + x) * 4, al = d[i + 3]; r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al; n++; }
    const R = a ? r / a : 0, G = a ? g / a : 0, B = a ? b / a : 0, A = n ? a / n : 0;
    for (let y = y0; y < Math.min(h, y0 + c); y++) for (let x = x0; x < Math.min(w, x0 + c); x++) { const i = (y * w + x) * 4; d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = A; }
  }
}

/** Printed-dot look: each cell becomes one dot of its colour, bigger where it's darker. */
export function halftone(p: Px, cell: number) {
  const { data: d, width: w, height: h } = p, c = Math.max(3, Math.round(cell));
  for (let y0 = 0; y0 < h; y0 += c) for (let x0 = 0; x0 < w; x0 += c) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let y = y0; y < Math.min(h, y0 + c); y++) for (let x = x0; x < Math.min(w, x0 + c); x++) { const i = (y * w + x) * 4, al = d[i + 3]; r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al; }
    if (!a) continue;
    const R = r / a, G = g / a, B = b / a, rad = (c / 2) * Math.SQRT2 * Math.sqrt(1 - lum(R, G, B) / 255), cx = x0 + c / 2, cy = y0 + c / 2;
    for (let y = y0; y < Math.min(h, y0 + c); y++) for (let x = x0; x < Math.min(w, x0 + c); x++) {
      const i = (y * w + x) * 4, inside = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= rad;
      d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = inside ? d[i + 3] : 0;
    }
  }
}

/** Light parts glow: bright pixels are blurred and screened back on. */
export function bloom(p: Px, thresholdV: number, radius: number, strength: number) {
  const bright: Px = { data: new Uint8ClampedArray(p.data.length), width: p.width, height: p.height };
  const d = p.data, bd = bright.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] && lum(d[i], d[i + 1], d[i + 2]) >= thresholdV) { bd[i] = d[i]; bd[i + 1] = d[i + 1]; bd[i + 2] = d[i + 2]; bd[i + 3] = d[i + 3]; }
  boxBlur(bright, radius);
  for (let i = 0; i < d.length; i += 4) {
    const k = (bd[i + 3] / 255) * strength;
    for (let c = 0; c < 3; c++) d[i + c] = clamp(255 - ((255 - d[i + c]) * (255 - bd[i + c] * k)) / 255);
    d[i + 3] = Math.max(d[i + 3], bd[i + 3] * Math.min(1, strength));
  }
}

/** Splits red and blue sideways by `shift` pixels. */
export function chromatic(p: Px, shift: number) {
  const { data: d, width: w, height: h } = p, src = d.slice(), s = Math.round(shift);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, ir = (y * w + Math.min(w - 1, Math.max(0, x - s))) * 4, ib = (y * w + Math.min(w - 1, Math.max(0, x + s))) * 4;
    d[i] = src[ir]; d[i + 2] = src[ib + 2];
  }
}

/** Shifts random bands of rows sideways. */
export function glitch(p: Px, amount: number, rnd: () => number = Math.random) {
  const { data: d, width: w, height: h } = p, src = d.slice();
  let y = 0;
  while (y < h) {
    const band = 2 + Math.floor(rnd() * 24), off = rnd() < 0.35 ? Math.round((rnd() - 0.5) * amount * 2) : 0;
    for (let yy = y; yy < Math.min(h, y + band); yy++) for (let x = 0; x < w; x++) {
      const sx = (((x - off) % w) + w) % w, i = (yy * w + x) * 4, j = (yy * w + sx) * 4;
      d[i] = src[j]; d[i + 1] = src[j + 1]; d[i + 2] = src[j + 2]; d[i + 3] = src[j + 3];
    }
    y += band;
  }
}

/** Darkens towards the corners. Strength 0 to 1. */
export function vignette(p: Px, strength: number) {
  const { width: w, height: h } = p, cx = w / 2, cy = h / 2, max = Math.hypot(cx, cy);
  eachPixel(p, (r, g, b, i) => {
    const x = (i / 4) % w, y = Math.floor(i / 4 / w), k = 1 - strength * Math.pow(Math.hypot(x - cx, y - cy) / max, 2);
    return [r * k, g * k, b * k];
  });
}

export function emboss(p: Px) {
  const { data: d, width: w, height: h } = p, src = d.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (!d[i + 3]) continue;
    const j = (Math.max(0, y - 1) * w + Math.max(0, x - 1)) * 4, k = (Math.min(h - 1, y + 1) * w + Math.min(w - 1, x + 1)) * 4;
    const v = 128 + (lum(src[k], src[k + 1], src[k + 2]) - lum(src[j], src[j + 1], src[j + 2])) * 2;
    d[i] = d[i + 1] = d[i + 2] = clamp(v);
  }
}

/* ---------- retouch dabs ---------- */

export type ToneMode = "blur" | "sharpen" | "dodge" | "burn" | "saturate" | "desaturate";

/**
 * One retouch dab on a square patch: the effect is strongest in the middle of the inscribed circle
 * and fades to nothing at its edge. Strength 0 to 1, hardness 0 to 1.
 */
export function toneDab(p: Px, mode: ToneMode, strength: number, hardness: number) {
  const { data: d, width: w, height: h } = p;
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2;
  let blurred: Uint8ClampedArray | null = null;
  if (mode === "blur" || mode === "sharpen") { const c: Px = { data: d.slice(), width: w, height: h }; boxBlur(c, Math.max(1, Math.round(r / 6))); blurred = c.data; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (!d[i + 3]) continue;
    const t = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
    if (t >= 1) continue;
    const k = strength * (t <= hardness ? 1 : 1 - (t - hardness) / Math.max(0.001, 1 - hardness));
    let R = d[i], G = d[i + 1], B = d[i + 2];
    if (mode === "blur") { R += (blurred![i] - R) * k; G += (blurred![i + 1] - G) * k; B += (blurred![i + 2] - B) * k; }
    else if (mode === "sharpen") { R += (R - blurred![i]) * k * 1.5; G += (G - blurred![i + 1]) * k * 1.5; B += (B - blurred![i + 2]) * k * 1.5; }
    else if (mode === "dodge") { R += (255 - R) * k * 0.25; G += (255 - G) * k * 0.25; B += (255 - B) * k * 0.25; }
    else if (mode === "burn") { R -= R * k * 0.25; G -= G * k * 0.25; B -= B * k * 0.25; }
    else {
      const [hh, s, l] = rgbToHsl(R, G, B);
      [R, G, B] = hslToRgb(hh, Math.max(0, Math.min(1, s + (mode === "saturate" ? 1 : -1) * k * 0.15)), l);
    }
    d[i] = clamp(R); d[i + 1] = clamp(G); d[i + 2] = clamp(B);
  }
}

/**
 * Curves through five points: black, shadows, midtones, highlights and white. Each of the middle
 * three moves its point up or down by up to 64 levels. A smooth (monotone) curve joins them.
 */
export function curvesLut(shadows: number, midtones: number, highlights: number): Uint8ClampedArray {
  const xs = [0, 64, 128, 192, 255];
  const ys = [0, 64 + shadows, 128 + midtones, 192 + highlights, 255].map((y) => Math.max(0, Math.min(255, y)));
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1]);
  const n = xs.length, d = new Array(n - 1).fill(0).map((_, i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = new Array(n).fill(0);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  const lut = new Uint8ClampedArray(256);
  for (let x = 0; x < 256; x++) {
    let k = 0;
    while (k < n - 2 && x > xs[k + 1]) k++;
    const h = xs[k + 1] - xs[k], t = (x - xs[k]) / h;
    const h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2;
    lut[x] = h00 * ys[k] + h10 * h * m[k] + h01 * ys[k + 1] + h11 * h * m[k + 1];
  }
  return lut;
}

export function curves(p: Px, shadows: number, midtones: number, highlights: number) {
  const lut = curvesLut(shadows, midtones, highlights);
  eachPixel(p, (r, g, b) => [lut[r], lut[g], lut[b]]);
}

/**
 * Recolour: every pixel where mask is set takes the new colour, keeping how much lighter or darker
 * it was than the colour that was tapped, so shading survives.
 */
export function recolour(p: Px, mask: Uint8Array, from: RGB, to: RGB) {
  const d = p.data;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const o = i * 4;
    for (let c = 0; c < 3; c++) d[o + c] = Math.max(0, Math.min(255, Math.round(to[c] + (d[o + c] - from[c]))));
  }
}
