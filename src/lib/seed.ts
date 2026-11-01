/**
 * Phase 1 sample data. Deterministic, so server and browser agree.
 * Replaced by Supabase in Phase 2.
 */
import { site } from "@/config/site";
import { artPalette, type ArtKind, type ArtSpec } from "./art";
import { mulberry32, pick, rnd } from "./rng";
import type { Report, Season, Tile } from "./types";

export const N = 20;

export const SEASONS: Season[] = [
  { id: "1", number: 0, name: "First Light", theme: "Something you saw for the first time", gridSize: N, status: "open", createdAt: "2026-09-01T09:00:00Z", frozenAt: null, closesAt: site.seasonClosesAt },
  { id: "2", number: 1, name: "Underwater Cities", theme: "Places beneath the surface", gridSize: N, status: "upcoming", createdAt: "2026-10-30T09:00:00Z", frozenAt: null, closesAt: null },
];

const NAMES = [
  "Priya Nair", "Tomás Rivera", "Aiko Tanaka", "Marco Dell’Orto", "Sam Okafor", "Lena Fischer", "Noor Haddad", "Jonah Pike",
  "Amara Eze", "Wren Holloway", "Mateo Silva", "Ingrid Solberg", "Kofi Mensah", "Yuki Mori", "Hana Kim", "Elif Demir",
  "Ravi Menon", "Clara Dubois", "Oskar Lind", "Fatima Zahra", "Leo Brandt", "Maya Cohen", "Ananya Rao", "Pablo Ortega",
  "Saoirse Byrne", "Dmitri Volkov", "Zanele Dube", "Iris Laurent", "Theo Nakamura", "Lucía Romero", "Ezra Bloom", "Mei Lin",
  "Kwame Asante", "Freya Olsen", "Arjun Kapoor", "Bea Moretti", "Nikolai Petrov", "Ines Costa", "Malik Johnson", "Sofia Rossi",
  "Hiro Sato", "Grace Adeyemi", "Felix Wagner", "Nadia Rahman", "Owen Price", "Tara Singh", "Luca Bianchi", "Esther Mwangi",
];

const PHRASES = [
  "for mum, who loved the sea", "the first morning in the new flat", "we were here, briefly, and it was good", "grandad’s garden in June",
  "the lake, every summer, forever", "my daughter’s first drawing of the sun", "for everyone who stayed up talking", "after the rain, before the bus",
  "a small light for a long winter", "the view from ward 7", "still learning to paint", "this is what calm looks like to me",
  "for the dog who waited by the door", "Lagos at 5am", "the colour of her coat", "made on the train home",
  "you said it looked like hope", "the field behind school", "thank you, Ms Okoro", "the night we drove to the coast",
  "first light over the estuary", "nothing important, just pretty", "for Leila, who is brave", "the sky the day I got the letter",
  "I wanted to leave something", "home is a feeling", "the kitchen window at dusk", "to my future self",
  "for the friends I lost touch with", "it took three tries", "the hill we climbed for her birthday", "a garden that only exists here",
  "loud colours for a quiet person", "the bridge at midnight", "she would have liked this one", "the year everything changed",
];


const PROMPTS: Record<ArtKind, string[]> = {
  horizon: ["a low sun over a flat sea, thick brushstrokes", "sunrise over an estuary, gouache", "the last light over the water"],
  waves: ["layered waves in soft blues, paper cut style", "a calm sea with white foam lines", "ocean swell painted in oils"],
  hills: ["rolling hills at dawn, watercolour", "green hills folding into mist", "a quiet valley in early morning"],
  forest: ["a pine forest in deep green, linocut", "rows of trees at the edge of a field", "a small wood in late summer"],
  night: ["a city skyline under a crescent moon", "stars over dark hills, gouache", "a quiet street at midnight"],
  bloom: ["a single bright flower on a soft background", "wild flowers, bold flat shapes", "a garden bloom, Matisse-like"],
  abstract: ["bold overlapping circles in warm colours", "abstract shapes like a cut-paper collage", "calm abstract blocks of colour"],
};

