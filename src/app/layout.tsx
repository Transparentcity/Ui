import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./providers";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { getSiteOrigin } from "@/lib/siteUrl";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteOrigin()),
  title: {
    default: "Transparent.city – See What’s Working in Your City",
    template: "%s – Transparent.city",
  },
  description:
    "Transparent.city turns public city data into clear, source-linked insights so residents and public officials can see what's working and where to focus.",
  icons: {
    icon: "/favicon.svg",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "Transparent.city",
    title: "Transparent.city – See What’s Working in Your City",
    description:
      "Transparent.city turns public city data into clear, source-linked insights so residents and public officials can see what's working and where to focus.",
    url: "/",
    images: [
      {
        url: "/images/app-screenshot-dashboard.png",
        width: 1080,
        height: 1920,
        alt: "Transparent.city dashboard screenshot",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Transparent.city – See What’s Working in Your City",
    description:
      "Public city data, made legible: maps, metrics, and source-linked research.",
    images: ["/images/app-screenshot-dashboard.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
          integrity="sha512-iecdLmaskl7CVkqkXNQ/ZH/XLlvWZOJyj7Yy7tcenmpD1ypASozpmT/E0iPtmFIB46ZmdtAc9eNBvH0H/ZpiBw=="
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </head>
      <body>
        <AuthProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

