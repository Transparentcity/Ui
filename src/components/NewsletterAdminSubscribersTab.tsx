"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  adminQueueNewsletterPendingForUser,
  getAdminUserNewsletterOverview,
  getAdminUserNewsletterSendHistory,
  getAvailableModels,
  getOutboundEmail,
  getNewsletterPendingDetail,
  listCities,
  listUsers,
  updateUser,
  type AdminNewsletterHistoryItem,
  type AdminUserNewsletterOverview,
  type CityListItem,
  type NewsletterSubscription,
  type User,
} from "@/lib/apiClient";
import Loader from "@/components/Loader";
import JobSessionDebugLink from "@/components/JobSessionDebugLink";
import styles from "./NewsletterAdmin.module.css";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function commBool(v: unknown): string {
  return typeof v === "boolean" ? (v ? "On" : "Off") : "\u2014";
}

function emailUsername(email: string | null | undefined): string {
  if (!email) return "\u2014";
  const idx = email.indexOf("@");
  return idx > 0 ? email.slice(0, idx) : email;
}

function LlmCostPill({
  usage,
}: {
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
}) {
  if (!usage) return <span style={{ color: "var(--text-tertiary, #aaa)", fontSize: 11 }}>\u2014</span>;
  const total = usage.total_tokens ?? (usage.prompt_tokens + usage.completion_tokens);
  const estCostUsd = (usage.prompt_tokens * 5 + usage.completion_tokens * 15) / 1_000_000;
  const costLabel = estCostUsd < 0.001 ? "<$0.001" : `~$${estCostUsd.toFixed(3)}`;
  return (
    <span
      title={`prompt: ${usage.prompt_tokens.toLocaleString()} · completion: ${usage.completion_tokens.toLocaleString()} tokens`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 11,
        fontWeight: 500,
        background: "var(--brand-primary-faint, rgba(173,53,250,0.07))",
        color: "var(--brand-primary, #ad35fa)",
        border: "1px solid var(--brand-primary-light, #e9c6ff)",
        borderRadius: 4,
        padding: "1px 5px",
        whiteSpace: "nowrap",
        cursor: "default",
      }}
    >
      {total.toLocaleString()} tok · {costLabel}
    </span>
  );
}

function getLocationLevel(ov: AdminUserNewsletterOverview | undefined): string {
  if (!ov) return "\u2014";
  const home = ov.home_location;
  if (!home) return "\u2014";
  const dist = home.district;
  if (dist !== undefined && dist !== null) {
    const n = Number(dist);
    if (!Number.isNaN(n) && n !== 0) return "District";
  }
  if (home.city_id != null) return "City";
  return "\u2014";
}

interface SubCounts {
  city: number;
  district: number;
  hasPrompt: boolean;
}

/** Text Seymour uses for this subscriber: DB ``custom_email_prompt`` first, else profile ``newsletter_description``. */
function effectiveSubscriberPromptText(ov: AdminUserNewsletterOverview): string {
  const custom = (ov.custom_email_prompt ?? "").trim();
  if (custom) return custom;
  return (ov.newsletter_description ?? "").trim();
}

function getSubCounts(ov: AdminUserNewsletterOverview | undefined): SubCounts | null {
  if (!ov) return null;
  const subs = ov.subscriptions;
  /** One city-wide follow per city_id (weekly + monthly rows are one logical city). */
  const cityWideCityIds = new Set<number>();
  /** One district follow per (city_id, district); ignore duplicate frequencies. */
  const districtKeys = new Set<string>();
  for (const s of subs) {
    const cityWide = !s.district || s.district === "0" || Number(s.district) === 0;
    if (cityWide) {
      cityWideCityIds.add(s.city_id);
    } else {
      districtKeys.add(`${s.city_id}:${String(s.district).trim()}`);
    }
  }
  const city = cityWideCityIds.size;
  const district = districtKeys.size;
  const hasPrompt = !!effectiveSubscriberPromptText(ov);
  return { city, district, hasPrompt };
}

function isDistrictNewsletterFollow(d: string | undefined | null): boolean {
  if (d === undefined || d === null) return false;
  const s = String(d).trim();
  if (!s || s === "0") return false;
  const n = Number(s);
  return !Number.isNaN(n) && n !== 0;
}