function kindFor(h: number, r: () => number): ArtKind {
  if (h >= 190 && h < 250) return r() < 0.55 ? "waves" : "horizon";
  if (h >= 250 && h < 300) return r() < 0.6 ? "night" : "abstract";
  if (h >= 300 || h < 20) return r() < 0.55 ? "bloom" : "abstract";
  if (h >= 20 && h < 60) return r() < 0.6 ? "horizon" : "hills";
  if (h >= 60 && h < 160) return r() < 0.5 ? "hills" : "forest";
  return r() < 0.5 ? "waves" : "hills";
}

function iso(base: string, plusDays: number): string {
  return new Date(new Date(base).getTime() + plusDays * 86400000).toISOString();
}

function baseTile(seasonId: string, x: number, y: number): Tile {
  return {
    id: `${seasonId}-${y * N + x}`, seasonId, x, y, art: null, imageUrl: null, phrase: null, voice: null, transcript: null,
    displayName: null, origin: "hand", prompt: null, palette: [], status: "approved", rejectionReason: null, gift: null,
    createdAt: "2026-09-01T09:00:00Z", approvedAt: "2026-09-01T10:00:00Z", flags: [], contentCredentials: null, payment: { kind: "hold", amount: 1 }, email: null,
  };
}

/** A complete sample tile for a cell. Also used by the admin "fill the season" demo. */
export function sampleTile(seasonId: string, x: number, y: number, salt = 0, hueOffset = 0): Tile {
  const i = y * N + x;
  const r = mulberry32(i * 7919 + Number(seasonId) * 104729 + salt * 31337 + 17);
  const h = (((x * 11 + y * 6) + Math.sin(x / 2.7) * 38 + Math.cos(y / 2.2) * 34 + (rnd(i) * 24 - 12)) * (seasonId === "0" ? 0.35 : 1) + hueOffset + 720) % 360;
  const s = Math.round(38 + rnd(i * 2) * 28);
  const l = Math.round(30 + rnd(i * 3) * 22);
  const kind = kindFor(h, r);
  const art: ArtSpec = { kind, seed: Math.floor(r() * 1e9), h, s, l };
  const t = baseTile(seasonId, x, y);
  const day = Math.floor(r() * 56);
  const base = SEASONS.find((ss) => ss.id === seasonId)?.createdAt ?? "2026-09-01T09:00:00Z";
  const origin = r() < 0.55 ? "hand" : "ai";
  return {
    ...t,
    art,
    palette: artPalette(art),
    origin,
    prompt: origin === "ai" ? pick(r, PROMPTS[kind]) : null,
    displayName: r() < 0.38 ? null : pick(r, NAMES),
    phrase: r() < 0.82 ? pick(r, PHRASES) : null,
    createdAt: iso(base, day),
    approvedAt: iso(base, day + 1),
  };
}

function buildSeason1(): Tile[] {
  const out: Tile[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (rnd(i + 7) >= 0.63 && i !== 187 && i !== 302) continue;
    out.push(sampleTile("1", x, y));
  }
  const priya = out.find((t) => t.id === "1-187")!;
  Object.assign(priya, {
    art: { kind: "horizon", seed: 4242, h: 212, s: 48, l: 40 } satisfies ArtSpec,
    displayName: "Priya Nair", origin: "hand", prompt: null, phrase: "for mum, who loved the sea",
    details: { title: "Low tide", medium: "Gouache on paper", note: "Sample tile. Painted from memory of the beach we went to every August.", credit: "@sample.artist" },
  });
  priya.palette = artPalette(priya.art!);
  const gift = out.find((t) => t.id === "1-302")!;
  Object.assign(gift, {
    art: { kind: "horizon", seed: 6060, h: 22, s: 58, l: 46 } satisfies ArtSpec,
    displayName: "Sam Okafor", origin: "ai", prompt: "a small wooden boat on a warm orange lake at dusk", phrase: "the lake, every summer, forever",
    gift: { recipient: "Dad", occasion: "Happy 60th", from: "Sam", note: null, noteTranscript: null },
  });
  gift.palette = artPalette(gift.art!);
  return out;
}

