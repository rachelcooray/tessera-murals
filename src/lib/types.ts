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

/** Optional extras an artist can add. All plain text; nothing is turned into a link. */
export interface TileDetails {
  title: string | null;
  medium: string | null;
  note: string | null;
  credit: string | null;
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
  details?: TileDetails | null;
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
  /**
   * Every order is one card hold covering all its squares (amount = the order total).
   * When every tile in the order has been reviewed, only the approved ones are captured.
   * "charge" and "credit" only appear on data saved by older versions.
   */
  payment: { kind: "hold" | "charge" | "credit"; amount: number; quantity?: number; orderId?: string; intentId?: string; mock?: boolean } | null;
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
  /** Deadline: the season freezes at this time even if squares are left. */
  closesAt: string | null;
}

export interface Report {
  id: string;
  tileId: string;
  reason: string;
  note: string;
  status: "open" | "hidden" | "relabelled" | "dismissed";
  createdAt: string;
}

export type { Prices } from "./pricing";

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
