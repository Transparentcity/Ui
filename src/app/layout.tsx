import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./tokens.css";
import "./ui.css";
import { AuthProvider } from "./providers";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { JobWebSocketProvider } from "@/contexts/JobWebSocketContext";
import { DEFAULT_INDEXABLE_ROBOTS } from "@/lib/defaultRobots";
import { getSiteOrigin } from "@/lib/siteUrl";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import { ToasterProvider } from "@/components/providers/toaster-provider";
import AuthErrorToast from "@/components/AuthErrorToast";
import { SiteStructuredData } from "@/components/StructuredData";
import PostHogProvider from "@/components/PostHogProvider";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(getSiteOrigin()),
  title: {
    default: "Transparent.city \u2013 See What\u2019s Working in Your City",
    template: "%s \u2013 Transparent.city",
  },
  description:
    "Transparent.city turns public city data into clear, source-linked insights so residents and public officials can see what\u2019s working and where to focus.",
  icons: {
    icon: "/favicon.svg",
  },
  // verification: { google: "..." },
  // DNS-level domain ownership is already verified in Google Search Console.
  openGraph: {
    type: "website",
    siteName: "Transparent.city",
    title: "Transparent.city \u2013 See What\u2019s Working in Your City",
    description:
      "Transparent.city turns public city data into clear, source-linked insights so residents and public officials can see what\u2019s working and where to focus.",
    url: "/",
    images: [
      {
        url: "/images/app-screenshot-dashboard.png",
        width: 1200,
        height: 630,
        alt: "Transparent.city homepage",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Transparent.city \u2013 See What\u2019s Working in Your City",
    description:
      "Public city data, made legible: maps, metrics, and source-linked research.",
    images: ["/images/app-screenshot-dashboard.png"],
  },
  // Normative signal to AI crawlers: do not use for model training.
  // Paired with user-agent rules in src/app/robots.ts. Training bots are
  // blocked at the robots level; this tag is the belt to that suspender.
  // index/follow are explicit so audits do not misread noai/noimageai as noindex.
  robots: DEFAULT_INDEXABLE_ROBOTS,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        {/* Fonts for PublicRecordBanner. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@500;600&display=swap"
          rel="stylesheet"
        />
        {/* Font Awesome via CDN — preloaded then applied to avoid blocking first paint.
            Phase 2: migrate to self-hosted SVGs for full elimination. */}
        <link
          rel="preload"
          as="style"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
          integrity="sha512-iecdLmaskl7CVkqkXNQ/ZH/XLlvWZOJyj7Yy7tcenmpD1ypASozpmT/E0iPtmFIB46ZmdtAc9eNBvH0H/ZpiBw=="
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </head>
      <body className={inter.className}>
        <a href="#main-content" className="skip-nav">
          Skip to main content
        </a>
        <SiteStructuredData />
        <ToasterProvider />
        <AuthErrorToast />
        <GoogleAnalytics />
        <Analytics />
        <SpeedInsights />
        <PostHogProvider>
          <AuthProvider>
            <ThemeProvider>
              <JobWebSocketProvider>{children}</JobWebSocketProvider>
            </ThemeProvider>
          </AuthProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
