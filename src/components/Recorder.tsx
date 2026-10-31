"use client";
import { useEffect, useRef, useState } from "react";
import { site } from "@/config/site";
import { analyse, blobToDataUrl } from "@/lib/audio";
import type { VoiceClip } from "@/lib/types";
import { VoicePlayer } from "./VoicePlayer";
import { Icon } from "./ui";

const { minSeconds: MIN, maxSeconds: MAX } = site.voice;

export function Recorder({ value, onChange, label = "voice message" }: { value: VoiceClip | null; onChange: (c: VoiceClip | null) => void; label?: string }) {
  const [phase, setPhase] = useState<"idle" | "rec">("idle");
  const [secs, setSecs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; raf: number; t0: number; ctx: AudioContext } | null>(null);

  const finish = async (blob: Blob) => {
    try {
      const a = await analyse(blob);
      if (a.seconds < MIN - 0.3) { setError(`A little longer, please: at least ${MIN} seconds.`); return; }
      if (a.seconds > MAX + 0.5) { setError(`Please keep it under ${MAX} seconds.`); return; }
      onChange({ kind: "data", seconds: a.seconds, url: await blobToDataUrl(blob), peaks: a.peaks });
    } catch {
      setError("That file could not be read as audio.");
    }
  };

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()); void finish(new Blob(chunks, { type: mr.mimeType })); };
      const ctx = new AudioContext();
      const an = ctx.createAnalyser(); an.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const t0 = performance.now();
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
        setLevels((l) => [...l.slice(-35), Math.max(0.08, Math.min(1, peak * 2.2))]);
        const s = (performance.now() - t0) / 1000;
        setSecs(s);
        if (s >= MAX) { stop(); return; }
        if (rec.current) rec.current.raf = requestAnimationFrame(tick);
      };
      rec.current = { mr, stream, raf: requestAnimationFrame(tick), t0, ctx };
      mr.start();
      setPhase("rec");
    } catch {
      setError("We couldn’t use your microphone. You can upload a recording instead.");
    }
  };
  const stop = () => {
    const r = rec.current;
    if (!r) return;
    cancelAnimationFrame(r.raf); void r.ctx.close(); rec.current = null;
    if (r.mr.state !== "inactive") r.mr.stop();
    setPhase("idle"); setLevels([]);
  };
  useEffect(() => () => { const r = rec.current; if (r) { cancelAnimationFrame(r.raf); r.stream.getTracks().forEach((t) => t.stop()); } }, []);

  if (value && phase === "idle") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="box" style={{ background: "var(--card)" }}><VoicePlayer clip={value} label={label} /></div>
        <button className="btn" onClick={() => onChange(null)}>Record again</button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "18px 0" }}>
      {phase === "rec" ? (
        <>
          <div className="voice__bars" style={{ height: 48, flex: "none", width: 220, justifyContent: "center" }} aria-hidden="true">
            {levels.map((v, i) => <i key={i} className="on" style={{ height: `${6 + v * 40}px` }} />)}
          </div>
          <div className="serif" style={{ fontSize: 36 }} aria-live="off">0:{String(Math.floor(secs)).padStart(2, "0")}</div>
          <button className="rec rec--on" onClick={stop} aria-label="Stop recording"><Icon name="stop" size={28} /></button>
          <span className="small muted">{secs < MIN ? `Keep going: at least ${MIN} seconds` : `Stops by itself at ${MAX} seconds`}</span>
        </>
      ) : (
        <>
          <button className="rec" onClick={start} aria-label={`Start recording your ${label}`}><Icon name="mic" size={34} /></button>
          <span className="eyebrow" style={{ color: "var(--muted)" }}>Tap to record</span>
          <label className="btn" style={{ minHeight: 44 }}>
            Or upload a recording
            <input type="file" accept="audio/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setError(null); void finish(f); } }} />
          </label>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
