"use client";
/** Browser-only image helpers: read an upload, crop it square, downscale, tint and export. */
import { averageColour, colourMatch, tintPixels } from "./colours.ts";
import { dHash, greyThumb, hasContentCredentials, scanForAiMarkers } from "./checks.ts";
import type { RGB } from "../colour.ts";
import { hexToRgb, rgbToHex } from "../colour.ts";

export const ACCEPTED = "image/jpeg,image/png,image/webp";
export const MAX_BYTES = 15 * 1024 * 1024;

export async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  // Stored tiles come from another origin: ask for CORS so drawing them doesn't block the reveal video.
  if (/^https?:/.test(src)) img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  return img;
}

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

/** Draws the centre square of an image at size × size and returns the canvas. */
export function squareCanvas(img: HTMLImageElement | HTMLCanvasElement, size: number): HTMLCanvasElement {
  const w = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const h = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  const side = Math.min(w, h);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
  return c;
}

export function pixels(c: HTMLCanvasElement): ImageData {
  return c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
}

export interface PreparedUpload {
  /** Untouched square, for previews and re-tinting. */
  base: HTMLCanvasElement;
  average: RGB;
  hash: string;
  flags: string[];
  contentCredentials: boolean;
}

/** Reads a contributor's file once: square crop, average colour, perceptual hash and AI metadata scan. */
export async function prepareUpload(file: File, size: number): Promise<PreparedUpload> {
  const bytes = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  const img = await loadImage(await readAsDataUrl(file));
  const base = squareCanvas(img, size);
  const data = pixels(base);
  return {
    base,
    average: averageColour(data.data),
    hash: dHash(greyThumb(data.data, data.width, data.height)),
    flags: scanForAiMarkers(bytes),
    contentCredentials: hasContentCredentials(bytes),
  };
}

/** The upload tinted toward a slot colour: data URL, its new average colour and the colour match. */
export function tinted(base: HTMLCanvasElement, slotHex: string, strength: number, quality: number): { url: string; averageHex: string; match: number } {
  const c = document.createElement("canvas");
  c.width = base.width; c.height = base.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(base, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  tintPixels(data.data, slotHex, strength);
  ctx.putImageData(data, 0, 0);
  const avg = averageColour(data.data);
  return { url: c.toDataURL("image/jpeg", quality), averageHex: rgbToHex(avg), match: colourMatch(avg, hexToRgb(slotHex)) };
}
