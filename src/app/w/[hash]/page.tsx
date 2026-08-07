import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import "../../landing.css";
import {
  getCityBoundarySketch,
  getPublicWeekReplay,
  publicWeekReplayPosterUrl,
} from "@/lib/publicApiClient";
import { getSiteOrigin } from "@/lib/siteUrl";
import PublicNavBar from "@/components/PublicNavBar";
import PublicFooter from "@/components/PublicFooter";
import WeekReplayShareClient from "./WeekReplayShareClient";
import styles from "./styles.module.css";

export const revalidate = 3600;

type PageProps = {
  params: Promise<{ hash: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { hash } = await params;
  try {
    const replay = await getPublicWeekReplay(hash);
    const title = replay.title || "Week Replay";
    const count = replay.events?.length ?? 0;
    const description =
      count > 0
        ? `${count} events from the past week in ${replay.city_name}.`
        : `A week in ${replay.city_name}.`;
    const canonical = `/w/${hash}`;
    const poster = publicWeekReplayPosterUrl(hash);
    const origin = getSiteOrigin();
    return {
      title,
      description,
      alternates: { canonical },
      openGraph: {
        title,
        description,
        url: `${origin}${canonical}`,
        type: "website",
        images: [{ url: poster, width: 1200, height: 630, alt: title }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [poster],
      },
    };
  } catch {
    return { title: "Week Replay" };
  }
}

export default async function WeekReplaySharePage({ params }: PageProps) {
  const { hash } = await params;
  if (!hash) notFound();

  let replay: Awaited<ReturnType<typeof getPublicWeekReplay>>;
  try {
    replay = await getPublicWeekReplay(hash);
  } catch {
    notFound();
  }

  let sketch: Awaited<ReturnType<typeof getCityBoundarySketch>> | null = null;
  try {
    sketch = await getCityBoundarySketch(replay.city_id);
  } catch {
    sketch = null;
  }

  const isPlace = Boolean(replay.scope_place);
  const district = replay.scope_district ?? 0;
  const cityHref = replay.city_slug ? `/c/${replay.city_slug}` : "/";

  return (
    <div className={styles.page}>
      <PublicNavBar>
        <Link href="/home" className="nav-link">
          Your week
        </Link>
      </PublicNavBar>
      <main className={styles.main}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>
            <Link href={cityHref}>{replay.city_name}</Link>
            {" · "}
            Week Replay
          </p>
          <h1 className={styles.title}>{replay.title}</h1>
          <p className={styles.sub}>
            {replay.events.length} events
            {replay.total_before_cap > replay.events.length
              ? ` of ${replay.total_before_cap}`
              : ""}{" "}
            from the past week
          </p>
        </header>

        <div className={styles.playerShell}>
          <WeekReplayShareClient
            replay={replay}
            sketch={sketch}
            isPlace={isPlace}
            district={district}
          />
        </div>

        <p className={styles.cta}>
          <Link href="/home" className={styles.ctaLink}>
            See your own week →
          </Link>
        </p>
      </main>
      <PublicFooter citySlug={replay.city_slug || undefined} />
    </div>
  );
}
