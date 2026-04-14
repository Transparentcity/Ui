"use client";

import type { EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import { slugify } from "@/lib/utils";
import { useMetricKey } from "../MetricKeyContext";
import MetricLink from "../MetricLink";
import CardHeader from "../CardHeader";
import styles from "../feed.module.css";

interface TextOnlyCardProps {
  story: EnrichedFeedStory;
  children: React.ReactNode;
}

export default function TextOnlyCard({ story, children }: TextOnlyCardProps) {
  const meta = story.metadata ?? {};
  const { resolveMetricKey } = useMetricKey();
  const citySlug = story.city_name ? slugify(story.city_name) : null;

  return (
    <>
      <CardHeader
        typeIcon={story.type_icon}
        typeLabel={story.type_label}
        actor={story.actor}
        subline={story.subline}
        neighborhoodLabel={story.neighborhood_label}
        categoryColor={story.category_color}
      />
      <h2 className={styles.cardHeadline}>{story.headline}</h2>

      {/* Context story: callout block for key insight */}
      {story.card_type === "context" && meta.key_insight && (
        <div className={styles.contextCallout}>
          {meta.key_insight as string}
        </div>
      )}

      {/* Justice story: outcome chip */}
      {story.card_type === "justice" && meta.outcome && (
        <span
          className={`${styles.justiceOutcomePill} ${
            /convict|indict|guilty|sentenced/i.test(meta.outcome as string)
              ? styles.justiceConviction
              : /acquit|dismiss|not guilty/i.test(meta.outcome as string)
                ? styles.justiceAcquittal
                : styles.justicePending
          }`}
        >
          {meta.outcome_detail ? (meta.outcome_detail as string) : (meta.outcome as string)}
        </span>
      )}

      {/* Business story: name + address hero */}
      {story.card_type === "business" && meta.business_name && (
        <>
          <div className={styles.businessNameHero}>{meta.business_name as string}</div>
          {meta.business_address && (
            <div className={styles.businessAddress}>
              {"\u{1F4CD}"} {meta.business_address as string}
            </div>
          )}
          {meta.business_status && (
            <span
              className={`${styles.businessStatusPill} ${
                /open|launch/i.test(meta.business_status as string)
                  ? styles.businessOpening
                  : styles.businessClosing
              }`}
            >
              {meta.business_status as string}
            </span>
          )}
        </>
      )}

      {/* Traction story: good-news highlight + category */}
      {story.card_type === "traction" && meta.traction_category && (
        <span className={styles.tractionCategoryPill}>
          {meta.traction_category as string}
        </span>
      )}
      {story.card_type === "traction" && meta.traction_highlight && (
        <div className={styles.tractionCallout}>
          {meta.traction_highlight as string}
        </div>
      )}

      {/* Trend story: metric strip */}
      {story.card_type === "trend" && meta.trend_metric_name && (
        <div className={styles.trendStrip}>
          <span className={styles.trendMetricName}>
            <MetricLink
              label={meta.trend_metric_name as string}
              metricKey={resolveMetricKey(meta.trend_metric_name as string)}
              citySlug={citySlug}
            />
          </span>
          {meta.trend_direction && (
            <span
              className={styles.trendDirection}
              style={{
                color: (meta.trend_direction as string) === "up"
                  ? "var(--error)"
                  : "var(--success)",
              }}
            >
              {(meta.trend_direction as string) === "up" ? "\u2191" : "\u2193"}
            </span>
          )}
          {meta.trend_duration && (
            <span className={styles.trendDuration}>{meta.trend_duration as string}</span>
          )}
        </div>
      )}

      {story.cleaned_description && (
        <p className={styles.cardDescription}>{story.cleaned_description}</p>
      )}
      {children}
    </>
  );
}
