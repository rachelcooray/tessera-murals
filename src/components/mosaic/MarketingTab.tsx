"use client";
/* eslint-disable @next/next/no-img-element -- static export with no image optimiser; thumbnails are pre-sized JPEGs. */
import { useMemo, useState, useSyncExternalStore } from "react";
import plan from "@/config/marketing-plan.json";

/** Everything to post, day by day: download or share the files, copy the caption, tick it off. */
interface PlanFile { name: string; type: "image" | "video"; thumb: string }
interface Entry { id: string; date: string; kind: string; title: string; group: string | null; files: PlanFile[]; caption: string; notes: string[]; needsOrdersOpen: boolean }
const ENTRIES = plan.entries as Entry[];

const base = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/marketing`;
const fileUrl = (e: Entry, f: string) => `${base}/${e.id}/${f}`;
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const monthLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const today = () => new Date().toISOString().slice(0, 10);

/* Which entries are ticked off. Kept in this browser only, as a convenience. */
const KEY = "tessera-marketing-posted";
let posted: Record<string, true> = {};
const listeners = new Set<() => void>();
try { posted = JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { /* private mode or no storage: start empty */ }
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
function setPosted(id: string, on: boolean) {
  posted = { ...posted }; if (on) posted[id] = true; else delete posted[id];
  try { localStorage.setItem(KEY, JSON.stringify(posted)); } catch { /* fine: it just won't be remembered */ }
  listeners.forEach((fn) => fn());
}
const EMPTY: Record<string, true> = {};
const usePosted = () => useSyncExternalStore(subscribe, () => posted, () => EMPTY);

async function fetchFile(e: Entry, f: PlanFile): Promise<File> {
  const res = await fetch(fileUrl(e, f.name));
  if (!res.ok) throw new Error(`Couldn't load ${f.name}`);
  const blob = await res.blob();
  return new File([blob], f.name, { type: f.type === "video" ? "video/mp4" : "image/jpeg" });
}
function saveBlob(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function EntryCard({ e, done, notify }: { e: Entry; done: boolean; notify: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const canShare = typeof navigator !== "undefined" && "canShare" in navigator;

  async function shareAll() {
    setBusy(true);
    try {
      const files = await Promise.all(e.files.map((f) => fetchFile(e, f)));
      if (canShare && navigator.canShare({ files })) {
        await navigator.share({ files, title: e.title });
      } else {
        for (const f of files) { saveBlob(f); await new Promise((r) => window.setTimeout(r, 400)); }
        notify(`${files.length} ${files.length === 1 ? "file" : "files"} downloading`);
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) notify(err instanceof Error ? err.message : "That didn't work");
    } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(e.caption); notify("Caption copied"); } catch { notify("Couldn't copy: select the text and copy it instead"); }
  }

  return (
    <article className={`mk-card${done ? " mk-card--done" : ""}`}>
      <header className="mk-card__head">
        <span className="mk-kind" data-kind={e.kind}>{e.kind}</span>
        <h3>{e.title}</h3>
        {e.needsOrdersOpen && <span className="mk-flag" title="This post says 'Order by'. Only post it once orders are open.">Orders must be open</span>}
        <label className="mk-done"><input type="checkbox" checked={done} onChange={(ev) => setPosted(e.id, ev.target.checked)} /> Posted</label>
      </header>
      {e.files.length > 0 && (
        <div className="mk-files">
          {e.files.map((f, i) => (
            <a key={f.name} href={fileUrl(e, f.name)} download={f.name} className="mk-thumb" title={`Download ${f.name}`}>
              <img src={fileUrl(e, f.thumb)} alt={`${e.title}, file ${i + 1}`} loading="lazy" width={120} height={160} />
              {f.type === "video" && <span className="mk-play" aria-hidden>▶</span>}
              <span className="mk-num">{i + 1}</span>
            </a>
          ))}
        </div>
      )}
      {e.notes.length > 0 && <ul className="mk-notes small muted">{e.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      {e.caption && <details className="mk-caption"><summary>Caption</summary><pre>{e.caption}</pre></details>}
      <div className="row">
        {e.files.length > 0 && <button className="btn btn--primary" disabled={busy} onClick={() => void shareAll()}>{busy ? "Preparing…" : canShare ? `Save or share ${e.files.length > 1 ? `all ${e.files.length}` : ""}` : `Download ${e.files.length > 1 ? `all ${e.files.length}` : ""}`}</button>}
        {e.caption && <button className="btn" onClick={() => void copy()}>Copy caption</button>}
      </div>
    </article>
  );
}

export function MarketingTab({ notify }: { notify: (m: string) => void }) {
  const done = usePosted();
  const [view, setView] = useState<"todo" | "all">("todo");
  const now = today();
  const shown = useMemo(() => ENTRIES.filter((e) => view === "all" || !done[e.id]), [view, done]);
  const nextUp = ENTRIES.find((e) => !done[e.id] && e.date >= now) ?? ENTRIES.find((e) => !done[e.id]);

  // Group by month, then by day, then by row.
  const months = useMemo(() => {
    const m = new Map<string, Map<string, Entry[]>>();
    for (const e of shown) {
      const mk = monthLabel(e.date);
      if (!m.has(mk)) m.set(mk, new Map());
      const days = m.get(mk)!;
      days.set(e.date, [...(days.get(e.date) ?? []), e]);
    }
    return [...m.entries()];
  }, [shown]);
  const total = ENTRIES.length, nDone = ENTRIES.filter((e) => done[e.id]).length;

  return (
    <>
      <div className="split"><h1 style={{ fontSize: 34 }}>Marketing</h1>
        <div className="row" role="group" aria-label="Show">
          <button className="btn" aria-pressed={view === "todo"} onClick={() => setView("todo")}>To post</button>
          <button className="btn" aria-pressed={view === "all"} onClick={() => setView("all")}>Everything</button>
        </div>
      </div>
      <p className="muted">Six months of posts, Reels and Stories, in order. Tap <b>Save or share</b> on your phone to send the files straight to Instagram or Photos, copy the caption, post, then tick <b>Posted</b>. {nDone} of {total} posted{nextUp ? <>. Next up: <b>{dayLabel(nextUp.date)}</b>, {nextUp.title}.</> : "."}</p>
      <p className="small faint">Best time to post: around 7 pm UK. Ticks are saved in this browser only. Every file here is public on the website, like the posts themselves will be.</p>
      {months.map(([month, days]) => (
        <section key={month} className="mk-month">
          <h2>{month}</h2>
          {[...days.entries()].map(([date, list]) => (
            <div key={date} className={`mk-day${date < now ? " mk-day--past" : ""}`}>
              <div className="mk-date"><b>{dayLabel(date)}</b>{date === now && <span className="tag">Today</span>}</div>
              <div className="mk-list">
                {list.map((e, i) => (
                  <div key={e.id}>
                    {e.group && list.findIndex((x) => x.group === e.group) === i && <p className="mk-group">{e.group}</p>}
                    <EntryCard e={e} done={!!done[e.id]} notify={notify} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
      <details className="mk-caption"><summary>Photo credits</summary><pre>{Object.values(plan.photoCredits).join("\n")}</pre></details>
    </>
  );
}
