"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { MetricCardData } from "./templates/MetricSummaryCard";
import MetricSummaryCard from "./templates/MetricSummaryCard";
import CardActionBar from "./CardActionBar";
import SourceLine from "@/components/SourceLine";
import styles from "./feed.module.css";

interface MetricFeedCardProps {
  data: MetricCardData;
  onHide?: (metricId: number) => void;
  /** Hide share button and overflow menu (used on public landing page) */
  hideActions?: boolean;
}

const noop = () => {};

export default function MetricFeedCard({ data, onHide = noop, hideActions = false }: MetricFeedCardProps) {
  const router = useRouter();
  const [hiding, setHiding] = useState(false);

  const metricId = data.metric.id;
  const href = `/c/${data.slug}/metrics/${data.metric.metric_key}`;

  const handleCardClick = useCallback(() => {
    router.push(href);
  }, [router, href]);

  const handleShare = useCallback(() => {
    const url = `${window.location.origin}${href}`;
    if (typeof navigator.share === "function") {
      navigator.share({ title: data.metric.metric_name, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(
        () => toast.success("Link copied to clipboard"),
        () => toast.error("Could not copy link"),
      );
    }
  }, [href, data.metric.metric_name]);

  const handleHide = useCallback(() => {
    setHiding(true);
    setTimeout(() => onHide(metricId), 300);
    toast("Hidden. You\u2019ll see fewer like this.", {
      action: {
        label: "Undo",
        onClick: () => {
          onHide(-metricId); // negative = undo signal
        },
      },
    });
  }, [metricId, onHide]);

  const cardClassName = [
    styles.card,
    hiding ? styles.cardHiding : "",
  ]
    .filter(Boolean)
    .join(" ");

  const sourceCategory = data.metric.category ?? "";
  const actionBar = hideActions ? (
    <div style={{ marginTop: "auto", paddingTop: 12 }}>
      <SourceLine
        category={sourceCategory}
        citySlug={data.slug}
        metricSlug={data.metric.metric_key}
      />
    </div>
  ) : (
    <CardActionBar
      onShare={handleShare}
      showOverflow={false}
      sourceCategory={sourceCategory}
      sourceCitySlug={data.slug}
      sourceMetricSlug={data.metric.metric_key}
    />
  );

  return (
    <article
      className={cardClassName}
      onClick={handleCardClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "TEXTAREA" || tag === "INPUT") return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      <MetricSummaryCard data={data}>{actionBar}</MetricSummaryCard>

    </article>
  );
}
