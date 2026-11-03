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
  "https://stocked.tech";

// The title names the category (what people search for); the H1 carries the
// promise. Keep the description under ~160 characters or Google truncates it.
const TITLE = "Stocked — Inventory, Tool Tracking & Fixed Assets for Contractors";
const DESCRIPTION =
  "Inventory, job costing, and tool tracking for trade contractors. Crews request materials from their phone; every unit is booked to the job. Free 14-day trial.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: TITLE,
    template: "%s · Stocked",
  },
  description: DESCRIPTION,
  applicationName: "Stocked",
  keywords: [
    "contractor inventory management",
    "tool tracking software",
    "equipment check in check out",
    "fixed asset tracking and depreciation",
    "construction inventory software",
    "job costing materials",
    "purchase orders and receiving",
    "barcode scanning inventory",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Stocked",
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
