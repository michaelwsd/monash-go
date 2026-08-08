import type { Metadata, Viewport } from "next";
import { Caprasimo, Figtree } from "next/font/google";

import "./globals.css";

/**
 * Caprasimo is the design system's only display voice and ships in a single
 * weight. Figtree is variable, so no `weight` is declared and every weight
 * between 300 and 900 is available from one file.
 *
 * Both are exposed as CSS variables rather than classNames because
 * `globals.css` maps them into the Tailwind theme (`--font-display`,
 * `--font-sans`) — that keeps font choice a token, not an import.
 */
const caprasimo = Caprasimo({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-caprasimo",
  display: "swap",
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MonashGo",
    template: "%s · MonashGo",
  },
  description:
    "Share the drive between Monash campuses. See what it costs the planet before you go.",
};

export const viewport: Viewport = {
  // The warm ground bleeds into the browser chrome on mobile, so the page does
  // not appear to float on a white rectangle.
  themeColor: "#f5ead8",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-AU"
      className={`${figtree.variable} ${caprasimo.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-ground text-ink">
        {children}
      </body>
    </html>
  );
}
