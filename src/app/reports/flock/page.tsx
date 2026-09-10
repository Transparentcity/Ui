import type { Metadata } from "next";
import Header from "@/components/Header";
import PublicFooter from "@/components/PublicFooter";
import { FlockReport } from "@/components/reports/flock-report";
import "../../landing.css";
import "./report.css";

const description =
  "What five American cities actually paid Flock Safety, what happened to vehicle theft while the cameras ran, and what happened where they were switched off. A pre-registered analysis from public records.";

export const metadata: Metadata = {
  title: "Flock by the Numbers",
  description,
  alternates: { canonical: "/reports/flock" },
  openGraph: {
    title: "Flock by the Numbers",
    description,
    url: "/reports/flock",
    images: [
      {
        url: "https://transparent.city/images/app-screenshot-dashboard.png",
        width: 1200,
        height: 630,
        alt: "Flock by the Numbers, a Transparent City report",
      },
    ],
  },
  twitter: { card: "summary_large_image", title: "Flock by the Numbers", description },
};

export default function FlockReportRoute() {
  return (
    <>
      <Header />
      <main id="main-content">
        <FlockReport />
      </main>
      <PublicFooter />
    </>
  );
}
