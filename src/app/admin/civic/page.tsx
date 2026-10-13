"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearCivicRunItems,
  createCivicCandidate,
  getCivicCandidates,
  getCivicCoverage,
  getCivicEndpointLatestItem,
  getCivicEndpointRuns,
  getCityScheduleHealth,
  getCivicSources,
  getJob,
  listCivicAdapters,
  refreshCivicEndpoint,
  refreshCivicSources,
  reviewCivicCandidate,
  setCivicEndpointPaused,
  startCivicDiscovery,
  testCivicCandidate,
  updateCivicCandidate,
  type CivicAdapterMeta,
  type CivicCandidate,
  type CivicCoverageReport as CoverageReport,
  type CivicEndpointHealth as EndpointHealth,
  type CivicLatestItem,
  type CivicRunRecord as RunRecord,
  type CivicSource as Source,
} from "@/lib/apiClient";
import Loader from "@/components/Loader";
import styles from "./page.module.css";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Removed hardcoded SF; city is now picked dynamically.

function freshnessBadge(ep: EndpointHealth): { label: string; tone: string } {
  if (ep.endpoint_status === "paused") return { label: "Paused", tone: "muted" };
  if (ep.endpoint_status === "error") return { label: "Error", tone: "error" };
  if (!ep.last_success_at) return { label: "Never run", tone: "warning" };
  const ageMins = (Date.now() - new Date(ep.last_success_at).getTime()) / 60000;
  const thresholdHours: Record<string, number> = {
    "*/15 * * * *": 2,
    "*/20 * * * *": 2,
    "*/30 * * * *": 2,
    "0 * * * *": 4,
    "0 */2 * * *": 6,
    "0 */4 * * *": 10,
    "0 6 * * *": 30,
    high_frequency: 2,
    hourly: 4,
    daily: 30,
    weekly: 200,
  };
  const thresholdMins = (thresholdHours[ep.schedule_policy ?? ""] ?? 48) * 60;
  if (ageMins <= thresholdMins) return { label: "Healthy", tone: "success" };
  if (ageMins <= thresholdMins * 2) return { label: "Stale", tone: "warning" };
  return { label: "Very stale", tone: "error" };
}

function tierBadge(tier: number) {
  const map: Record<number, string> = {
    1: "T1 Official",
    2: "T2 Press",
    3: "T3 Commentary",
    4: "T4 Social",
  };
  return <span className={styles.tierBadge}>{map[tier] ?? `T${tier}`}</span>;
}