function emptyCellsNear(taken: Set<number>, start: number, count: number): number[] {
  const out: number[] = [];
  for (let k = 0; out.length < count && k < N * N; k++) {
    const i = (start + k * 37) % (N * N);
    if (!taken.has(i) && !out.includes(i)) out.push(i);
  }
  return out;
}

function buildPending(approved: Tile[], now: number): Tile[] {
  const taken = new Set(approved.map((t) => t.y * N + t.x));
  const cells = emptyCellsNear(taken, 264, 5);
  const ago = (d: number) => new Date(now - d * 86400000).toISOString();
  const specs: Partial<Tile>[] = [
    { displayName: null, origin: "ai", prompt: "the street I grew up on, at dusk, violet and amber", phrase: "the street I grew up on, as I remember it", art: { kind: "night", seed: 991, h: 270, s: 40, l: 34 }, voice: null, transcript: null, createdAt: ago(6), flags: [] },
    { displayName: "Marco Dell’Orto", origin: "hand", phrase: "for everyone I argued with and still love", art: { kind: "abstract", seed: 992, h: 12, s: 52, l: 42 }, voice: null, transcript: null, createdAt: ago(0.1), flags: ["Image: possible hate symbol. Check before approving."], contentCredentials: "Procreate 5.2, no AI edits recorded" },
    { displayName: "Aiko Tanaka", origin: "ai", prompt: "cherry blossom over a small house", phrase: "for Grandma, at ninety", art: { kind: "bloom", seed: 993, h: 335, s: 50, l: 52 }, voice: null, transcript: null, createdAt: ago(1), flags: [], gift: { recipient: "Grandma", occasion: "Ninety today", from: "Aiko", note: null, noteTranscript: null } },
    { displayName: "Tomás Rivera", origin: "hand", phrase: "for the lighthouse keeper I never met", art: { kind: "horizon", seed: 995, h: 205, s: 46, l: 38 }, voice: null, transcript: null, createdAt: ago(0.3), flags: [], contentCredentials: null },
    { displayName: null, origin: "hand", phrase: "best coffee in town, come visit", art: { kind: "abstract", seed: 996, h: 30, s: 55, l: 45 }, voice: null, transcript: null, createdAt: ago(2), flags: ["Phrase: reads like an advert.", "Image: possible logo in the lower corner."] },
  ];
  return specs.map((sp, k) => {
    const i = cells[k];
    const t = baseTile("1", i % N, Math.floor(i / N));
    const merged: Tile = { ...t, ...sp, status: "pending", approvedAt: null, email: "person@example.com" } as Tile;
    merged.palette = merged.art ? artPalette(merged.art) : [];
    if (!sp.payment) merged.payment = { kind: "hold", amount: 1 };
    return merged;
  });
}

let cache: { tiles: Tile[]; reports: Report[] } | null = null;

/** All seed tiles across seasons, plus seed reports. */
export function seedData(): { tiles: Tile[]; reports: Report[] } {
  if (cache) return cache;
  const s1 = buildSeason1();
  // Pending dates are relative to a fixed "now" so server and client match; admin shows ages from the real clock.
  const pending = buildPending(s1, Date.parse("2026-10-30T09:00:00Z"));
  const tiles = [...s1, ...pending];
  const reports: Report[] = [
    { id: "r-seed-1", tileId: s1[40].id, reason: "Wrong label (hand or AI)", note: "This looks AI-made to me, but it says by hand.", status: "open", createdAt: "2026-10-28T14:12:00Z" },
    { id: "r-seed-2", tileId: s1[118].id, reason: "Spam, link or advert", note: "I think there is a brand name in the corner.", status: "open", createdAt: "2026-10-29T08:03:00Z" },
  ];
  cache = { tiles, reports };
  return cache;
}

export const PHRASE_BANK = PHRASES;
export const NAME_BANK = NAMES;
