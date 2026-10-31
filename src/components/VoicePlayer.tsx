"use client";
import { useEffect, useRef, useState } from "react";
import { play } from "@/lib/audio";
import type { VoiceClip } from "@/lib/types";
import { Icon } from "./ui";

export function VoicePlayer({ clip, transcript, gift = false, autoPlay = false, label = "voice message" }: { clip: VoiceClip; transcript?: string | null; gift?: boolean; autoPlay?: boolean; label?: string }) {
  const [p, setP] = useState(0);
  const [on, setOn] = useState(false);
  const [showWords, setShowWords] = useState(false);
  const h = useRef<{ stop: () => void } | null>(null);
  const bars = clip.peaks;
  const secs = Math.round(clip.seconds);

  const toggle = () => {
    if (on) { h.current?.stop(); return; }
    setOn(true);
    h.current = play(clip, { volume: 0.9, onProgress: setP, onEnd: () => { setOn(false); h.current = null; } });
  };
  useEffect(() => {
    if (!autoPlay) return;
    const id = setTimeout(() => { setOn(true); h.current = play(clip, { volume: 0.9, onProgress: setP, onEnd: () => { setOn(false); h.current = null; } }); }, 700);
    return () => clearTimeout(id);
  }, [autoPlay, clip]);
  useEffect(() => () => h.current?.stop(), []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="voice">
        <button className={`voice__play${gift ? " voice__play--gift" : ""}`} onClick={toggle} aria-label={`${on ? "Pause" : "Play"} ${label}, ${secs} seconds`}>
          <Icon name={on ? "pause" : "play"} />
        </button>
        <div className="voice__bars" aria-hidden="true">
          {bars.map((b, i) => <i key={i} className={i / bars.length < p ? "on" : ""} style={{ height: `${Math.round(6 + b * 30)}px` }} />)}
        </div>
        <span className="voice__time">0:{String(secs).padStart(2, "0")}</span>
      </div>
      {transcript && (
        <div>
          <button className="btn btn--quiet" style={{ minHeight: 36, padding: 0 }} onClick={() => setShowWords(!showWords)} aria-expanded={showWords}>{showWords ? "Hide words" : "Show words"}</button>
          {showWords && <p className="caption">“{transcript}”</p>}
        </div>
      )}
    </div>
  );
}
