"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  getNewsletterMetrics,
  getNewsletterMetricsTopLinks,
  type NewsletterMetricsItem,
  type NewsletterMetricsLink,
} from "@/lib/apiClient";
import Loader from "@/components/Loader";
import styles from "./NewsletterAdmin.module.css";

/** Fetch all dated editions so a campaign family is not split across pages. */
const FETCH_PAGE_SIZE = 200;

const DATED_CAMPAIGN = /^(weekly|monthly|sample)_(\d{4}-\d{2}-\d{2})$/;

function formatWhen(iso: string | null): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCtr(ctr: number | null): string {
  if (ctr == null) return "\u2014";
  return `${(ctr * 100).toFixed(1)}%`;
}

/** Family key used to collapse dated UTM campaigns onto one row. */
export function campaignFamilyKey(campaign: string): string {
  if (campaign.startsWith("substack_migration_")) return "substack_migration";
  const match = campaign.match(DATED_CAMPAIGN);
  return match ? match[1] : campaign;
}

export function campaignFamilyLabel(family: string): string {
  if (family === "weekly") return "Weekly";
  if (family === "monthly") return "Monthly";
  if (family === "sample") return "Sample";
  if (family === "substack_migration") return "Substack migration";
  return family;
}

export function formatDateRange(
  firstIso: string | null,
  lastIso: string | null,
): string {
  const first = formatWhen(firstIso);
  const last = formatWhen(lastIso);
  if (first === last) return first;
  return `${first} \u2013 ${last}`;
}

/** Display calendar date so Fri/Sat/Sun generation ids of one send group together. */
export function sendDateKey(iso: string | null): string {
  return formatWhen(iso);
}

/** Human label whose date reflects delivery rather than draft generation. */
export function campaignLabel(
  campaign: string,
  firstSentAt: string | null,
): string {
  const sentDate = firstSentAt ? formatWhen(firstSentAt) : null;
  if (campaign.startsWith("substack_migration_")) return "Substack migration";
  if (campaign.startsWith("weekly_")) {
    return sentDate ? `Weekly ${sentDate}` : `Weekly ${campaign.slice(7)}`;
  }
  if (campaign.startsWith("monthly_")) {
    return sentDate ? `Monthly ${sentDate}` : `Monthly ${campaign.slice(8)}`;
  }
  if (campaign.startsWith("sample_")) {
    return sentDate ? `Sample ${sentDate}` : `Sample ${campaign.slice(7)}`;
  }
  return campaign;
}

export type DateBucket = {
  dateKey: string;
  editions: NewsletterMetricsItem[];
  totals: NewsletterMetricsItem;
};

export type CampaignFamilyGroup = {
  family: string;
  label: string;
  dates: DateBucket[];
  totals: NewsletterMetricsItem;
};

function minIso(values: Array<string | null>): string | null {
  const present = values.filter((v): v is string => Boolean(v)).sort();
  return present[0] ?? null;
}

