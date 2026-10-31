/**
 * Site-wide settings. Edit these before launch.
 * Prices here are defaults; the admin Prices tab overrides them (stored locally in Phase 1).
 */
export const site = {
  name: "Tessera",
  creatorName: "Rachel Cooray",
  contactEmail: "hello@tessera.example",
  location: "[City, Country]",
  gridSize: 20,
  defaultPrices: { single: 1, bundleCount: 10, bundlePrice: 10, currency: "USD" },
  voice: { minSeconds: 10, maxSeconds: 20 },
  phraseMax: 80,
  holdWarningDays: 5,
};