function ago(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Date unavailable";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function metaString(
  meta: Record<string, unknown>,
  key: string
): string | null {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function metaCount(meta: Record<string, unknown>, key: string): number {
  const value = meta[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

interface CivicMemberVote {
  person_name?: string | null;
  person_id?: number | string | null;
  vote: string;
}

function metaVotes(meta: Record<string, unknown>): CivicMemberVote[] {
  const value = meta.votes;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (vote): vote is CivicMemberVote =>
      typeof vote === "object" &&
      vote !== null &&
      typeof (vote as CivicMemberVote).vote === "string"
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GateBanner({ gate, summary }: { gate: CoverageReport["gate"]; summary: CoverageReport["summary"] }) {
  const pct = Math.round(summary.healthy_fraction * 100);
  return (
    <div className={`${styles.gateBanner} ${gate.passed ? styles.gatePassed : styles.gateFailed}`}>
      <span className={styles.gateState}>
        <span className={styles.statusDot} />
        Coverage {gate.passed ? "healthy" : "needs attention"}
      </span>
      <div className={styles.gateDetails}>
        <span>{pct}% healthy</span>
        <span>{summary.healthy_endpoints}/{summary.total_active_endpoints} endpoints</span>
        <span>{summary.total_runs_in_window} runs</span>
        <span>{summary.total_error_runs} errors</span>
        <span>{summary.pending_candidates} pending</span>
      </div>
      {gate.failures.length > 0 && (
        <div className={styles.gateFailures}>
          {gate.failures.map((failure) => (
            <span key={failure}>{failure}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function RunHistoryDrawer({
  endpoint,
  token,
  onClose,
}: {
  endpoint: EndpointHealth;
  token: string;
  onClose: () => void;
}) {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearingId, setClearingId] = useState<number | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      setRuns(await getCivicEndpointRuns(endpoint.endpoint_id, token, 30));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [endpoint.endpoint_id, token]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const handleClear = async (run: RunRecord) => {
    const count = run.item_count ?? 0;
    if (!window.confirm(
      `Remove ${count} item${count !== 1 ? "s" : ""} last seen by this run?\n\n` +
      `Only rows no newer run has confirmed are removed. ` +
      `Anything still live at the source returns on the next collection.`
    )) return;
    setClearingId(run.run_id);
    setClearError(null);
    try {
      const result = await clearCivicRunItems(run.run_id, token);
      // The cleared run no longer backs any items — reflect it immediately.
      setRuns((prev) => prev.map((r) =>
        r.run_id === run.run_id ? { ...r, item_count: (r.item_count ?? result.deleted) - result.deleted } : r
      ));
      await loadRuns();
    } catch (e) {
      setClearError(e instanceof Error ? e.message : "Could not clear this run.");
    } finally {
      setClearingId(null);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 100,
      display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
    }} onClick={onClose}>
      <div style={{
        width: 520, height: "100%", background: "#fff", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
        overflowY: "auto", padding: 24,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Run history</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              {endpoint.adapter_key} · {endpoint.content_types}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9ca3af" }}>×</button>
        </div>

        {clearError && (
          <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 8 }}>{clearError}</div>
        )}
        {loading ? (
          <div style={{ color: "#9ca3af", fontSize: 13 }}>Loading…</div>
        ) : runs.length === 0 ? (
          <div style={{ color: "#9ca3af", fontSize: 13 }}>No runs recorded yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#9ca3af", textAlign: "left" }}>
                <th style={{ padding: "4px 8px" }}>When</th>
                <th style={{ padding: "4px 8px" }}>Status</th>
                <th style={{ padding: "4px 8px" }}>Items</th>
                <th style={{ padding: "4px 8px" }}>Latency</th>
                <th style={{ padding: "4px 8px" }}>Error</th>
                <th style={{ padding: "4px 8px" }} />
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.run_id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "5px 8px", color: "#6b7280" }}>{ago(r.observed_at)}</td>
                  <td style={{ padding: "5px 8px" }}>
                    <span style={{
                      fontWeight: 600,
                      color: r.status === "success" ? "#15803d"
                        : r.status === "empty" ? "#6b7280"
                        : "#dc2626",
                    }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: "5px 8px" }}>{r.item_count ?? "—"}</td>
                  <td style={{ padding: "5px 8px" }}>{r.latency_ms != null ? `${r.latency_ms}ms` : "—"}</td>
                  <td style={{ padding: "5px 8px", color: "#dc2626", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.error_message ? `${r.error_class}: ${r.error_message}` : ""}
                  </td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>
                    {(r.item_count ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleClear(r)}
                        disabled={clearingId === r.run_id}
                        title="Remove items last seen by this run"
                        style={{
                          padding: "2px 8px", borderRadius: 4, fontSize: 11,
                          border: "1px solid #e5e7eb", background: "transparent",
                          color: "#6b7280", cursor: clearingId === r.run_id ? "not-allowed" : "pointer",
                          opacity: clearingId === r.run_id ? 0.5 : 1, whiteSpace: "nowrap",
                        }}
                      >
                        {clearingId === r.run_id ? "Clearing…" : "Clear"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function LatestDataModal({
  endpoint,
  item,
  loading,
  error,
  onClose,
}: {
  endpoint: EndpointHealth;
  item: CivicLatestItem | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const isXPost = item?.content_type === "post";
  const authorHandle = item ? metaString(item.meta, "author_handle") : null;
  const authorName = item ? metaString(item.meta, "author_name") : null;
  const officialName = item ? metaString(item.meta, "official_name") : null;
  const officialTitle = item ? metaString(item.meta, "official_title") : null;
  const officialDistrict = item ? metaString(item.meta, "official_district") : null;
  const retweetAuthor = item ? metaString(item.meta, "rt_author_handle") : null;
  const postBody = isXPost ? item?.body || item?.title : item?.body;
  const voteResult = item ? metaString(item.meta, "vote_result") : null;
  const voteSummary = item ? metaString(item.meta, "vote_summary") : null;
  const memberVotes = item ? metaVotes(item.meta) : [];

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="latest-data-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={styles.modalClose}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <div className={styles.modalEyebrow}>Most recent collected data</div>
        <h2 id="latest-data-title" className={styles.modalTitle}>
          {isXPost
            ? authorName || officialName || (authorHandle ? `@${authorHandle}` : "X post")
            : item?.title || endpoint.content_types || "Collected item"}
        </h2>
        {loading ? (
          <p className={styles.modalMessage}>Loading latest data…</p>
        ) : error ? (
          <p className={styles.modalError}>{error}</p>
        ) : item ? (
          <>
            <div className={styles.modalMeta}>
              <span>{item.source_name}</span>
              <span>{item.content_type.replace(/_/g, " ")}</span>
              <span>{formatTimestamp(item.published_at || item.last_seen_at)}</span>
              {!isXPost && item.author && <span>{item.author}</span>}
            </div>
            {isXPost && (
              <div className={styles.postDetails}>
                <div>
                  {authorHandle && <strong>@{authorHandle}</strong>}
                  {(officialTitle || officialDistrict) && (
                    <span>
                      {[officialTitle, officialDistrict].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </div>
                {item.meta.is_retweet === true && retweetAuthor && (
                  <span>Reposted from @{retweetAuthor}</span>
                )}
              </div>
            )}
            {postBody && <p className={styles.modalBody}>{postBody}</p>}
            {(voteResult || voteSummary || memberVotes.length > 0) && (
              <div className={styles.postDetails}>
                <div>
                  <strong>Vote{voteResult ? `: ${voteResult}` : ""}</strong>
                  {voteSummary && <span>Tally: {voteSummary}</span>}
                </div>
                {memberVotes.length > 0 && (
                  <span>
                    {memberVotes
                      .map((vote) => {
                        const person =
                          vote.person_name ||
                          (vote.person_id != null
                            ? `Member ${vote.person_id}`
                            : "Member");
                        return `${person}: ${vote.vote}`;
                      })
                      .join(" · ")}
                  </span>
                )}
              </div>
            )}
            {isXPost && (
              <div className={styles.engagement}>
                <span>{metaCount(item.meta, "like_count").toLocaleString()} likes</span>
                <span>{metaCount(item.meta, "retweet_count").toLocaleString()} reposts</span>
                <span>{metaCount(item.meta, "reply_count").toLocaleString()} replies</span>
              </div>
            )}
            <div className={styles.modalFooter}>
              {item.url && (
                <a
                  className={styles.primaryButton}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open source ↗
                </a>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function EndpointRow({
  source,
  ep,
  onPause,
  onResume,
  onViewRuns,
  onViewLatest,
  onRetry,
  retrying,
}: {
  source: Source;
  ep: EndpointHealth;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onViewRuns: (ep: EndpointHealth) => void;
  onViewLatest: (ep: EndpointHealth) => void;
  onRetry: (ep: EndpointHealth) => void;
  retrying: boolean;
}) {
  const { label, tone } = freshnessBadge(ep);
  const hasFailure =
    ep.consecutive_failures > 0 || ep.endpoint_status === "error";

  return (
    <tr className={hasFailure ? styles.failedRow : undefined}>
      <td>
        <div className={styles.sourceName}>{source.display_name}</div>
        <div className={styles.sourceMeta}>
          {tierBadge(source.authority_tier)}
          <span>{source.source_kind?.replace(/_/g, " ")}</span>
        </div>
      </td>
      <td>
        <div className={styles.contentType}>{ep.content_types}</div>
        <div className={styles.adapter}>{ep.adapter_key}</div>
      </td>
      <td>
        <span className={`${styles.statusBadge} ${styles[tone]}`}>
          <span className={styles.statusDot} />
          {label}
        </span>
      </td>
      <td className={styles.mutedCell} title={ep.last_success_at ?? undefined}>
        {ago(ep.last_success_at)}
      </td>
      <td className={styles.failureCell}>
        {ep.consecutive_failures > 0 ? (
          <span>{ep.consecutive_failures} failed</span>
        ) : "—"}
        {ep.last_error && <small title={ep.last_error}>{ep.last_error}</small>}
      </td>
      <td className={styles.actionsCell}>
        <button
          type="button"
          onClick={() => onViewLatest(ep)}
          className={styles.textButton}
        >
          Latest data
        </button>
        <button
          type="button"
          onClick={() => onViewRuns(ep)}
          className={styles.textButton}
        >
          History
        </button>
        {hasFailure && ep.endpoint_status !== "paused" && (
          <button
            type="button"
            onClick={() => onRetry(ep)}
            disabled={retrying}
            className={styles.retryButton}
          >
            {retrying ? "Running…" : "Retry"}
          </button>
        )}
        {ep.endpoint_status === "paused" ? (
          <button
            type="button"
            onClick={() => onResume(ep.endpoint_id)}
            className={styles.secondaryButton}
          >
            Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onPause(ep.endpoint_id)}
            className={styles.secondaryButton}
          >
            Pause
          </button>
        )}
      </td>
    </tr>
  );
}

function SourceCard({
  source,
  onPause,
  onResume,
  onViewRuns,
  onViewLatest,
  onRetry,
  retryingIds,
}: {
  source: Source;
  onPause: (id: number) => void;
  onResume: (id: number) => void;
  onViewRuns: (ep: EndpointHealth) => void;
  onViewLatest: (ep: EndpointHealth) => void;
  onRetry: (ep: EndpointHealth) => void;
  retryingIds: Set<number>;
}) {
  return (
    <>
      {source.endpoints.map(ep => (
        <EndpointRow
          key={ep.endpoint_id}
          source={source}
          ep={ep}
          onPause={onPause}
          onResume={onResume}
          onViewRuns={onViewRuns}
          onViewLatest={onViewLatest}
          onRetry={onRetry}
          retrying={retryingIds.has(ep.endpoint_id)}
        />
      ))}
      {source.endpoints.length === 0 && (
        <tr>
          <td>
            <div className={styles.sourceName}>{source.display_name}</div>
            <div className={styles.sourceMeta}>{tierBadge(source.authority_tier)}</div>
          </td>
          <td colSpan={5} className={styles.emptyRow}>No endpoints configured</td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Candidate queue sub-component
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<number, string> = {
  1: "T1 Official",
  2: "T2 Press",
  3: "T3 Commentary",
  4: "T4 Social",
};

const KIND_OPTIONS = [
  { value: "governing_body", label: "Governing body" },
  { value: "official_communication", label: "Official communication" },
  { value: "local_news", label: "Local news" },
  { value: "civic_newsletter", label: "Civic newsletter" },
  { value: "social_account", label: "Social account" },
  { value: "data_portal", label: "Data portal" },
];

function testStatusBadge(status: string) {
  const map: Record<string, { label: string; tone: string }> = {
    untested: { label: "Untested", tone: "muted" },
    passed: { label: "Passed", tone: "success" },
    failed: { label: "Failed", tone: "error" },
  };
  const { label, tone } = map[status] ?? { label: status, tone: "muted" };
  return (
    <span className={`${styles.statusBadge} ${styles[tone] ?? ""}`}>{label}</span>
  );
}

interface CandidateRowProps {
  candidate: CivicCandidate;
  cityId: number;
  adapters: CivicAdapterMeta[];
  onTested: () => void;
  onReviewed: () => void;
}

function CandidateRow({ candidate: c, cityId, adapters, onTested, onReviewed }: CandidateRowProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [testing, setTesting] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Allow setting adapter inline if not yet assigned
  const [adapterKey, setAdapterKey] = useState(c.adapter_key ?? "");
  const [savingAdapter, setSavingAdapter] = useState(false);

  const effectiveAdapter = adapterKey || c.adapter_key || "";

  const handleSaveAdapter = async (key: string) => {
    if (!key) return;
    setSavingAdapter(true);
    setErr(null);
    try {
      const token = await getAccessTokenSilently();
      await updateCivicCandidate(c.id, { city_id: cityId, adapter_key: key }, token);
      setAdapterKey(key);
      onTested(); // refresh list so c.adapter_key is up-to-date
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAdapter(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setErr(null);
    try {
      const token = await getAccessTokenSilently();
      await testCivicCandidate(c.id, cityId, token);
      onTested();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  const handleReview = async (action: "approve" | "reject" | "defer") => {
    if (action === "approve" && c.test_status !== "passed") {
      setErr("Run a successful test before approving.");
      return;
    }
    setReviewing(action);
    setErr(null);
    try {
      const token = await getAccessTokenSilently();
      await reviewCivicCandidate(c.id, { city_id: cityId, action }, token);
      onReviewed();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setReviewing(null);
    }
  };

  return (
    <tr>
      <td>
        <div className={styles.sourceName}>{c.display_name}</div>
        {c.proposed_publisher && (
          <div className={styles.sourceMeta}>{c.proposed_publisher}</div>
        )}
        {c.proposed_tier != null && (
          <div className={styles.sourceMeta}>
            <span className={styles.tierBadge}>
              {TIER_LABELS[c.proposed_tier] ?? `T${c.proposed_tier}`}
            </span>
          </div>
        )}
      </td>
      <td>
        <a
          href={c.candidate_url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          {c.candidate_url.length > 48
            ? c.candidate_url.slice(0, 48) + "…"
            : c.candidate_url}
        </a>
        {/* Adapter — show picker inline if not yet set */}
        {effectiveAdapter ? (
          <div className={styles.sourceMeta}>{effectiveAdapter.replace("civic_", "")}</div>
        ) : adapters.length > 0 ? (
          <div className={styles.adapterPicker}>
            <select
              className={styles.adapterPickerSelect}
              value=""
              disabled={savingAdapter}
              onChange={(e) => e.target.value && handleSaveAdapter(e.target.value)}
            >
              <option value="">Set adapter…</option>
              {adapters.map((a) => (
                <option key={a.adapter_key} value={a.adapter_key}>
                  {a.display_name}
                </option>
              ))}
            </select>
            {savingAdapter && <span className={styles.sourceMeta}>Saving…</span>}
          </div>
        ) : (
          <div className={`${styles.sourceMeta} ${styles.errorText}`}>No adapter set</div>
        )}
      </td>
      <td>
        <div>{testStatusBadge(c.test_status)}</div>
        {c.test_item_count != null && (
          <div className={styles.sourceMeta}>{c.test_item_count} items</div>
        )}
        {c.test_error && (
          <div className={`${styles.sourceMeta} ${styles.errorText}`}>{c.test_error}</div>
        )}
      </td>
      <td className={styles.sourceMeta}>{c.rationale ?? "—"}</td>
      <td>
        <div className={styles.actionGroup}>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !effectiveAdapter}
            className={styles.secondaryButton}
            title={
              !effectiveAdapter
                ? "Select an adapter first (use the dropdown above)"
                : "Runs a live fetch from this source using the configured adapter. " +
                  "Reports back item count, latency, and a sample item — " +
                  "nothing is saved to the feed. Must pass before you can Approve."
            }
          >
            {testing ? "Testing…" : "Test"}
          </button>
          <button
            type="button"
            onClick={() => handleReview("approve")}
            disabled={reviewing !== null || c.test_status !== "passed"}
            className={styles.primaryButton}
            title={c.test_status !== "passed" ? "Run a successful test first" : undefined}
          >
            {reviewing === "approve" ? "Approving…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => handleReview("reject")}
            disabled={reviewing !== null}
            className={styles.textButton}
          >
            {reviewing === "reject" ? "…" : "Reject"}
          </button>
        </div>
        {err && <div className={styles.inlineError}>{err}</div>}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Add Collection modal
// ---------------------------------------------------------------------------

interface AddCollectionModalProps {
  cityId: number;
  adapters: CivicAdapterMeta[];
  onClose: () => void;
  onSaved: () => void;
}

function AddCollectionModal({ cityId, adapters, onClose, onSaved }: AddCollectionModalProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [adapterKey, setAdapterKey] = useState("");
  const [contentTypes, setContentTypes] = useState("");
  const [tier, setTier] = useState<number>(2);
  const [kind, setKind] = useState("local_news");
  const [rationale, setRationale] = useState("");
  const [endpointConfig, setEndpointConfig] = useState("{}");
  const [publisher, setPublisher] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selectedAdapter = adapters.find((a) => a.adapter_key === adapterKey);

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      let parsedConfig: Record<string, unknown> = {};
      try {
        parsedConfig = endpointConfig.trim() ? JSON.parse(endpointConfig) : {};
      } catch {
        throw new Error("endpoint_config is not valid JSON");
      }
      const token = await getAccessTokenSilently();
      await createCivicCandidate(
        {
          city_id: cityId,
          display_name: name,
          candidate_url: url,
          adapter_key: adapterKey || undefined,
          endpoint_config: parsedConfig,
          content_types: contentTypes || undefined,
          proposed_tier: tier,
          proposed_kind: kind,
          rationale: rationale || undefined,
          proposed_publisher: publisher || undefined,
        },
        token
      );
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>Add collection</h2>
          <button type="button" onClick={onClose} className={styles.closeButton}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formRow}>
            <label>Display name *</label>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Oakland Tribune"
            />
          </div>
          <div className={styles.formRow}>
            <label>URL *</label>
            <input
              className={styles.input}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.eastbaytimes.com/feed/"
            />
          </div>
          <div className={styles.formRow}>
            <label>Adapter</label>
            <select
              className={styles.input}
              value={adapterKey}
              onChange={(e) => {
                setAdapterKey(e.target.value);
                const a = adapters.find((x) => x.adapter_key === e.target.value);
                if (a) setContentTypes(a.compatible_content_types.join(","));
              }}
            >
              <option value="">— select —</option>
              {adapters.map((a) => (
                <option key={a.adapter_key} value={a.adapter_key}>
                  {a.display_name}
                </option>
              ))}
            </select>
          </div>
          {selectedAdapter && selectedAdapter.required_config.length > 0 && (
            <div className={styles.adapterHint}>
              <strong>Required config:</strong>{" "}
              {selectedAdapter.required_config.map((c) => `${c.key} (${c.hint})`).join(", ")}
            </div>
          )}
          <div className={styles.formRow}>
            <label>Endpoint config (JSON)</label>
            <textarea
              className={styles.input}
              rows={3}
              value={endpointConfig}
              onChange={(e) => setEndpointConfig(e.target.value)}
              placeholder='{"client": "oakland"}'
            />
          </div>
          <div className={styles.formRow}>
            <label>Content types</label>
            <input
              className={styles.input}
              value={contentTypes}
              onChange={(e) => setContentTypes(e.target.value)}
              placeholder="meetings,agendas,articles"
            />
          </div>
          <div className={styles.formRowHalf}>
            <div>
              <label>Authority tier</label>
              <select className={styles.input} value={tier} onChange={(e) => setTier(Number(e.target.value))}>
                {Object.entries(TIER_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Source kind</label>
              <select className={styles.input} value={kind} onChange={(e) => setKind(e.target.value)}>
                {KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.formRow}>
            <label>Publisher / outlet</label>
            <input
              className={styles.input}
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              placeholder="Oakland Tribune"
            />
          </div>
          <div className={styles.formRow}>
            <label>Rationale</label>
            <textarea
              className={styles.input}
              rows={2}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why this source is worth including"
            />
          </div>
          {err && <div className={styles.inlineError}>{err}</div>}
        </div>
        <div className={styles.modalFooter}>
          <button type="button" onClick={onClose} className={styles.textButton}>Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name || !url}
            className={styles.primaryButton}
          >
            {saving ? "Saving…" : "Propose source"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const SF_CITY_ID = 57260;

export default function CivicAdminPage() {
  const { getAccessTokenSilently, isAuthenticated, isLoading: authLoading } = useAuth0();
  const [cityId, setCityId] = useState<number>(SF_CITY_ID);
  const [cityName, setCityName] = useState<string>("San Francisco");
  const [cities, setCities] = useState<Array<{ id: number; name: string; state?: string | null }>>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [report, setReport] = useState<CoverageReport | null>(null);
  const [candidates, setCandidates] = useState<CivicCandidate[]>([]);
  const [adapters, setAdapters] = useState<CivicAdapterMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryJobId, setDiscoveryJobId] = useState<string | null>(null);
  const [discoveryState, setDiscoveryState] = useState<"running" | "completed" | "failed" | null>(null);
  const [discoveryDetail, setDiscoveryDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawerEp, setDrawerEp] = useState<EndpointHealth | null>(null);
  const [drawerToken, setDrawerToken] = useState<string>("");
  const [latestEp, setLatestEp] = useState<EndpointHealth | null>(null);
  const [latestItem, setLatestItem] = useState<CivicLatestItem | null>(null);
  const [latestLoading, setLatestLoading] = useState(false);
  const [latestError, setLatestError] = useState<string | null>(null);
  const [retryingIds, setRetryingIds] = useState<Set<number>>(new Set());
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);

  // Load city list once — same source as the City Health list
  // (launched + dark + coming-soon-with-metrics), NOT every row in /admin/cities
  useEffect(() => {
    if (!isAuthenticated) return;
    getAccessTokenSilently().then((token) => {
      getCityScheduleHealth(token).then((res) => {
        const list = res.cities ?? [];
        const normalised = list
          .map((c) => ({
            id: c.city_id ?? 0,
            name: c.city_name ?? "",
          }))
          .filter((c) => c.id > 0 && c.name)
          .sort((a, b) => a.name.localeCompare(b.name));
        setCities(normalised);
      }).catch(() => {});
    });
  }, [isAuthenticated, getAccessTokenSilently]);

  // If the currently selected city isn't in the health list
  // (e.g. default SF before load), fall back to the first entry.
  useEffect(() => {
    if (cities.length === 0) return;
    if (cities.some((c) => c.id === cityId)) return;
    const first = cities[0];
    setCityId(first.id);
    setCityName(first.name);
    setLoading(true);
  }, [cities, cityId]);

  const loadData = useCallback(async () => {
    if (!isAuthenticated) return;
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const [srcs, cov, cands, adps] = await Promise.all([
        getCivicSources(cityId, token),
        getCivicCoverage(cityId, token, cityName),
        getCivicCandidates(cityId, token),
        listCivicAdapters(cityId, token).catch(() => [] as CivicAdapterMeta[]),
      ]);
      setSources(srcs);
      setReport(cov);
      setCandidates(cands);
      setAdapters(adps);
      setLastRefreshed(new Date().toLocaleTimeString());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, getAccessTokenSilently, cityId, cityName]);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
      const iv = setInterval(loadData, 60_000);
      return () => clearInterval(iv);
    }
  }, [isAuthenticated, loadData]);

  const handlePause = async (endpointId: number) => {
    const token = await getAccessTokenSilently();
    await setCivicEndpointPaused(endpointId, true, token);
    await loadData();
  };

  const handleResume = async (endpointId: number) => {
    const token = await getAccessTokenSilently();
    await setCivicEndpointPaused(endpointId, false, token);
    await loadData();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      await refreshCivicSources(cityId, token);
      await loadData();
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    setError(null);
    setDiscoveryState(null);
    setDiscoveryDetail(null);
    setDiscoveryJobId(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await startCivicDiscovery(cityId, "claude-sonnet-5.5", token);
      setDiscoveryJobId(res.job_id);
      setDiscoveryState("running");
      setShowCandidates(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDiscovering(false);
    }
  };

  // Poll the discovery job while it runs: refresh candidates as Seymour
  // proposes them, and report completion/failure in the status banner.
  useEffect(() => {
    if (discoveryState !== "running" || !discoveryJobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const token = await getAccessTokenSilently();
        const job = await getJob(discoveryJobId, token);
        if (cancelled) return;
        if (job.status === "completed") {
          setDiscoveryState("completed");
          setDiscoveryDetail(
            job.status_message || "Seymour finished — review the new candidates below."
          );
          loadData();
        } else if (job.status === "failed" || job.status === "cancelled") {
          setDiscoveryState("failed");
          setDiscoveryDetail(
            job.status_message || "Discovery failed — check the job logs and try again."
          );
          loadData();
        } else {
          // Still running: pick up any newly proposed candidates.
          if (job.status_message) setDiscoveryDetail(job.status_message);
          loadData();
        }
      } catch {
        // Transient poll failure — keep polling; next tick retries.
      }
    };
    poll();
    const iv = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [discoveryState, discoveryJobId, getAccessTokenSilently, loadData]);

  const openDrawer = async (ep: EndpointHealth) => {
    const token = await getAccessTokenSilently();
    setDrawerToken(token);
    setDrawerEp(ep);
  };

  const openLatest = async (ep: EndpointHealth) => {
    setLatestEp(ep);
    setLatestItem(null);
    setLatestError(null);
    setLatestLoading(true);
    try {
      const token = await getAccessTokenSilently();
      setLatestItem(await getCivicEndpointLatestItem(ep.endpoint_id, token));
    } catch (e) {
      setLatestError(
        e instanceof Error && e.message.includes("404")
          ? "No collected data is available for this endpoint yet."
          : e instanceof Error
            ? e.message
            : "Could not load the latest data."
      );
    } finally {
      setLatestLoading(false);
    }
  };

  const handleRetry = async (ep: EndpointHealth) => {
    setRetryingIds((current) => new Set(current).add(ep.endpoint_id));
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const result = await refreshCivicEndpoint(ep.endpoint_id, token);
      if (result.status === "error") {
        throw new Error(result.error || "The endpoint failed again.");
      }
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not retry the endpoint.");
    } finally {
      setRetryingIds((current) => {
        const next = new Set(current);
        next.delete(ep.endpoint_id);
        return next;
      });
    }
  };

  const orderedSources = [...sources].sort(
    (a, b) =>
      a.authority_tier - b.authority_tier ||
      a.display_name.localeCompare(b.display_name)
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Civic discussion</h1>
          <p>
            {cities.length > 0 ? (
              <select
                className={styles.cityPicker}
                value={cityId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  const city = cities.find((c) => c.id === id);
                  setCityId(id);
                  setCityName(city ? [city.name, city.state].filter(Boolean).join(", ") : "");
                  setLoading(true);
                }}
              >
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.name, c.state].filter(Boolean).join(", ")}
                  </option>
                ))}
              </select>
            ) : (
              cityName
            )}{" "}
            · {lastRefreshed ? `Updated ${lastRefreshed}` : "Loading…"}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className={styles.secondaryButton}
          >
            Add collection
          </button>
          <button
            type="button"
            onClick={handleDiscover}
            disabled={discovering || discoveryState === "running"}
            className={styles.secondaryButton}
            title="Run Seymour to discover and propose sources for this city"
          >
            {discovering
              ? "Starting…"
              : discoveryState === "running"
                ? "Discovering…"
                : "Discover with Seymour"}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className={styles.primaryButton}
          >
            {refreshing ? "Collecting…" : "Run all sources"}
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner}>{error}</div>
      )}

      {discoveryState && (
        <div
          className={`${styles.infoBanner} ${
            discoveryState === "completed"
              ? styles.infoBannerDone
              : discoveryState === "failed"
                ? styles.infoBannerFailed
                : ""
          }`}
          role="status"
        >
          {discoveryState === "running" && <Loader size="sm" color="purple" />}
          <span>
            {discoveryState === "running" && (
              <>
                <strong>Seymour is discovering sources…</strong>
                {discoveryDetail ? ` ${discoveryDetail}` : " Searching official sites, press, and social accounts."}
                {" "}New candidates appear below as they're proposed — this can take a few minutes.
              </>
            )}
            {discoveryState === "completed" && (
              <><strong>Discovery finished.</strong> {discoveryDetail}</>
            )}
            {discoveryState === "failed" && (
              <><strong>Discovery failed.</strong> {discoveryDetail}</>
            )}
          </span>
          <button
            type="button"
            className={styles.bannerDismiss}
            aria-label="Dismiss"
            onClick={() => {
              setDiscoveryState(null);
              setDiscoveryJobId(null);
              setDiscoveryDetail(null);
            }}
          >
            ×
          </button>
        </div>
      )}

      {(authLoading || loading) ? (
        <div className={styles.loading}>Loading…</div>
      ) : !isAuthenticated ? (
        <div className={styles.loading}>Not authenticated.</div>
      ) : (
        <>
          {report && (
            <GateBanner gate={report.gate} summary={report.summary} />
          )}

          <section className={styles.registrySection}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Source collection</h2>
                <p>Review health, inspect the latest item, or retry a failed endpoint.</p>
              </div>
              <span>{orderedSources.reduce((sum, source) => sum + source.endpoints.length, 0)} endpoints</span>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.registryTable}>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Collection</th>
                    <th>Health</th>
                    <th>Last success</th>
                    <th>Recent failure</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedSources.map((source) => (
                    <SourceCard
                      key={source.id}
                      source={source}
                      onPause={handlePause}
                      onResume={handleResume}
                      onViewRuns={openDrawer}
                      onViewLatest={openLatest}
                      onRetry={handleRetry}
                      retryingIds={retryingIds}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {report && report.coverage_gaps.length > 0 && (
            <section className={styles.gapsSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Coverage gaps</h2>
                  <p>Sources that are stale, failing, or have not run.</p>
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.registryTable}>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Content</th>
                      <th>Freshness</th>
                      <th>Last success</th>
                      <th>Failures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.coverage_gaps.map((g, i) => (
                      <tr key={i}>
                        <td>
                          <div className={styles.sourceName}>{g.source_name}</div>
                          <div className={styles.sourceMeta}>{tierBadge(g.authority_tier)}</div>
                        </td>
                        <td className={styles.mutedCell}>{g.content_types}</td>
                        <td>
                          <span className={`${styles.statusBadge} ${styles.warning}`}>
                            {g.freshness.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className={styles.mutedCell}>{ago(g.last_success_at)}</td>
                        <td className={styles.failureCell}>
                          {g.consecutive_failures || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {/* Pending candidates queue */}
      {candidates.length > 0 && (
        <section className={styles.gapsSection}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>
                Pending sources{" "}
                <span className={styles.tierBadge}>{candidates.length}</span>
              </h2>
              <p>
                Proposed sources awaiting test and admin review. Test each one, then
                Approve or Reject.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCandidates((v) => !v)}
              className={styles.textButton}
            >
              {showCandidates ? "Hide" : "Show"}
            </button>
          </div>
          {showCandidates && (
            <div className={styles.tableWrap}>
              <table className={styles.registryTable}>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>URL / adapter</th>
                    <th>Test</th>
                    <th>Rationale</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <CandidateRow
                      key={c.id}
                      candidate={c}
                      cityId={cityId}
                      adapters={adapters}
                      onTested={loadData}
                      onReviewed={loadData}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Run history drawer */}
      {drawerEp && (
        <RunHistoryDrawer endpoint={drawerEp} token={drawerToken} onClose={() => setDrawerEp(null)} />
      )}
      {latestEp && (
        <LatestDataModal
          endpoint={latestEp}
          item={latestItem}
          loading={latestLoading}
          error={latestError}
          onClose={() => setLatestEp(null)}
        />
      )}

      {/* Add collection modal */}
      {showAddModal && (
        <AddCollectionModal
          cityId={cityId}
          adapters={adapters}
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            setShowCandidates(true);
            loadData();
          }}
        />
      )}
    </div>
  );
}
