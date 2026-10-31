"use client";
/** Pages that read the address bar. Static hosting means this happens in the browser. */
import { useSearchParams } from "next/navigation";
import { AddFlow } from "./AddFlow";
import { MuralExperience } from "./MuralExperience";
import { TileView } from "./Pages";

export function HomeRoute() {
  const q = useSearchParams();
  return <MuralExperience key={q.get("tile") ?? ""} flyToId={q.get("tile")} />;
}

export function AddRoute() {
  const q = useSearchParams();
  const m = (q.get("spot") ?? "").match(/^(\d+),(\d+)$/);
  return <AddFlow preferSpot={m ? { x: Number(m[1]), y: Number(m[2]) } : null} startGift={q.get("gift") === "1"} />;
}

export function TileRoute() {
  const q = useSearchParams();
  const id = q.get("id") ?? "";
  return <TileView key={id} id={id} gift={q.get("gift") === "1"} />;
}
