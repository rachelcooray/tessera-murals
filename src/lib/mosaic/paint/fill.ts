/**
 * Flood fill for the paint tool's bucket. Works on plain RGBA arrays so it runs in tests.
 */

/**
 * Pixels connected to (x, y) whose colour is within `tolerance` (0 to 255, per channel) of the start pixel.
 * Returns a mask with 1 for every pixel to fill, grown by `grow` pixels so the fill covers soft edges.
 */
export function floodMask(data: ArrayLike<number>, width: number, height: number, x: number, y: number, tolerance: number, grow = 1): Uint8Array {
  const mask = new Uint8Array(width * height);
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return mask;
  const i0 = (y * width + x) * 4;
  const r0 = data[i0], g0 = data[i0 + 1], b0 = data[i0 + 2], a0 = data[i0 + 3];
  const near = (p: number) => {
    const i = p * 4;
    return Math.abs(data[i] - r0) <= tolerance && Math.abs(data[i + 1] - g0) <= tolerance && Math.abs(data[i + 2] - b0) <= tolerance && Math.abs(data[i + 3] - a0) <= tolerance;
  };
  const stack = [y * width + x];
  mask[stack[0]] = 1;
  while (stack.length) {
    const p = stack.pop()!;
    const px = p % width, py = (p - px) / width;
    const next = [px > 0 ? p - 1 : -1, px < width - 1 ? p + 1 : -1, py > 0 ? p - width : -1, py < height - 1 ? p + width : -1];
    for (const n of next) {
      if (n < 0 || mask[n] || !near(n)) continue;
      mask[n] = 1;
      stack.push(n);
    }
  }
  for (let g = 0; g < grow; g++) {
    const src = mask.slice();
    for (let p = 0; p < src.length; p++) {
      if (src[p]) continue;
      const px = p % width;
      if ((px > 0 && src[p - 1]) || (px < width - 1 && src[p + 1]) || (p >= width && src[p - width]) || (p + width < src.length && src[p + width])) mask[p] = 1;
    }
  }
  return mask;
}

/** Number of pixels set in a mask. */
export function maskCount(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  return n;
}
