import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { IdentityProvider } from "@/lib/identity";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ACs Homestay Tracker",
  description:
    "Bookings, expenses, and cleaning schedules for ACs Homestay — in one place.",
  applicationName: "ACs Homestay",
  appleWebApp: {
    capable: true,
    title: "ACs Homestay",
    statusBarStyle: "default",
  },
  // Next.js serves the apple-touch-icon from src/app/apple-icon.png and
  // injects the matching <link rel="apple-touch-icon" ...> tag. Sizing
  // hints keep iOS from picking the wrong asset.
  icons: {
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // brand-700 — also drives the home-screen address-bar tint on iOS.
  themeColor: "#b45309",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <IdentityProvider>
          {children}
        </IdentityProvider>
      </body>
    </html>
  );
}