function maxIso(values: Array<string | null>): string | null {
  const present = values.filter((v): v is string => Boolean(v)).sort();
  return present[present.length - 1] ?? null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

export function aggregateEditions(
  editions: NewsletterMetricsItem[],
): NewsletterMetricsItem {
  const sends = editions.reduce((n, e) => n + e.sends, 0);
  const uniqueRecipients = editions.reduce((n, e) => n + e.unique_recipients, 0);
  const uniqueClickers = editions.reduce((n, e) => n + e.unique_clickers, 0);
  const cityIds = [
    ...new Set(editions.flatMap((e) => e.city_ids ?? [])),
  ];
  const editionHashes = uniqueStrings(
    editions.flatMap((e) => e.edition_hashes ?? []),
  );
  return {
    campaign: editions[0]?.campaign ?? "",
    source: editions.find((e) => e.source)?.source ?? null,
    first_sent_at: minIso(editions.map((e) => e.first_sent_at)),
    last_sent_at: maxIso(editions.map((e) => e.last_sent_at ?? e.first_sent_at)),
    sends,
    unique_recipients: uniqueRecipients,
    city_ids: cityIds.length ? cityIds : null,
    edition_hashes: editionHashes.length ? editionHashes : null,
    clicks: editions.reduce((n, e) => n + e.clicks, 0),
    unique_clickers: uniqueClickers,
    opens: editions.reduce((n, e) => n + e.opens, 0),
    page_views: editions.reduce((n, e) => n + e.page_views, 0),
    unsubscribes: editions.reduce((n, e) => n + e.unsubscribes, 0),
    click_through_rate: uniqueRecipients
      ? Math.round((uniqueClickers / uniqueRecipients) * 10000) / 10000
      : null,
  };
}

export function mergeTopLinks(
  links: NewsletterMetricsLink[],
): NewsletterMetricsLink[] {
  const merged = new Map<string, NewsletterMetricsLink>();
  for (const link of links) {
    const key = `${link.destination_url}\0${link.slot}`;
    const prev = merged.get(key);
    if (prev) {
      prev.clicks += link.clicks;
      prev.unique_clickers += link.unique_clickers;
    } else {
      merged.set(key, { ...link });
    }
  }
  return [...merged.values()].sort((a, b) => b.clicks - a.clicks);
}

function bucketBySendDate(editions: NewsletterMetricsItem[]): DateBucket[] {
  const byDate = new Map<string, NewsletterMetricsItem[]>();
  for (const edition of editions) {
    const key = sendDateKey(edition.first_sent_at);
    const list = byDate.get(key);
    if (list) list.push(edition);
    else byDate.set(key, [edition]);
  }
  const buckets: DateBucket[] = [];
  for (const [dateKey, bucketEditions] of byDate) {
    buckets.push({
      dateKey,
      editions: bucketEditions,
      totals: aggregateEditions(bucketEditions),
    });
  }
  buckets.sort((a, b) =>
    (b.totals.first_sent_at ?? "").localeCompare(a.totals.first_sent_at ?? ""),
  );
  return buckets;
}

/** Collapse dated campaign IDs (weekly_YYYY-MM-DD, …) into one family each. */
export function groupMetricsByCampaignFamily(
  items: NewsletterMetricsItem[],
): CampaignFamilyGroup[] {
  const byFamily = new Map<string, NewsletterMetricsItem[]>();
  for (const item of items) {
    const key = campaignFamilyKey(item.campaign);
    const list = byFamily.get(key);
    if (list) list.push(item);
    else byFamily.set(key, [item]);
  }

  const groups: CampaignFamilyGroup[] = [];
  for (const [family, editions] of byFamily) {
    groups.push({
      family,
      label: campaignFamilyLabel(family),
      dates: bucketBySendDate(editions),
      totals: aggregateEditions(editions),
    });
  }

  groups.sort((a, b) =>
    (b.totals.last_sent_at ?? b.totals.first_sent_at ?? "").localeCompare(
      a.totals.last_sent_at ?? a.totals.first_sent_at ?? "",
    ),
  );
  return groups;
}

function MetricValueCells({ item }: { item: NewsletterMetricsItem }) {
  return (
    <>
      <td className={styles.td}>{item.sends.toLocaleString()}</td>
      <td className={styles.td}>{item.unique_recipients.toLocaleString()}</td>
      <td className={styles.td}>{item.clicks.toLocaleString()}</td>
      <td className={styles.td}>{item.unique_clickers.toLocaleString()}</td>
      <td className={styles.td}>
        {item.click_through_rate != null && item.click_through_rate >= 0.1 ? (
          <span className={`${styles.badge} ${styles.badgeGreen}`}>
            {formatCtr(item.click_through_rate)}
          </span>
        ) : (
          formatCtr(item.click_through_rate)
        )}
      </td>
      <td className={`${styles.td} ${styles.hideNarrow}`}>
        {item.opens > 0 ? item.opens.toLocaleString() : "\u2014"}
      </td>
      <td className={`${styles.td} ${styles.hideNarrow}`}>
        {item.page_views > 0 ? item.page_views.toLocaleString() : "\u2014"}
      </td>
      <td className={styles.td}>
        {item.unsubscribes > 0 ? (
          <span className={`${styles.badge} ${styles.badgeYellow}`}>
            {item.unsubscribes}
          </span>
        ) : (
          "0"
        )}
      </td>
    </>
  );
}

function TopLinksPanel({
  loading,
  links,
}: {
  loading: boolean;
  links: NewsletterMetricsLink[];
}) {
  if (loading) {
    return (
      <span className={styles.muted}>
        <Loader size="sm" color="dark" /> Loading top links…
      </span>
    );
  }
  if (links.length === 0) {
    return (
      <span className={styles.muted}>
        No tracked clicks for this campaign yet.
      </span>
    );
  }
  return (
    <table className={styles.table} style={{ minWidth: 0 }}>
      <thead>
        <tr>
          <th className={styles.th}>Link</th>
          <th className={styles.th}>Slot</th>
          <th className={styles.th}>Clicks</th>
          <th className={styles.th}>Unique</th>
        </tr>
      </thead>
      <tbody>
        {links.map((l, i) => (
          <tr key={`${l.destination_url}-${l.slot}-${i}`}>
            <td className={styles.td}>
              <a
                href={l.destination_url}
                target="_blank"
                rel="noreferrer"
                className={styles.headline}
                style={{ display: "inline-block" }}
                onClick={(e) => e.stopPropagation()}
              >
                {l.destination_url}
              </a>
            </td>
            <td className={styles.td}>{l.slot || "\u2014"}</td>
            <td className={styles.td}>{l.clicks}</td>
            <td className={styles.td}>{l.unique_clickers}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function dateRowLabel(family: string, dateKey: string): string {
  if (dateKey === "\u2014") return campaignFamilyLabel(family);
  if (family === "weekly") return `Weekly ${dateKey}`;
  if (family === "monthly") return `Monthly ${dateKey}`;
  if (family === "sample") return `Sample ${dateKey}`;
  return `${campaignFamilyLabel(family)} ${dateKey}`;
}

export default function NewsletterAdminMetricsTab() {
  const { getAccessTokenSilently } = useAuth0();
  const [items, setItems] = useState<NewsletterMetricsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const [expandedDateKey, setExpandedDateKey] = useState<string | null>(null);
  const [links, setLinks] = useState<NewsletterMetricsLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();
      const first = await getNewsletterMetrics(token, {
        page: 1,
        page_size: FETCH_PAGE_SIZE,
      });
      let all = first.items;
      for (let page = 2; page <= first.pages; page += 1) {
        const next = await getNewsletterMetrics(token, {
          page,
          page_size: FETCH_PAGE_SIZE,
        });
        all = all.concat(next.items);
      }
      setItems(all);
    } catch (err) {
      console.error("Error loading newsletter metrics:", err);
      setError(err instanceof Error ? err.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => groupMetricsByCampaignFamily(items), [items]);

  const toggleFamily = useCallback((family: string) => {
    setExpandedFamily((current) => (current === family ? null : family));
    setExpandedDateKey(null);
    setLinks([]);
  }, []);

  const toggleDrilldown = useCallback(
    async (dateKey: string, campaigns: string[]) => {
      if (expandedDateKey === dateKey) {
        setExpandedDateKey(null);
        setLinks([]);
        return;
      }
      setExpandedDateKey(dateKey);
      setLinks([]);
      setLinksLoading(true);
      try {
        const token = await getAccessTokenSilently();
        const batches = await Promise.all(
          campaigns.map((campaign) =>
            getNewsletterMetricsTopLinks(token, campaign),
          ),
        );
        setLinks(mergeTopLinks(batches.flat()));
      } catch (err) {
        console.error("Error loading top links:", err);
        setLinks([]);
      } finally {
        setLinksLoading(false);
      }
    },
    [expandedDateKey, getAccessTokenSilently],
  );

  const sendDateCount = groups.reduce((n, g) => n + g.dates.length, 0);
  const campaignCount = groups.length;

  return (
    <div>
      {error && <div className={styles.errorMessage}>{error}</div>}

      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>
            Edition metrics{" "}
            <span className={styles.tableCount}>
              ({campaignCount} campaign{campaignCount === 1 ? "" : "s"}
              {sendDateCount !== campaignCount
                ? ` · ${sendDateCount} send dates`
                : ""}
              )
            </span>
          </span>
          <span className={styles.tableCount}>
            Clicks count when a recipient opens a newsletter link in the
            browser. Opens require the tracking pixel and are approximate.
            Expand a campaign to see each send date.
          </span>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Campaign</th>
                <th className={styles.th}>Sent</th>
                <th className={styles.th}>Sends</th>
                <th className={styles.th}>Recipients</th>
                <th className={styles.th}>Clicks</th>
                <th className={styles.th}>Clickers</th>
                <th className={styles.th}>CTR</th>
                <th className={`${styles.th} ${styles.hideNarrow}`}>Opens</th>
                <th className={`${styles.th} ${styles.hideNarrow}`}>Page views</th>
                <th className={styles.th}>Opt-outs</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className={styles.emptyState}>
                    <Loader size="sm" color="dark" /> Loading metrics…
                  </td>
                </tr>
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={10} className={styles.emptyState}>
                    No campaign metrics yet. Metrics appear after the first
                    tracked send (migration 117).
                  </td>
                </tr>
              ) : (
                groups.map((group) => {
                  const multi = group.dates.length > 1;
                  const familyOpen = expandedFamily === group.family;
                  const leaf = group.dates[0];
                  const parentItem = multi ? group.totals : leaf.totals;
                  const leafDateKey = `${group.family}:${leaf.dateKey}`;
                  const parentOpen = !multi && expandedDateKey === leafDateKey;
                  const leafCampaigns = leaf.editions.map((e) => e.campaign);

                  return (
                    <Fragment key={group.family}>
                      <tr
                        className={styles.rowClickable}
                        onClick={() =>
                          multi
                            ? toggleFamily(group.family)
                            : toggleDrilldown(leafDateKey, leafCampaigns)
                        }
                        title={
                          multi
                            ? "Click to show editions by date"
                            : "Click to show top links"
                        }
                        aria-expanded={multi ? familyOpen : parentOpen}
                      >
                        <td className={styles.td}>
                          <div>
                            {multi && (
                              <span
                                className={`${styles.chevron} ${
                                  familyOpen ? styles.chevronOpen : ""
                                }`}
                                aria-hidden
                              >
                                ▶
                              </span>
                            )}
                            {multi
                              ? group.label
                              : dateRowLabel(group.family, leaf.dateKey)}
                          </div>
                          <div className={styles.muted} style={{ fontSize: 11 }}>
                            {multi
                              ? `${group.dates.length} send dates${
                                  parentItem.source
                                    ? ` · ${parentItem.source}`
                                    : ""
                                }`
                              : `${
                                  leafCampaigns.length > 1
                                    ? `${leafCampaigns.length} send batches`
                                    : leafCampaigns[0]
                                }${
                                  parentItem.source
                                    ? ` · ${parentItem.source}`
                                    : ""
                                }`}
                          </div>
                        </td>
                        <td className={styles.td}>
                          {multi
                            ? formatDateRange(
                                parentItem.first_sent_at,
                                parentItem.last_sent_at,
                              )
                            : formatWhen(parentItem.first_sent_at)}
                        </td>
                        <MetricValueCells item={parentItem} />
                      </tr>
                      {multi &&
                        familyOpen &&
                        group.dates.map((bucket) => {
                          const dateKey = `${group.family}:${bucket.dateKey}`;
                          const campaigns = bucket.editions.map(
                            (e) => e.campaign,
                          );
                          return (
                            <Fragment key={dateKey}>
                              <tr
                                className={`${styles.rowClickable} ${styles.nestedRow}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleDrilldown(dateKey, campaigns);
                                }}
                                title="Click to show top links"
                                aria-expanded={expandedDateKey === dateKey}
                              >
                                <td className={styles.td}>
                                  <div>
                                    {dateRowLabel(group.family, bucket.dateKey)}
                                  </div>
                                  {bucket.totals.source && (
                                    <div
                                      className={styles.muted}
                                      style={{ fontSize: 11 }}
                                    >
                                      {bucket.totals.source}
                                    </div>
                                  )}
                                </td>
                                <td className={styles.td}>
                                  {formatWhen(bucket.totals.first_sent_at)}
                                </td>
                                <MetricValueCells item={bucket.totals} />
                              </tr>
                              {expandedDateKey === dateKey && (
                                <tr>
                                  <td
                                    colSpan={10}
                                    className={styles.td}
                                    style={{
                                      background: "var(--bg-secondary)",
                                    }}
                                  >
                                    <TopLinksPanel
                                      loading={linksLoading}
                                      links={links}
                                    />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      {!multi && expandedDateKey === leafDateKey && (
                        <tr>
                          <td
                            colSpan={10}
                            className={styles.td}
                            style={{ background: "var(--bg-secondary)" }}
                          >
                            <TopLinksPanel loading={linksLoading} links={links} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
