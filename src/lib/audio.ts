"use client";
import type { VoiceClip } from "./types";

/** One voice plays at a time. */
let ctx: AudioContext | null = null;
let current: { stop: () => void } | null = null;

export function audioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export interface PlayOpts { volume?: number; maxSeconds?: number; onProgress?: (p: number) => void; onEnd?: () => void }

export function stopAll() {
  current?.stop();
  current = null;
}

export function play(clip: VoiceClip, opts: PlayOpts = {}): { stop: () => void } {
  stopAll();
  const handle = playData(clip.url, opts);
  current = handle;
  return handle;
}

function playData(url: string, o: PlayOpts) {
  const el = new Audio(url);
  el.volume = o.volume ?? 1;
  let raf = 0;
  const tick = () => { if (el.duration) o.onProgress?.(el.currentTime / el.duration); raf = requestAnimationFrame(tick); };
  el.onended = () => { cancelAnimationFrame(raf); o.onProgress?.(1); o.onEnd?.(); };
  void el.play().then(() => (raf = requestAnimationFrame(tick))).catch(() => o.onEnd?.());
  return { stop: () => { el.pause(); cancelAnimationFrame(raf); o.onEnd?.(); } };
}

/** Decode a recording to get its length and a waveform. */
export async function analyse(blob: Blob, count = 48): Promise<{ seconds: number; peaks: number[] }> {
  const buf = await audioContext().decodeAudioData(await blob.arrayBuffer());
  const data = buf.getChannelData(0);
  const step = Math.floor(data.length / count);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    let m = 0;
    for (let j = i * step; j < (i + 1) * step; j += 64) m = Math.max(m, Math.abs(data[j]));
    out.push(m);
  }
  const max = Math.max(...out, 0.01);
  return { seconds: buf.duration, peaks: out.map((v) => Math.max(0.08, v / max)) };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(blob); });
}
