"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import {
  getNewsletterMetrics,
  getNewsletterMetricsTopLinks,
  type NewsletterMetricsItem,
  type NewsletterMetricsLink,
} from "@/lib/apiClient";
import Loader from "@/components/Loader";
import styles from "./NewsletterAdmin.module.css";

const PAGE_SIZE = 25;

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

/** Human label for a campaign string like weekly_2026-08-02 / substack_migration_abc123. */
function campaignLabel(campaign: string): string {
  if (campaign.startsWith("substack_migration_")) return "Substack migration";
  if (campaign.startsWith("weekly_")) return `Weekly ${campaign.slice(7)}`;
  if (campaign.startsWith("monthly_")) return `Monthly ${campaign.slice(8)}`;
  if (campaign.startsWith("sample_")) return `Sample ${campaign.slice(7)}`;
  return campaign;
}

export default function NewsletterAdminMetricsTab() {
  const { getAccessTokenSilently } = useAuth0();
  const [items, setItems] = useState<NewsletterMetricsItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drilldown state
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [links, setLinks] = useState<NewsletterMetricsLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();
      const res = await getNewsletterMetrics(token, { page, page_size: PAGE_SIZE });
      setItems(res.items);
      setPages(res.pages);
      setTotal(res.total);
    } catch (err) {
      console.error("Error loading newsletter metrics:", err);
      setError(err instanceof Error ? err.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently, page]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleDrilldown = useCallback(
    async (campaign: string) => {
      if (expandedCampaign === campaign) {
        setExpandedCampaign(null);
        setLinks([]);
        return;
      }
      setExpandedCampaign(campaign);
      setLinks([]);
      setLinksLoading(true);
      try {
        const token = await getAccessTokenSilently();
        const res = await getNewsletterMetricsTopLinks(token, campaign);
        setLinks(res);
      } catch (err) {
        console.error("Error loading top links:", err);
        setLinks([]);
      } finally {
        setLinksLoading(false);
      }
    },
    [expandedCampaign, getAccessTokenSilently]
  );

  return (
    <div>
      {error && <div className={styles.errorMessage}>{error}</div>}

      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>
            Edition metrics{" "}
            <span className={styles.tableCount}>({total} campaigns)</span>
          </span>
          <span className={styles.tableCount}>
            Clicks count when a recipient opens a newsletter link in the
            browser. Opens require the tracking pixel and are approximate.
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
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className={styles.emptyState}>
                    No campaign metrics yet. Metrics appear after the first
                    tracked send (migration 117).
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <Fragment key={item.campaign}>
                    <tr
                      className={styles.rowClickable}
                      onClick={() => toggleDrilldown(item.campaign)}
                      title="Click to show top links"
                    >
                      <td className={styles.td}>
                        <div>{campaignLabel(item.campaign)}</div>
                        <div className={styles.muted} style={{ fontSize: 11 }}>
                          {item.campaign}
                          {item.source ? ` · ${item.source}` : ""}
                        </div>
                      </td>
                      <td className={styles.td}>{formatWhen(item.first_sent_at)}</td>
                      <td className={styles.td}>{item.sends.toLocaleString()}</td>
                      <td className={styles.td}>
                        {item.unique_recipients.toLocaleString()}
                      </td>
                      <td className={styles.td}>{item.clicks.toLocaleString()}</td>
                      <td className={styles.td}>
                        {item.unique_clickers.toLocaleString()}
                      </td>
                      <td className={styles.td}>
                        {item.click_through_rate != null &&
                        item.click_through_rate >= 0.1 ? (
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
                        {item.page_views > 0
                          ? item.page_views.toLocaleString()
                          : "\u2014"}
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
                    </tr>
                    {expandedCampaign === item.campaign && (
                      <tr>
                        <td colSpan={10} className={styles.td} style={{ background: "var(--bg-secondary)" }}>
                          {linksLoading ? (
                            <span className={styles.muted}>
                              <Loader size="sm" color="dark" /> Loading top links…
                            </span>
                          ) : links.length === 0 ? (
                            <span className={styles.muted}>
                              No tracked clicks for this campaign yet.
                            </span>
                          ) : (
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
                                    <td className={styles.td}>
                                      {l.slot || "\u2014"}
                                    </td>
                                    <td className={styles.td}>{l.clicks}</td>
                                    <td className={styles.td}>{l.unique_clickers}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div
            className={styles.tableHeader}
            style={{ borderBottom: "none", borderTop: "1px solid var(--border-primary)" }}
          >
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
            >
              ← Prev
            </button>
            <span className={styles.tableCount}>
              Page {page} of {pages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages || loading}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
