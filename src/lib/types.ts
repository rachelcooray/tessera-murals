import type { ArtSpec } from "./art";

export type Origin = "hand" | "ai";
export type TileStatus = "pending" | "approved" | "rejected" | "hidden";

/** A recorded or uploaded voice clip. Phase 1 keeps it in the browser as a data URL. */
export type VoiceClip = { kind: "data"; seconds: number; url: string; peaks: number[] };

export interface Gift {
  recipient: string;
  occasion: string;
  from: string | null;
  note: VoiceClip | null;
  noteTranscript: string | null;
}

export interface Tile {
  id: string;
  seasonId: string;
  x: number;
  y: number;
  /** Procedural artwork (seed data and the mock AI generator). */
  art: ArtSpec | null;
  /** Uploaded image as a data URL (Phase 1 keeps uploads in the browser). */
  imageUrl: string | null;
  phrase: string | null;
  voice: VoiceClip | null;
  transcript: string | null;
  /** null means Anonymous. */
  displayName: string | null;
  origin: Origin;
  prompt: string | null;
  palette: string[];
  status: TileStatus;
  rejectionReason: string | null;
  gift: Gift | null;
  createdAt: string;
  approvedAt: string | null;
  /** Mock moderation output shown in admin. */
  flags: string[];
  contentCredentials: string | null;
  payment: { kind: "hold" | "credit"; amount: number } | null;
  email: string | null;
}

export type SeasonStatus = "open" | "frozen" | "upcoming";

export interface Season {
  id: string;
  number: number;
  name: string;
  theme: string;
  gridSize: number;
  status: SeasonStatus;
  createdAt: string;
  frozenAt: string | null;
}

export interface Report {
  id: string;
  tileId: string;
  reason: string;
  note: string;
  status: "open" | "hidden" | "relabelled" | "dismissed";
  createdAt: string;
}

export interface Prices {
  single: number;
  bundleCount: number;
  bundlePrice: number;
}

export const REPORT_REASONS = [
  "Sexual content or nudity",
  "Violence, gore or self-harm",
  "Hate or harassment",
  "A real person, or private details",
  "Copyrighted character or brand logo",
  "Spam, link or advert",
  "Wrong label (hand or AI)",
  "Something else",
] as const;

export const REJECTION_REASONS = [
  "Sexual content or nudity",
  "Violence, gore or self-harm",
  "Hate or harassment",
  "A real person without consent, or private details",
  "Copyrighted character or brand logo",
  "Spam, link, QR code or advert",
  "Audio or phrase breaks the content policy",
] as const;
