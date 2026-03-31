import type { Metadata } from "next";
import HomeClient from "./HomeClient";

export const metadata: Metadata = {
  title: "Transparent.city \u2013 See What\u2019s Working in Your City",
  description:
    "Transparent.city turns public city data into clear, source-linked insights so residents and public officials can see what\u2019s working and where to focus.",
  alternates: {
    canonical: "https://transparent.city/",
  },
  openGraph: {
    title: "Transparent.city \u2013 See What\u2019s Working in Your City",
    description:
      "Transparent.city turns public city data into clear, source-linked insights so residents and public officials can see what\u2019s working and where to focus.",
    url: "https://transparent.city/",
    images: [
      {
        url: "/images/app-screenshot-dashboard.png",
        width: 1200,
        height: 630,
        alt: "Transparent.city dashboard screenshot",
      },
    ],
  },
};

export default function HomePage() {
  return <HomeClient />;
}
