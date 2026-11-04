/**
 * Compact storage for big mosaics. A 40,000-tile mosaic would overflow the browser's storage as objects,
 * so slot colours are packed into one string and studio-filled slots into a bitmap.
 */

/** Slot numbers as a base64 bitmap: bit i is set when slot i is in the set. */
export function encodeSlots(slots: Iterable<number>, total: number): string {
  const bytes = new Uint8Array(Math.ceil(total / 8));
  for (const i of slots) if (i >= 0 && i < total) bytes[i >> 3] |= 1 << (i & 7);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function decodeSlots(b64: string, total: number): number[] {
  const bin = atob(b64), out: number[] = [];
  for (let i = 0; i < total; i++) if ((bin.charCodeAt(i >> 3) >> (i & 7)) & 1) out.push(i);
  return out;
}

/** "#aabbcc" colours packed end to end without the "#". */
export function packHex(hexes: string[]): string {
  return hexes.map((h) => h.replace("#", "").toLowerCase().padStart(6, "0").slice(0, 6)).join("");
}

export function unpackHex(packed: string): string[] {
  const out: string[] = [];
  for (let i = 0; i + 6 <= packed.length; i += 6) out.push("#" + packed.slice(i, i + 6));
  return out;
}
