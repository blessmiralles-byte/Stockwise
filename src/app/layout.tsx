import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://stockwise.app";

const TITLE = "StockWise — Stop losing money to stock you can't see";
const DESCRIPTION =
  "Real-time inventory, expiry & batch tracking, equipment management, and mobile field access — built for trade contractors, healthcare teams, hospitality operators, and field crews. Free 14-day trial, no credit card.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: TITLE,
    template: "%s · StockWise",
  },
  description: DESCRIPTION,
  applicationName: "StockWise",
  keywords: [
    "inventory management",
    "asset management",
    "stock control",
    "expiry tracking",
    "field service inventory",
    "equipment tracking",
    "purchase orders",
    "barcode scanning",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "StockWise",
    url: siteUrl,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
