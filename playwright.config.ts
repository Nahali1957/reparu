import { defineConfig } from "@playwright/test";

/** Captures 1440 × 900 de chaque écran (docs/screens/), à comparer à docs/maquette/screens/. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "https://localhost:5180",
    viewport: { width: 1440, height: 900 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    ignoreHTTPSErrors: true,
  },
});
