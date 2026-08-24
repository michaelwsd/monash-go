import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";

import { MonashGuard } from "@/components/monash-guard";
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
  title: "MonashGo",
  description:
    "Share the drive between campuses. See what it costs the planet before you go.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ClerkProvider makes the signed-in user available to every page below it.
  // It reads NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY from .env.local automatically.
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          {/* Pressing back from Google leaves Clerk permanently stuck at status
              "loading": its script re-fetches, but it never requests
              /v1/environment or /v1/client. React never finishes hydrating, so
              the sign-in button becomes inert HTML that swallows every click
              with no error. Verified: a useEffect does NOT run on this path, so
              the recovery cannot live inside a component.

              `beforeInteractive` runs ahead of hydration and Next requires it
              in the root layout, so the path check keeps it to /sign-in and
              leaves back navigation instant everywhere else. Reloading sets the
              navigation type to "reload", so this cannot loop. */}
          <Script id="clerk-back-nav-recovery" strategy="beforeInteractive">
            {`if(location.pathname.indexOf('/sign-in')===0&&performance.getEntriesByType('navigation')[0]?.type==='back_forward'){location.reload()}`}
          </Script>
          <MonashGuard />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