/** Distinct cities from active newsletter rows (city-wide or district). */
function formatFollowedCityNames(
  subs: NewsletterSubscription[] | undefined,
  cities: CityListItem[]
): string {
  if (!subs?.length) return "";
  const ids = [...new Set(subs.map((s) => s.city_id))].sort((a, b) => a - b);
  return ids
    .map((id) => cities.find((c) => c.city_id === id)?.city_name ?? `City ${id}`)
    .join(", ");
}

/** Distinct (city, district) pairs for non-citywide follows. */
function formatFollowedDistrictLabels(
  subs: NewsletterSubscription[] | undefined,
  cities: CityListItem[]
): string {
  if (!subs?.length) return "";
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const s of subs) {
    if (!isDistrictNewsletterFollow(s.district)) continue;
    const key = `${s.city_id}:${s.district}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cityName =
      cities.find((c) => c.city_id === s.city_id)?.city_name ?? `City ${s.city_id}`;
    parts.push(`${cityName} · District ${s.district}`);
  }
  parts.sort();
  return parts.join(", ");
}

export default function NewsletterAdminSubscribersTab() {
  const { getAccessTokenSilently } = useAuth0();
  const [users, setUsers] = useState<User[]>([]);
  const [cities, setCities] = useState<CityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [overview, setOverview] = useState<AdminUserNewsletterOverview | null>(null);
  const [history, setHistory] = useState<AdminNewsletterHistoryItem[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  /** Session for the row being previewed (outbox body preview), when the API provides one. */
  const [previewJobSessionId, setPreviewJobSessionId] = useState<string | null>(null);
  /** Cached overviews keyed by user ID — populated on first expand, retained for list row display. */
  const [overviewCache, setOverviewCache] = useState<Map<number, AdminUserNewsletterOverview>>(
    new Map()
  );
  const [savePromptBusy, setSavePromptBusy] = useState(false);

  const [testCityId, setTestCityId] = useState<number | null>(null);
  const [testDistrict, setTestDistrict] = useState("0");
  const [testFrequency, setTestFrequency] = useState<"weekly" | "monthly">("weekly");
  const [seymourModelKey, setSeymourModelKey] = useState("");
  const [seymourModelOptions, setSeymourModelOptions] = useState<{ key: string; name: string }[]>(
    []
  );
  const [testPrompt, setTestPrompt] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testTitle, setTestTitle] = useState<string | null>(null);

  const loadBase = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();
      const [u, c, modelGroups] = await Promise.all([
        listUsers(token, { limit: 500 }),
        listCities(token),
        getAvailableModels(token).catch(() => []),
      ]);
      setUsers(u);
      setCities(c.filter((x) => x.is_active !== false));
      const flat = modelGroups
        .flatMap((g) =>
          g.models.filter((m) => m.is_available).map((m) => ({ key: m.key, name: m.name }))
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      setSeymourModelOptions(flat);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load subscribers");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  // After the user list loads, background-fetch overview summaries for all users
  // so Location and Subscription columns populate without requiring a manual expand.
  useEffect(() => {
    if (users.length === 0) return;
    let cancelled = false;
    const BATCH = 10;
    const DELAY_MS = 150;

    (async () => {
      try {
        const token = await getAccessTokenSilently();
        for (let i = 0; i < users.length; i += BATCH) {
          if (cancelled) break;
          const batch = users.slice(i, i + BATCH);
          const results = await Promise.allSettled(
            batch.map((u) => getAdminUserNewsletterOverview(u.id, token))
          );
          if (cancelled) break;
          setOverviewCache((prev) => {
            const next = new Map(prev);
            results.forEach((r, idx) => {
              if (r.status === "fulfilled") next.set(batch[idx].id, r.value);
            });
            return next;
          });
          if (i + BATCH < users.length) {
            await new Promise((res) => setTimeout(res, DELAY_MS));
          }
        }
      } catch {
        // Background load failures are silent — data still appears on expand
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [users, getAccessTokenSilently]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.email || "").toLowerCase().includes(q) ||
        (u.name || "").toLowerCase().includes(q) ||
        String(u.id).includes(q)
    );
  }, [users, search]);

  const loadDetail = useCallback(
    async (userId: number) => {
      setDetailLoading(true);
      setOverview(null);
      setHistory([]);
      setPreviewHtml(null);
      setPreviewJobSessionId(null);
      setTestTitle(null);
      try {
        const token = await getAccessTokenSilently();
        const [ov, hi] = await Promise.all([
          getAdminUserNewsletterOverview(userId, token),
          getAdminUserNewsletterSendHistory(userId, token, { limit: 80 }),
        ]);
        setOverview(ov);
        setHistory(hi.items);
        setOverviewCache((prev) => new Map(prev).set(userId, ov));
        const home = ov.home_location;
        setTestCityId(
          home?.city_id != null && Number.isFinite(Number(home.city_id))
            ? Number(home.city_id)
            : null
        );
        const d = home?.district;
        const dStr = d === undefined || d === null ? "" : String(d).trim();
        setTestDistrict(dStr && dStr !== "0" ? dStr : "0");
        setTestFrequency(ov.newsletter_frequency === "monthly" ? "monthly" : "weekly");
        setTestPrompt(effectiveSubscriberPromptText(ov));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Failed to load user newsletter data");
        setExpandedId(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [getAccessTokenSilently]
  );

  useEffect(() => {
    if (expandedId == null) return;
    loadDetail(expandedId);
  }, [expandedId, loadDetail]);

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleSavePromptToPreferences = useCallback(
    async (userId: number) => {
      setSavePromptBusy(true);
      try {
        const token = await getAccessTokenSilently();
        await updateUser(userId, { custom_email_prompt: testPrompt.trim() || null }, token);
        const fresh = await getAdminUserNewsletterOverview(userId, token);
        setOverview(fresh);
        setOverviewCache((prev) => new Map(prev).set(userId, fresh));
        setTestPrompt(effectiveSubscriberPromptText(fresh));
        toast.success("Personal email prompt saved to user preferences.");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Failed to save personal email prompt");
      } finally {
        setSavePromptBusy(false);
      }
    },
    [getAccessTokenSilently, testPrompt]
  );

  const handlePreviewOutbound = async (item: AdminNewsletterHistoryItem) => {
    const canPreviewOutbound = item.type === "outbound_email" && typeof item.id === "number";
    const canPreviewPending = item.type === "newsletter_send" && typeof item.pending_send_id === "number";
    if (!canPreviewOutbound && !canPreviewPending) return;
    setPreviewLoading(true);
    setPreviewHtml(null);
    const sid = item.session_id?.trim();
    setPreviewJobSessionId(sid || null);
    try {
      const token = await getAccessTokenSilently();
      if (canPreviewOutbound) {
        const detail = await getOutboundEmail(item.id as number, token);
        setPreviewHtml(detail.body_html || detail.body_plain || "(empty)");
      } else {
        const detail = await getNewsletterPendingDetail(item.pending_send_id as number, token);
        setPreviewHtml(detail.body_html || "(empty)");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load email body");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGenerateNewsletter = async (userId: number) => {
    if (!testCityId) {
      toast.error("Select a city for the newsletter.");
      return;
    }
    const cityName =
      cities.find((c) => c.city_id === testCityId)?.city_name || "City";
    const districtLabel =
      testDistrict === "0" ? "citywide" : `District ${testDistrict}`;
    const trimmed = testPrompt.trim();
    const promptOverride = trimmed
      ? `For ${cityName} (${districtLabel}). ${trimmed}`
      : null;

    setTestBusy(true);
    setTestTitle(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await adminQueueNewsletterPendingForUser(
        userId,
        {
          city_id: testCityId,
          district: testDistrict === "0" ? null : Number(testDistrict),
          frequency: testFrequency,
          prompt_override: promptOverride,
          generation_mode: "seymour",
          ...(seymourModelKey.trim()
            ? { seymour_model_key: seymourModelKey.trim() }
            : {}),
        },
        token
      );
      setTestTitle(res.job_id);
      toast.success(
        "Newsletter generation queued. It will appear in Pending on the dashboard when ready."
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not queue newsletter");
    } finally {
      setTestBusy(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 12 }}>
        <Loader size="md" color="dark" />
        <span>Loading subscribers…</span>
      </div>
    );
  }

  if (error) {
    return <div className={styles.errorMessage}>{error}</div>;
  }

  const cp = overview?.communication_preferences || {};

  return (
    <>
      <div className={styles.infoBox}>
        Each subscriber&apos;s email newsletter settings (communication preferences and district subscriptions), saved
        places count (all pins in My Places, including default saved-place labels such as My place), which cities and districts they follow, past sends in
        the outbox / newsletter_sends tables, and admin-generated drafts (queued to Pending on the dashboard). Users can
        also change preferences in their profile or via unsubscribe links.
      </div>

      <div className={styles.filtersContainer}>
        <div className={styles.filtersRow}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search by email, name, or user id…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Filter subscribers"
          />
        </div>
      </div>

      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>Subscribers </span>
          <span className={styles.tableCount}>({filtered.length})</span>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th} style={{ width: 28 }} aria-hidden />
                <th className={styles.th}>User</th>
                <th className={styles.th}>Location</th>
                <th className={styles.th}>Saved places</th>
                <th className={styles.th}>Subscriptions</th>
                <th className={styles.th}>Active</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.emptyState}>
                    No users match
                  </td>
                </tr>
              )}
              {filtered.map((u) => {
                const open = expandedId === u.id;
                return (
                  <UserNewsletterRow
                    key={u.id}
                    user={u}
                    open={open}
                    onToggle={() => toggleExpand(u.id)}
                    detailLoading={open && detailLoading}
                    overview={open ? overview : null}
                    cachedOverview={overviewCache.get(u.id)}
                    history={open ? history : []}
                    cities={cities}
                    testCityId={testCityId}
                    testDistrict={testDistrict}
                    testFrequency={testFrequency}
                    seymourModelKey={seymourModelKey}
                    seymourModelOptions={seymourModelOptions}
                    testPrompt={testPrompt}
                    testBusy={testBusy}
                    savePromptBusy={savePromptBusy}
                    testTitle={testTitle}
                    previewHtml={previewHtml}
                    previewLoading={previewLoading}
                    cp={open ? cp : {}}
                    onTestCityId={setTestCityId}
                    onTestDistrict={setTestDistrict}
                    onTestFrequency={setTestFrequency}
                    onSeymourModelKey={setSeymourModelKey}
                    onTestPrompt={setTestPrompt}
                    onGenerateNewsletter={() => handleGenerateNewsletter(u.id)}
                    onSavePromptToPreferences={() => handleSavePromptToPreferences(u.id)}
                    onPreviewOutbound={handlePreviewOutbound}
                    previewJobSessionId={previewJobSessionId}
                    onClosePreview={() => {
                      setPreviewHtml(null);
                      setPreviewJobSessionId(null);
                    }}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function UserNewsletterRow({
  user,
  open,
  onToggle,
  detailLoading,
  overview,
  cachedOverview,
  history,
  cities,
  testCityId,
  testDistrict,
  testFrequency,
  seymourModelKey,
  seymourModelOptions,
  testPrompt,
  testBusy,
  savePromptBusy,
  testTitle,
  previewHtml,
  previewLoading,
  cp,
  onTestCityId,
  onTestDistrict,
  onTestFrequency,
  onSeymourModelKey,
  onTestPrompt,
  onGenerateNewsletter,
  onSavePromptToPreferences,
  onPreviewOutbound,
  previewJobSessionId,
  onClosePreview,
}: {
  user: User;
  open: boolean;
  onToggle: () => void;
  detailLoading: boolean;
  overview: AdminUserNewsletterOverview | null;
  cachedOverview: AdminUserNewsletterOverview | undefined;
  history: AdminNewsletterHistoryItem[];
  cities: CityListItem[];
  testCityId: number | null;
  testDistrict: string;
  testFrequency: "weekly" | "monthly";
  seymourModelKey: string;
  seymourModelOptions: { key: string; name: string }[];
  testPrompt: string;
  testBusy: boolean;
  savePromptBusy: boolean;
  testTitle: string | null;
  previewHtml: string | null;
  previewLoading: boolean;
  cp: Record<string, unknown>;
  onTestCityId: (id: number | null) => void;
  onTestDistrict: (v: string) => void;
  onTestFrequency: (v: "weekly" | "monthly") => void;
  onSeymourModelKey: (v: string) => void;
  onTestPrompt: (v: string) => void;
  onGenerateNewsletter: () => void;
  onSavePromptToPreferences: () => void;
  onPreviewOutbound: (item: AdminNewsletterHistoryItem) => void;
  previewJobSessionId: string | null;
  onClosePreview: () => void;
}) {
  const locationLevel = getLocationLevel(cachedOverview);
  const subCounts = getSubCounts(cachedOverview);
  const cityNamesLine =
    cachedOverview &&
    formatFollowedCityNames(cachedOverview.subscriptions, cities).trim();
  const districtNamesLine =
    cachedOverview &&
    formatFollowedDistrictLabels(cachedOverview.subscriptions, cities).trim();
  const savedPlacesCount =
    cachedOverview?.saved_places_count !== undefined
      ? cachedOverview.saved_places_count
      : null;

  return (
    <>
      <tr className={styles.rowClickable} onClick={onToggle}>
        <td className={styles.td} style={{ textAlign: "center", fontSize: 10 }}>
          {open ? "\u25BC" : "\u25B6"}
        </td>
        <td className={styles.td}>{emailUsername(user.email)}</td>
        <td className={styles.td}>
          {cachedOverview === undefined ? (
            <span className={styles.muted}>\u2014</span>
          ) : (
            <span
              className={`${styles.badge} ${
                locationLevel === "District"
                  ? styles.badgeBlue
                  : locationLevel === "City"
                  ? styles.badgeGreen
                  : styles.badgeGray
              }`}
            >
              {locationLevel}
            </span>
          )}
        </td>
        <td className={styles.td}>
          {savedPlacesCount === null ? (
            <span className={styles.muted}>\u2014</span>
          ) : savedPlacesCount === 0 ? (
            <span className={`${styles.badge} ${styles.badgeGray}`}>0</span>
          ) : (
            <span className={`${styles.badge} ${styles.badgeYellow}`}>{savedPlacesCount}</span>
          )}
        </td>
        <td className={styles.td}>
          {subCounts === null ? (
            <span className={styles.muted}>\u2014</span>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
              <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                {subCounts.city > 0 && (
                  <span className={`${styles.badge} ${styles.badgeGreen}`}>
                    {subCounts.city} city
                  </span>
                )}
                {subCounts.district > 0 && (
                  <span className={`${styles.badge} ${styles.badgeBlue}`}>
                    {subCounts.district} district
                  </span>
                )}
                {subCounts.hasPrompt && (
                  <span className={`${styles.badge} ${styles.badgeYellow}`}>
                    custom prompt
                  </span>
                )}
                {subCounts.city === 0 && subCounts.district === 0 && !subCounts.hasPrompt && (
                  <span className={`${styles.badge} ${styles.badgeGray}`}>none</span>
                )}
              </span>
              {cachedOverview && (cityNamesLine || districtNamesLine) ? (
                <div
                  style={{
                    fontSize: 11,
                    lineHeight: 1.35,
                    color: "var(--text-secondary, #666)",
                    maxWidth: 420,
                  }}
                >
                  {cityNamesLine ? (
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--text-primary, #111)" }}>
                        Cities:{" "}
                      </span>
                      {cityNamesLine}
                    </div>
                  ) : null}
                  {districtNamesLine ? (
                    <div style={{ marginTop: cityNamesLine ? 2 : 0 }}>
                      <span style={{ fontWeight: 600, color: "var(--text-primary, #111)" }}>
                        Districts:{" "}
                      </span>
                      {districtNamesLine}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </td>
        <td className={styles.td}>{user.is_active ? "Yes" : "No"}</td>
      </tr>
      {open && (
        <tr className={styles.expandedRow}>
          <td colSpan={6} className={styles.td} style={{ padding: 0, verticalAlign: "top" }}>
            <div className={styles.expandedContent} onClick={(e) => e.stopPropagation()}>
              {detailLoading && (
                <div className="tc-loading-state" style={{ padding: 16, gap: 8 }}>
                  <Loader size="sm" color="dark" />
                  <span>Loading newsletter data…</span>
                </div>
              )}
              {!detailLoading && overview && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>
                      Email &amp; communication preferences
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                        gap: "8px 16px",
                        fontSize: 13,
                        color: "var(--text-secondary)",
                      }}
                    >
                      <div>
                        <strong style={{ color: "var(--text-primary)" }}>Anomaly alerts</strong>
                        <div>{commBool(cp.anomaly_alerts)}</div>
                      </div>
                      <div>
                        <strong style={{ color: "var(--text-primary)" }}>Weekly digest</strong>
                        <div>{commBool(cp.weekly_digest)}</div>
                      </div>
                      <div>
                        <strong style={{ color: "var(--text-primary)" }}>Monthly report</strong>
                        <div>{commBool(cp.monthly_report)}</div>
                      </div>
                      <div>
                        <strong style={{ color: "var(--text-primary)" }}>Report scope</strong>
                        <div>
                          {typeof cp.report_scope === "string" ? cp.report_scope : "\u2014"}
                        </div>
                      </div>
                      <div>
                        <strong style={{ color: "var(--text-primary)" }}>Newsletter frequency</strong>
                        <div>{overview.newsletter_frequency}</div>
                      </div>
                      <div>
                        <strong style={{ color: "var(--text-primary)" }}>Home location</strong>
                        <div>
                          {overview.home_location?.city_id != null
                            ? `City ${overview.home_location.city_id}${
                                (() => {
                                  const dist = overview.home_location?.district;
                                  if (dist === undefined || dist === null) return "";
                                  const n = Number(dist);
                                  return !Number.isNaN(n) && n !== 0 ? ` · D${dist}` : "";
                                })()
                              }`
                            : "\u2014"}
                        </div>
                      </div>
                    </div>
                    {effectiveSubscriberPromptText(overview) ? (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>
                          Personalized newsletter prompt
                          {overview.custom_email_prompt?.trim() ? (
                            <span
                              style={{
                                marginLeft: 8,
                                fontWeight: 500,
                                color: "var(--text-secondary)",
                              }}
                            >
                              (admin-saved override)
                            </span>
                          ) : null}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            color: "var(--text-secondary)",
                            whiteSpace: "pre-wrap",
                            maxHeight: 120,
                            overflow: "auto",
                            padding: 8,
                            background: "var(--bg-primary)",
                            borderRadius: 8,
                            border: "1px solid var(--border-primary)",
                          }}
                        >
                          {effectiveSubscriberPromptText(overview)}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>
                      District / city subscriptions ({overview.subscriptions.length})
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-secondary)",
                        marginBottom: 10,
                        lineHeight: 1.45,
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        Saved places
                      </span>
                      {": "}
                      {overview.saved_places_count ?? 0}
                      {" (all My Places rows, including saved places). "}
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Cities</span>
                      {": "}
                      {formatFollowedCityNames(overview.subscriptions, cities) || "—"}
                      {" · "}
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Districts</span>
                      {": "}
                      {formatFollowedDistrictLabels(overview.subscriptions, cities) || "—"}
                    </div>
                    {overview.subscriptions.length === 0 ? (
                      <span className={styles.muted}>No active rows in newsletter_subscribers.</span>
                    ) : (
                      <table className={styles.subTable}>
                        <thead>
                          <tr>
                            <th>City ID</th>
                            <th>District</th>
                            <th>Frequency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overview.subscriptions.map((s, i) => (
                            <tr key={`${s.city_id}-${s.district}-${s.frequency}-${i}`}>
                              <td>{s.city_id}</td>
                              <td>{s.district}</td>
                              <td>{s.frequency}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>
                      Generate newsletter for this user
                    </div>
                    {!user.email?.trim() ? (
                      <p className={styles.muted} style={{ marginBottom: 12 }}>
                        This account has no email; generation is not available.
                      </p>
                    ) : null}
                    <div className={styles.testPanelRow} style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div className={styles.testField}>
                        <label className={styles.testLabel}>City</label>
                        <select
                          className={styles.select}
                          value={testCityId ?? ""}
                          onChange={(e) =>
                            onTestCityId(e.target.value ? Number(e.target.value) : null)
                          }
                        >
                          <option value="">Select…</option>
                          {cities
                            .slice()
                            .sort((a, b) => a.city_name.localeCompare(b.city_name))
                            .map((c) => (
                              <option key={c.city_id} value={c.city_id}>
                                {c.city_name}
                                {c.state ? `, ${c.state}` : ""}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className={styles.testField}>
                        <label className={styles.testLabel}>District</label>
                        <select
                          className={styles.select}
                          value={testDistrict}
                          onChange={(e) => onTestDistrict(e.target.value)}
                        >
                          <option value="0">City-wide</option>
                          {Array.from({ length: 15 }, (_, i) => i + 1).map((d) => (
                            <option key={d} value={String(d)}>
                              District {d}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.testField}>
                        <label className={styles.testLabel}>Frequency</label>
                        <select
                          className={styles.select}
                          value={testFrequency}
                          onChange={(e) =>
                            onTestFrequency(e.target.value as "weekly" | "monthly")
                          }
                        >
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                      <div className={styles.testField}>
                        <label className={styles.testLabel}>Seymour model</label>
                        <select
                          className={styles.select}
                          value={seymourModelKey}
                          onChange={(e) => onSeymourModelKey(e.target.value)}
                        >
                          <option value="">Default (server settings)</option>
                          {seymourModelOptions.map((m) => (
                            <option key={m.key} value={m.key}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.testField} style={{ alignSelf: "flex-end" }}>
                        <button
                          type="button"
                          className={styles.primaryBtn}
                          disabled={!user.email?.trim() || !testCityId || testBusy}
                          onClick={onGenerateNewsletter}
                        >
                          {testBusy ? "Queuing…" : "Generate newsletter"}
                        </button>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
                      <label style={{ display: "block", fontSize: 12, color: "var(--text-secondary)" }}>
                        Prompt override (optional; prepended with city/district)
                      </label>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        style={{ fontSize: 11, padding: "4px 10px" }}
                        disabled={savePromptBusy}
                        onClick={onSavePromptToPreferences}
                        title="Save this text as the user's personal email prompt (visible in their settings)"
                      >
                        {savePromptBusy ? "Saving…" : "Save as personal prompt"}
                      </button>
                    </div>
                    <textarea
                      className={styles.textarea}
                      style={{ marginTop: 4, minHeight: 72 }}
                      value={testPrompt}
                      onChange={(e) => onTestPrompt(e.target.value)}
                      rows={3}
                    />
                    {testTitle && (
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
                        Last queued job: <strong style={{ color: "var(--text-primary)" }}>{testTitle}</strong>
                      </p>
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>
                      Recent sends &amp; outbox ({history.length})
                    </div>
                    {history.length === 0 ? (
                      <span className={styles.muted}>No logged sends for this email yet.</span>
                    ) : (
                      <table className={styles.subTable}>
                        <thead>
                          <tr>
                            <th>When</th>
                            <th>Type</th>
                            <th>Subject</th>
                            <th>Source</th>
                            <th>Cost</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((h) => (
                            <tr key={`${h.type}-${h.id}`}>
                              <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                                {formatWhen(h.created_at)}
                              </td>
                              <td style={{ fontSize: 12 }}>{h.type}</td>
                              <td style={{ fontSize: 12, maxWidth: 220 }} className={styles.headline}>
                                {h.subject || "\u2014"}
                              </td>
                              <td style={{ fontSize: 12 }}>{h.source}</td>
                              <td style={{ whiteSpace: "nowrap" }}>
                                <LlmCostPill usage={h.llm_usage} />
                              </td>
                              <td style={{ whiteSpace: "nowrap" }}>
                                {h.type === "outbound_email" && typeof h.id === "number" ? (
                                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <button
                                      type="button"
                                      className={styles.linkBtn}
                                      onClick={() => onPreviewOutbound(h)}
                                    >
                                      Body
                                    </button>
                                    {h.session_id?.trim() && (
                                      <JobSessionDebugLink sessionId={h.session_id} />
                                    )}
                                  </div>
                                ) : h.type === "newsletter_send" ? (
                                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    {typeof h.pending_send_id === "number" && (
                                      <button
                                        type="button"
                                        className={styles.linkBtn}
                                        onClick={() => onPreviewOutbound(h)}
                                      >
                                        Body
                                      </button>
                                    )}
                                    {h.session_id?.trim() ? (
                                      <JobSessionDebugLink sessionId={h.session_id} />
                                    ) : typeof h.pending_send_id !== "number" ? (
                                      <span className={styles.muted}>\u2014</span>
                                    ) : null}
                                  </div>
                                ) : (
                                  "\u2014"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {previewLoading && (
                    <div className="tc-loading-state" style={{ marginTop: 12 }}>
                      <Loader size="sm" color="dark" />
                      <span>Loading body…</span>
                    </div>
                  )}
                  {previewHtml !== null && !previewLoading && (
                    <div style={{ marginTop: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 13 }}>Preview</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <JobSessionDebugLink sessionId={previewJobSessionId} />
                          <button type="button" className={styles.secondaryBtn} onClick={onClosePreview}>
                            Close
                          </button>
                        </div>
                      </div>
                      <div
                        className={styles.previewPanel}
                        style={{ maxHeight: 360, overflow: "auto", marginTop: 8 }}
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
