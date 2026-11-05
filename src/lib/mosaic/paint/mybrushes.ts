"use client";
/** Brushes people save from the brush studio. Kept on this device. */
import type { BrushPreset } from "./brushes.ts";

const KEY = "tessera:my-brushes:v1";
export const MY_SET = "My brushes";

export function myBrushes(): BrushPreset[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    const list = raw ? (JSON.parse(raw) as BrushPreset[]) : [];
    return Array.isArray(list) ? list.filter((b) => b && typeof b.id === "string" && b.id.startsWith("my-")) : [];
  } catch { return []; }
}

export function saveMyBrush(b: Omit<BrushPreset, "id" | "set">): BrushPreset {
  const preset: BrushPreset = { ...b, id: `my-${Date.now().toString(36)}`, set: MY_SET };
  try { window.localStorage.setItem(KEY, JSON.stringify([...myBrushes(), preset].slice(-24))); } catch { /* storage full or blocked: still usable this visit */ }
  return preset;
}

export function deleteMyBrush(id: string) {
  try { window.localStorage.setItem(KEY, JSON.stringify(myBrushes().filter((b) => b.id !== id))); } catch { /* ignore */ }
}
