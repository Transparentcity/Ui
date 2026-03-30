"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type FeedStory,
  type CityWithFeedStories,
  listFeedStories,
  listCitiesWithFeedStories,
  deleteFeedStory,
  deleteFeedStoriesByCity,
} from "@/lib/api/feed";
import Loader from "@/components/Loader";
import styles from "./FeedAdmin.module.css";

type TimeRange = "day" | "week" | "month" | "all";
type ExportTimeRange = "today" | "week" | "month" | "year" | "all";

const TIME_RANGE_MS: Record<Exclude<TimeRange, "all">, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

const EXPORT_TIME_RANGE_MS: Record<Exclude<ExportTimeRange, "all">, number> = {
  today: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

function formatDate(value?: string | null): string {
  if (!value) return "\u2014";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString();
}

function extractVisualizationUrl(viz: Record<string, any> | null | undefined): string {
  if (!viz) return "";
  return viz.url || viz.image_url || viz.src || viz.chart_url || viz.embed_url || "";
}

function escapeCSV(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function filterByTime(stories: FeedStory[], range: TimeRange | ExportTimeRange, rangeMap: Record<string, number>): FeedStory[] {
  if (range === "all") return stories;
  const ms = rangeMap[range];
  if (!ms) return stories;
  const cutoff = Date.now() - ms;
  return stories.filter((s) => {
    const d = new Date(s.story_date).getTime();
    return !Number.isNaN(d) && d >= cutoff;
  });
}

const PAGE_SIZE = 50;
const FETCH_BATCH = 200;

export default function FeedAdmin() {
  const { getAccessTokenSilently } = useAuth0();

  const [stories, setStories] = useState<FeedStory[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [cities, setCities] = useState<CityWithFeedStories[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Table filters
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);

  // Table pagination
  const [page, setPage] = useState(0);

  // Export state
  const [showExport, setShowExport] = useState(false);
  const [exportCityId, setExportCityId] = useState<number | null>(null);
  const [exportTimeRange, setExportTimeRange] = useState<ExportTimeRange>("all");

  // Delete state
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();

      // Fetch cities in parallel with first batch of stories
      const [firstBatch, citiesRes] = await Promise.all([
        listFeedStories(token, { all_cities: true, limit: FETCH_BATCH, offset: 0, order_by: "story_date:desc" }),
        listCitiesWithFeedStories(token),
      ]);

      let allStories = [...firstBatch.stories];
      const total = firstBatch.count;
      setTotalCount(total);
      setCities(citiesRes);

      // Fetch remaining pages if there are more stories
      if (total > FETCH_BATCH) {
        const remaining = Math.ceil((total - FETCH_BATCH) / FETCH_BATCH);
        for (let i = 1; i <= remaining; i++) {
          const batch = await listFeedStories(token, {
            all_cities: true,
            limit: FETCH_BATCH,
            offset: i * FETCH_BATCH,
            order_by: "story_date:desc",
          });
          allStories = [...allStories, ...batch.stories];
          if (batch.stories.length < FETCH_BATCH) break;
        }
      }

      setStories(allStories);
    } catch (err: any) {
      setError(err?.message || "Failed to load feed data");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Stats
  const stats = useMemo(() => {
    const now = Date.now();
    const day = now - 24 * 60 * 60 * 1000;
    const week = now - 7 * 24 * 60 * 60 * 1000;
    let last24h = 0;
    let last7d = 0;
    for (const s of stories) {
      const d = new Date(s.story_date).getTime();
      if (Number.isNaN(d)) continue;
      if (d >= day) last24h++;
      if (d >= week) last7d++;
    }
    return { total: totalCount || stories.length, last24h, last7d };
  }, [stories, totalCount]);

  // Filtered stories for table
  const filteredStories = useMemo(() => {
    let result = filterByTime(stories, timeRange, TIME_RANGE_MS);
    if (selectedCityId !== null) {
      result = result.filter((s) => s.city_id === selectedCityId);
    }
    return result;
  }, [stories, timeRange, selectedCityId]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [timeRange, selectedCityId]);

  // Paginated slice for table display
  const totalPages = Math.max(1, Math.ceil(filteredStories.length / PAGE_SIZE));
  const pagedStories = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filteredStories.slice(start, start + PAGE_SIZE);
  }, [filteredStories, page]);

  // Delete single story
  const handleDeleteStory = useCallback(
    async (storyId: number, headline: string) => {
      const confirmed = window.confirm(`Delete story "${headline}"?\n\nThis cannot be undone.`);
      if (!confirmed) return;
      try {
        setDeletingId(storyId);
        const token = await getAccessTokenSilently();
        await deleteFeedStory(storyId, token);
        setStories((prev) => prev.filter((s) => s.id !== storyId));
      } catch (err: any) {
        alert(`Failed to delete story: ${err?.message || "Unknown error"}`);
      } finally {
        setDeletingId(null);
      }
    },
    [getAccessTokenSilently],
  );

  // Bulk delete stories for a city
  const handleBulkDelete = useCallback(async () => {
    if (selectedCityId === null) return;
    const city = cities.find((c) => c.city_id === selectedCityId);
    const cityName = city?.city_name || `City ${selectedCityId}`;
    const count = filteredStories.length;
    const confirmed = window.confirm(
      `Delete ALL ${count} stories for ${cityName}?\n\nThis cannot be undone.`,
    );
    if (!confirmed) return;
    try {
      setBulkDeleting(true);
      const token = await getAccessTokenSilently();
      await deleteFeedStoriesByCity(selectedCityId, token);
      setStories((prev) => prev.filter((s) => s.city_id !== selectedCityId));
    } catch (err: any) {
      alert(`Failed to delete stories: ${err?.message || "Unknown error"}`);
    } finally {
      setBulkDeleting(false);
    }
  }, [selectedCityId, cities, filteredStories.length, getAccessTokenSilently]);

  // CSV export
  const handleExport = useCallback(() => {
    let toExport = stories;

    // Filter by city
    if (exportCityId !== null) {
      toExport = toExport.filter((s) => s.city_id === exportCityId);
    }

    // Filter by time
    toExport = filterByTime(toExport, exportTimeRange, EXPORT_TIME_RANGE_MS);

    const header = "date,city,headline,story_type,link,story_text,image_chart_url";
    const rows = toExport.map((s) => {
      const text = s.summary || s.description || "";
      const vizUrl = extractVisualizationUrl(s.primary_visualization);
      const link = s.detail_url.startsWith("http") ? s.detail_url : `${window.location.origin}${s.detail_url}`;
      return [
        escapeCSV(s.story_date || ""),
        escapeCSV(s.city_name || ""),
        escapeCSV(s.headline || ""),
        escapeCSV(s.story_type || ""),
        escapeCSV(link),
        escapeCSV(text),
        escapeCSV(vizUrl),
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const cityLabel = exportCityId
      ? cities.find((c) => c.city_id === exportCityId)?.city_name || "city"
      : "all-cities";
    a.download = `feed-stories-${cityLabel}-${exportTimeRange}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExport(false);
  }, [stories, exportCityId, exportTimeRange, cities]);

  // Navigate to story
  const handleStoryClick = useCallback((detailUrl: string) => {
    if (detailUrl.startsWith("http")) {
      window.open(detailUrl, "_blank");
    } else {
      window.open(detailUrl, "_blank");
    }
  }, []);

  if (loading) {
    return (
      <div className={styles.feedAdmin} style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200, gap: 8 }}>
        <Loader size="sm" color="dark" />
        <span>Loading feed data...</span>
      </div>
    );
  }

  return (
    <div className={styles.feedAdmin}>
      {error && <div className={styles.errorMessage}>{error}</div>}

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardInner}>
              <svg className={styles.statIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                <path d="M18 14h-8" /><path d="M15 18h-5" /><path d="M10 6h8v4h-8V6Z" />
              </svg>
              <div className={styles.statText}>
                <div className={styles.statLabel}>Total Stories</div>
                <div className={styles.statValue}>{stats.total.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardInner}>
              <svg className={styles.statIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <div className={styles.statText}>
                <div className={styles.statLabel}>Last 24 Hours</div>
                <div className={styles.statValue}>{stats.last24h.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardInner}>
              <svg className={styles.statIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <div className={styles.statText}>
                <div className={styles.statLabel}>Last 7 Days</div>
                <div className={styles.statValue}>{stats.last7d.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filtersContainer}>
        <div className={styles.filtersRow}>
          <select
            className={styles.select}
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
          >
            <option value="all">All Time</option>
            <option value="day">Last 24 Hours</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
          </select>

          <select
            className={styles.select}
            value={selectedCityId ?? ""}
            onChange={(e) => setSelectedCityId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">All Cities</option>
            {cities.map((c) => (
              <option key={c.city_id} value={c.city_id}>
                {c.city_name} ({c.story_count})
              </option>
            ))}
          </select>

          <button className={styles.secondaryBtn} onClick={() => setShowExport(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>

          {selectedCityId !== null && (
            <button
              className={styles.dangerBtn}
              onClick={handleBulkDelete}
              disabled={bulkDeleting || filteredStories.length === 0}
            >
              {bulkDeleting ? "Deleting..." : `Delete All for City (${filteredStories.length})`}
            </button>
          )}

          <button className={styles.secondaryBtn} onClick={loadData} style={{ marginLeft: "auto" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Stories Table */}
      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>
            Feed Stories <span className={styles.tableCount}>({filteredStories.length})</span>
          </span>
        </div>
        <div className={styles.tableWrapper}>
          {filteredStories.length === 0 ? (
            <div className={styles.emptyState}>No stories found for the selected filters.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Date</th>
                  <th className={styles.th}>City</th>
                  <th className={styles.th}>Headline</th>
                  <th className={styles.th}>Type</th>
                  <th className={`${styles.th} ${styles.hideNarrow}`}>Views</th>
                  <th className={`${styles.th} ${styles.hideNarrow}`}>Clicks</th>
                  <th className={styles.th} style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {pagedStories.map((story) => (
                  <tr
                    key={story.id}
                    className={styles.rowClickable}
                    onClick={() => handleStoryClick(story.detail_url)}
                    tabIndex={0}
                    role="link"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleStoryClick(story.detail_url);
                    }}
                  >
                    <td className={styles.td}>
                      <span className={styles.muted}>{formatDate(story.story_date)}</span>
                    </td>
                    <td className={styles.td}>
                      {story.city_emoji ? `${story.city_emoji} ` : ""}{story.city_name || "\u2014"}
                    </td>
                    <td className={styles.td}>
                      <span className={styles.headline}>{story.headline}</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.badge}>{story.story_type}</span>
                    </td>
                    <td className={`${styles.td} ${styles.hideNarrow}`}>
                      {story.view_count.toLocaleString()}
                    </td>
                    <td className={`${styles.td} ${styles.hideNarrow}`}>
                      {story.click_count.toLocaleString()}
                    </td>
                    <td className={styles.td}>
                      <button
                        className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                        title="Delete story"
                        disabled={deletingId === story.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteStory(story.id, story.headline);
                        }}
                      >
                        {deletingId === story.id ? (
                          <Loader size="sm" color="dark" />
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {/* Pagination controls */}
        {filteredStories.length > PAGE_SIZE && (
          <div className={styles.pagination}>
            <button
              className={styles.secondaryBtn}
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </button>
            <span className={styles.pageInfo}>
              Page {page + 1} of {totalPages} ({filteredStories.length} stories)
            </span>
            <button
              className={styles.secondaryBtn}
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Export Modal */}
      {showExport && (
        <div className={styles.exportOverlay} onClick={() => setShowExport(false)}>
          <div className={styles.exportPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.exportTitle}>Export Feed Stories to CSV</div>

            <div className={styles.exportField}>
              <label className={styles.exportLabel}>City</label>
              <select
                className={styles.exportSelect}
                value={exportCityId ?? ""}
                onChange={(e) => setExportCityId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">All Cities</option>
                {cities.map((c) => (
                  <option key={c.city_id} value={c.city_id}>
                    {c.city_name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.exportField}>
              <label className={styles.exportLabel}>Time Range</label>
              <select
                className={styles.exportSelect}
                value={exportTimeRange}
                onChange={(e) => setExportTimeRange(e.target.value as ExportTimeRange)}
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Last Week</option>
                <option value="month">Last Month</option>
                <option value="year">Last Year</option>
              </select>
            </div>

            <div className={styles.exportActions}>
              <button className={styles.secondaryBtn} onClick={() => setShowExport(false)}>
                Cancel
              </button>
              <button className={styles.primaryBtn} onClick={handleExport}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
