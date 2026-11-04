/**
 * A finished sample mosaic so the gallery, reveal and tile pages have something to show before
 * real orders exist. Its tiles are generated artwork, labelled "Sample".
 */
import { hexToRgb, rgbToHsl, type RGB } from "../colour.ts";
import { slotColour } from "./colours.ts";
import type { Mosaic, MosaicTile } from "./types.ts";

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (t: number) => Math.max(0, Math.min(1, t));

/** Two people against a low sun over the sea, the picture used across the designs. */
export function duskScene(u: number, v: number): RGB {
  const ink: RGB = [26, 18, 16];
  for (const [fx, dy] of [[0.43, 0], [0.57, 0.03]]) {
    const hx = u - fx, hy = v - (0.45 + dy);
    if (hx * hx + hy * hy < 0.0017) return ink;
    if (v > 0.5 + dy && v < 0.88 && Math.abs(u - fx) < 0.034 + (v - 0.5) * 0.13) return ink;
  }
  if (v > 0.88) return mix([58, 40, 34], [30, 22, 20], (v - 0.88) / 0.12);
  const d = Math.hypot(u - 0.5, v - 0.52);
  if (v < 0.6) {
    if (d < 0.13) return [242, 214, 168];
    const t = v / 0.6;
    const c = t < 0.55 ? mix([43, 42, 74], [160, 90, 98], t / 0.55) : mix([160, 90, 98], [232, 170, 112], (t - 0.55) / 0.45);
    return mix(c, [242, 214, 168], clamp(1 - d / 0.35) * 0.5);
  }
  const t = (v - 0.6) / 0.28;
  let c = mix([120, 86, 96], [24, 34, 50], clamp(t));
  if (Math.abs(u - 0.5) < 0.09 * (1 - t * 0.5)) c = mix(c, [232, 178, 122], 0.55 * (1 - t));
  return c;
}

/** A slot in the warm sky to the right of the couple, used to show "what one contributor sees". */
export const SAMPLE_HIGHLIGHT = 3372;

const KINDS = ["abstract", "waves", "hills", "bloom", "horizon", "forest"] as const;
const NAMES = ["Nimali P.", "Ravi", "Sam", "Amara K.", null, "Leela", "Tom A.", "Mei L.", "Dinuk", null, "Ishan R.", "Anya"];

export function sampleMosaic(): { mosaic: Mosaic; tiles: MosaicTile[] } {
  const cols = 100, rows = 100;
  const slots = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) slots.push(slotColour(duskScene((x + 0.5) / cols, (y + 0.5) / rows)));
  const revealed = "2026-10-12T18:00:00Z";
  const mosaic: Mosaic = {
    id: "sample-dusk", title: "Shehan and Ama", occasion: "wedding", tierId: "small", cols, rows, priceCents: 4900, poolCents: 1470,
    email: "", createdAt: "2026-09-01T10:00:00Z", revealAt: revealed, visibility: "public", openToArtists: true,
    ownerKey: "sample", inviteToken: "sample", target: "", slots, status: "revealed", revealedAt: revealed, favourites: [SAMPLE_HIGHLIGHT, 3374],
    splitAt: revealed, payment: { intentId: null, mock: true }, sample: true,
  };
  const tiles: MosaicTile[] = slots.map((s, i) => {
    const [h, sat, l] = rgbToHsl(hexToRgb(s.hex));
    const seed = (i * 2654435761) >>> 0;
    return {
      id: `sample-dusk-${i}`, mosaicId: mosaic.id, slot: i, contributorId: `sample-${i % 12}`, source: "sample",
      name: NAMES[i % NAMES.length], medium: "Sample artwork", imageUrl: null,
      art: { kind: KINDS[seed % KINDS.length], seed, h, s: Math.max(20, sat), l: Math.max(14, Math.min(80, l)) },
      averageHex: s.hex, match: 0.9, tint: 0, hash: null, flags: [], status: "approved", rejectionReason: null,
      createdAt: revealed, reviewedAt: revealed,
    };
  });
  return { mosaic, tiles };
}
