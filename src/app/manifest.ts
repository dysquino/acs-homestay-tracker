import type { MetadataRoute } from "next";

/**
 * Web App Manifest — served at /manifest.webmanifest. Drives the iOS / Android
 * "Add to Home Screen" prompt: name, icon, theme color, and the display mode
 * (we go with `standalone` so the address bar is hidden when launched from
 * the home screen, matching the in-app look).
 *
 * Next.js auto-injects the corresponding <link rel="manifest" ...> tag in
 * <head> based on this file. Apple-touch-icon is served separately from
 * `src/app/apple-icon.png` (also auto-wired).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ACs Homestay Tracker",
    short_name: "ACs Homestay",
    description:
      "Bookings, expenses, and cleaning schedules for ACs Homestay — in one place.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc", // matches the page background
    theme_color: "#b45309", // brand-700 — see globals.css
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // iOS Safari prefers apple-touch-icon (served from src/app/apple-icon.png)
      // and ignores the manifest icons; listing it here is harmless.
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
