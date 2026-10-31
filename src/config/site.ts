/**
 * Site-wide settings. Edit these before launch.
 * Square prices live in src/lib/pricing.ts and the payments server function.
 */
export const site = {
  name: "Tessera",
  creatorName: "Rachel Cooray",
  contactEmail: "hello@tessera.example",
  location: "[City, Country]",
  gridSize: 20,
  currency: "usd",
  voice: { minSeconds: 10, maxSeconds: 20 },
  phraseMax: 80,
  details: { titleMax: 60, mediumMax: 60, noteMax: 400, creditMax: 30 },
  holdWarningDays: 5,
};
