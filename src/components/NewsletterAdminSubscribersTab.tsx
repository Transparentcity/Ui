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
  listCities,
  listUsers,
  type AdminNewsletterHistoryItem,
  type AdminUserNewsletterOverview,
  type CityListItem,
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
        setTestPrompt(ov.newsletter_description || "");
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

  const handlePreviewOutbound = async (item: AdminNewsletterHistoryItem) => {
    if (item.type !== "outbound_email" || typeof item.id !== "number") return;
    setPreviewLoading(true);
    setPreviewHtml(null);
    const sid = item.session_id?.trim();
    setPreviewJobSessionId(sid || null);
    try {
      const token = await getAccessTokenSilently();
      const detail = await getOutboundEmail(item.id, token);
      setPreviewHtml(detail.body_html || detail.body_plain || "(empty)");
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
    const defaultPrompt =
      "Create a weekly newsletter report for this city and district. Focus on recent changes and trends in key metrics (crime, housing, permits, 311 calls), notable anomalies, comparative analysis (this period vs. previous, district vs. city-wide), and actionable insights for residents. Be data-driven with specific numbers; highlight both positive and concerning trends.";
    const prompt = testPrompt.trim() || defaultPrompt;
    const promptOverride = `For ${cityName} (${districtLabel}). ${prompt}`;

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
        Each subscriber&apos;s email newsletter settings (communication preferences and district subscriptions), past
        sends in the outbox / newsletter_sends tables, and admin-generated drafts (queued to Pending on the dashboard).
        Users can also change preferences in their profile or via unsubscribe links.
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
                <th className={styles.th}>ID</th>
                <th className={styles.th}>Email</th>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Active</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.emptyState}>
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
                    history={open ? history : []}
                    cities={cities}
                    testCityId={testCityId}
                    testDistrict={testDistrict}
                    testFrequency={testFrequency}
                    seymourModelKey={seymourModelKey}
                    seymourModelOptions={seymourModelOptions}
                    testPrompt={testPrompt}
                    testBusy={testBusy}
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
  history,
  cities,
  testCityId,
  testDistrict,
  testFrequency,
  seymourModelKey,
  seymourModelOptions,
  testPrompt,
  testBusy,
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
  onPreviewOutbound,
  previewJobSessionId,
  onClosePreview,
}: {
  user: User;
  open: boolean;
  onToggle: () => void;
  detailLoading: boolean;
  overview: AdminUserNewsletterOverview | null;
  history: AdminNewsletterHistoryItem[];
  cities: CityListItem[];
  testCityId: number | null;
  testDistrict: string;
  testFrequency: "weekly" | "monthly";
  seymourModelKey: string;
  seymourModelOptions: { key: string; name: string }[];
  testPrompt: string;
  testBusy: boolean;
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
  onPreviewOutbound: (item: AdminNewsletterHistoryItem) => void;
  previewJobSessionId: string | null;
  onClosePreview: () => void;
}) {
  return (
    <>
      <tr className={styles.rowClickable} onClick={onToggle}>
        <td className={styles.td} style={{ textAlign: "center", fontSize: 10 }}>
          {open ? "\u25BC" : "\u25B6"}
        </td>
        <td className={styles.td}>{user.id}</td>
        <td className={styles.td}>{user.email || "\u2014"}</td>
        <td className={styles.td}>{user.name || "\u2014"}</td>
        <td className={styles.td}>{user.is_active ? "Yes" : "No"}</td>
      </tr>
      {open && (
        <tr className={styles.expandedRow}>
          <td colSpan={5} className={styles.td} style={{ padding: 0, verticalAlign: "top" }}>
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
                    {overview.newsletter_description ? (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>
                          Personalized newsletter prompt
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
                          {overview.newsletter_description}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>
                      District / city subscriptions ({overview.subscriptions.length})
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
                    <label style={{ display: "block", fontSize: 12, marginTop: 8, color: "var(--text-secondary)" }}>
                      Prompt override (optional; prepended with city/district)
                    </label>
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
                                {h.type === "outbound_email" && typeof h.id === "number" ? (
                                  <button
                                    type="button"
                                    className={styles.linkBtn}
                                    onClick={() => onPreviewOutbound(h)}
                                  >
                                    Body
                                  </button>
                                ) : h.type === "newsletter_send" ? (
                                  h.session_id?.trim() ? (
                                    <JobSessionDebugLink sessionId={h.session_id} />
                                  ) : (
                                    <span className={styles.muted}>\u2014</span>
                                  )
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
