import { SEASONS } from "./seed";

/** Public season number for a tile's season id (the live wall is Season 0). */
export function seasonNumber(seasonId: string): number {
  return SEASONS.find((s) => s.id === seasonId)?.number ?? Number(seasonId);
}
