/**
 * Site-wide settings. Edit these before launch.
 * Square prices live in src/lib/pricing.ts and the payments server function.
 */
export const site = {
  name: "Tessera",
  /** Shown as the maker. Put a name here when you are ready to be named. */
  creatorName: "The maker of Tessera",
  contactEmail: "hello@tessera.example",
  /**
   * Who runs Tessera, shown on the contact, terms and privacy pages (UK law asks online shops to show these).
   * Fill in before taking real orders.
   */
  business: {
    legalName: "[BUSINESS NAME, for example Jane Smith trading as Tessera]",
    address: "[POSTAL ADDRESS]",
    country: "United Kingdom",
    /** Shown on receipts and the terms. Change to true and add the number once registered. */
    vatRegistered: false,
    vatNumber: "",
  },
  location: "[City, Country]",
  gridSize: 20,
  /** When the current season closes, even if not every square is taken. Change this to move the deadline. */
  seasonClosesAt: "2026-11-07T23:59:00+05:30",
  currency: "usd",
  voice: { minSeconds: 10, maxSeconds: 20 },
  phraseMax: 80,
  details: { titleMax: 60, mediumMax: 60, noteMax: 400, creditMax: 30 },
  holdWarningDays: 5,
};
