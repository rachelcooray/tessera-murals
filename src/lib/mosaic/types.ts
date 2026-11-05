import type { ArtSpec } from "../art";
import type { SlotColour } from "./colours";

export type Occasion = "wedding" | "birthday" | "portrait" | "company" | "memorial" | "other";
export const OCCASIONS: { id: Occasion; label: string }[] = [
  { id: "wedding", label: "Wedding" }, { id: "birthday", label: "Birthday" }, { id: "portrait", label: "Portrait" },
  { id: "company", label: "Company or logo" }, { id: "memorial", label: "Memorial" }, { id: "other", label: "Something else" },
];

export interface Mosaic {
  id: string;
  title: string;
  occasion: Occasion;
  tierId: string;
  cols: number;
  rows: number;
  priceCents: number;
  /** Set aside for public artists when the order is paid. */
  poolCents: number;
  email: string;
  createdAt: string;
  revealAt: string;
  visibility: "public" | "private";
  openToArtists: boolean;
  /** Secret held by the customer's browser. Phase 2 replaces it with a sign-in. */
  ownerKey: string;
  inviteToken: string;
  /** Downscaled target image. Only the owner and reviewers see it before the reveal. */
  target: string;
  slots: SlotColour[];
  /** awaiting_payment and cancelled exist only in live mode, for orders not yet paid. */
  status: "collecting" | "revealed" | "awaiting_payment" | "cancelled";
  revealedAt: string | null;
  /** Slot numbers the customer favourited after the reveal. */
  favourites: number[];
  splitAt: string | null;
  payment: { intentId: string | null; mock: boolean };
  /** Slots filled by studio fill, as a bitmap (see bits.ts). Their tiles are generated when read, not stored. */
  studioSlots?: string | null;
  studioAt?: string | null;
  sample?: boolean;
}

export type TileSource = "circle" | "artist" | "studio" | "sample";
export type MosaicTileStatus = "pending" | "approved" | "rejected" | "removed";

export interface MosaicTile {
  id: string;
  mosaicId: string;
  slot: number;
  contributorId: string;
  source: TileSource;
  /** null means Anonymous. */
  name: string | null;
  medium: string | null;
  /** Uploaded image (downscaled, already tinted) as a data URL. Studio and sample tiles use art instead.
   *  In live mode this is a tiny thumbnail for drawing the grid; the full tile is at imagePath in Storage. */
  imageUrl: string | null;
  /** Live mode: path of the full-size tile in the "tiles" Storage bucket. */
  imagePath?: string | null;
  art: ArtSpec | null;
  averageHex: string;
  /** Colour match with the slot after tinting, 0 to 1. */
  match: number;
  tint: number;
  hash: string | null;
  flags: string[];
  /** Set when the tile was painted in Tessera's paint tool: a summary of the strokes, not the strokes themselves. */
  painted?: PaintedSummary | null;
  status: MosaicTileStatus;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface PaintedSummary { strokes: number; activeMs: number; inputs: string[]; tools: string[] }

export interface Claim { mosaicId: string; slot: number; contributorId: string; source: "circle" | "artist"; at: string }

export interface ArtistProfile {
  id: string;
  name: string;
  portfolio: string;
  joinedAt: string;
  payoutMethod: "bank" | "paypal" | "payoneer" | "unset";
  payoutName: string;
  country: string;
}

export interface RevenueEntry { id: string; mosaicId: string; cents: number; reason: string; at: string }

export const TILE_REJECTION_REASONS = [
  "Looks AI-made",
  "Too far from the slot colour",
  "Duplicate of another tile",
  "Sexual content or nudity",
  "Violence, gore or self-harm",
  "Hate or harassment",
  "A real person without consent, or private details",
  "Copyrighted character or brand logo",
  "Spam, link, QR code or advert",
  "Low quality",
] as const;

export const MEDIUMS = ["Painting", "Drawing", "Ink", "Photograph", "Collage", "Digital painting", "Textile", "Other"] as const;
