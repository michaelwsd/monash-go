import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
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
          <MonashGuard />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
