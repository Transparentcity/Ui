"use client";

/**
 * Newsletter admin "Stories" tab — story-level eval loop.
 *
 * Feed stories are judged against the tool-call trace of the Seymour
 * session that created them (accuracy is gating; data honesty and charter
 * compliance round out the rubric). Stories judged failing on accuracy
 * (< 4) are automatically excluded from newsletter source pools; unjudged
 * stories remain eligible.
 *
 * Mirrors the newsletter Workbench import flow: browse active stories,
 * select, import into judge-only rows, watch scores land.
 */

import { useAuth0 } from "@auth0/auth0-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  importStoryEvals,
  listStoryEvalCandidates,
  listStoryEvals,
  rejudgeStoryEval,
  type CityListItem,
  type NewsletterEvalJudgeScores,
  type StoryEvalCandidate,
  type StoryEvalRow,
} from "@/lib/apiClient";
import Loader from "@/components/Loader";
import JobSessionDebugLink from "@/components/JobSessionDebugLink";
import styles from "./NewsletterAdmin.module.css";

const PAGE_SIZE = 25;
const PASSING_ACCURACY = 4;

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

function districtLabel(district: number | null): string {
  if (district == null || district === 0) return "Citywide";
  return `District ${district}`;
}

function scoreBadgeClass(score: number | null): string {
  if (score == null) return "";
  if (score >= PASSING_ACCURACY) return styles.badgeGreen;
  if (score >= 3) return styles.badgeYellow;
  return styles.badgeRed;
}

function GatingBadge({ row }: { row: StoryEvalRow }) {
  if (row.accuracy_score == null) {
    return <span className={styles.badge}>unjudged</span>;
  }
  if (row.accuracy_score >= PASSING_ACCURACY) {
    return (
      <span className={`${styles.badge} ${styles.badgeGreen}`}>
        newsletter-eligible
      </span>
    );
  }
  return (
    <span className={`${styles.badge} ${styles.badgeRed}`}>
      blocked: accuracy {row.accuracy_score}
    </span>
  );
}

function JudgeDetail({ scores }: { scores: NewsletterEvalJudgeScores }) {
  const dims = scores.dimensions || {};
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {scores.overall?.verdict && (
        <div>
          <strong>Verdict:</strong> {scores.overall.verdict}
        </div>
      )}
      {Object.entries(dims).map(([name, dim]) => (
        <div key={name}>
          <div style={{ marginBottom: 4 }}>
            <span className={`${styles.badge} ${scoreBadgeClass(dim.score)}`}>
              {name.replace(/_/g, " ")}: {dim.score ?? "\u2014"}
            </span>
          </div>
          {dim.rationale && (
            <div className={styles.muted} style={{ fontSize: 12 }}>
              {dim.rationale}
            </div>
          )}
          {Array.isArray(
            (dim as { errors?: string[] }).errors
          ) &&
            ((dim as { errors?: string[] }).errors?.length ?? 0) > 0 && (
              <ul style={{ margin: "6px 0 0 16px", fontSize: 12 }}>
                {(dim as { errors?: string[] }).errors?.map((e, i) => (
                  <li key={i} style={{ color: "var(--accent-red, #b91c1c)" }}>
                    {e}
                  </li>
                ))}
              </ul>
            )}
        </div>
      ))}
      {(scores.top_issues?.length ?? 0) > 0 && (
        <div>
          <strong>Top issues</strong>
          <ul style={{ margin: "6px 0 0 16px", fontSize: 12 }}>
            {scores.top_issues.map((i, idx) => (
              <li key={idx}>{i}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function NewsletterAdminStoriesTab({
  cities,
}: {
  cities: CityListItem[];
}) {
  const { getAccessTokenSilently } = useAuth0();

  // ── Eval results list ──
  const [rows, setRows] = useState<StoryEvalRow[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [verdict, setVerdict] = useState<"" | "passing" | "failing">("");
  const [cityId, setCityId] = useState<number | "">("");
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [rejudgingId, setRejudgingId] = useState<number | null>(null);

  // ── Import picker ──
  const [pickerOpen, setPickerOpen] = useState(false);
  const [candidates, setCandidates] = useState<StoryEvalCandidate[]>([]);
  const [candPage, setCandPage] = useState(1);
  const [candPages, setCandPages] = useState(1);
  const [candLoading, setCandLoading] = useState(false);
  const [candQ, setCandQ] = useState("");
  const [candUnjudgedOnly, setCandUnjudgedOnly] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();
      const res = await listStoryEvals(token, {
        q: q || undefined,
        verdict: verdict || undefined,
        city_id: cityId === "" ? undefined : cityId,
        page,
        page_size: PAGE_SIZE,
      });
      setRows(res.items);
      setPages(res.pages);
      setTotal(res.total);
    } catch (err) {
      console.error("Error loading story evals:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load story evals"
      );
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently, q, verdict, cityId, page]);

  useEffect(() => {
    load();
  }, [load]);

  const loadCandidates = useCallback(async () => {
    try {
      setCandLoading(true);
      const token = await getAccessTokenSilently();
      const res = await listStoryEvalCandidates(token, {
        q: candQ || undefined,
        city_id: cityId === "" ? undefined : cityId,
        unjudged_only: candUnjudgedOnly,
        page: candPage,
        page_size: PAGE_SIZE,
      });
      setCandidates(res.items);
      setCandPages(res.pages);
    } catch (err) {
      console.error("Error loading story candidates:", err);
      toast.error("Failed to load stories to import");
    } finally {
      setCandLoading(false);
    }
  }, [getAccessTokenSilently, candQ, cityId, candUnjudgedOnly, candPage]);

  useEffect(() => {
    if (pickerOpen) loadCandidates();
  }, [pickerOpen, loadCandidates]);

  const toggleSelected = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (selected.size === 0) return;
    try {
      setImporting(true);
      const token = await getAccessTokenSilently();
      const res = await importStoryEvals(
        { story_ids: Array.from(selected) },
        token
      );
      toast.success(
        `Judging ${res.imported} stor${res.imported === 1 ? "y" : "ies"} in the background`
      );
      setSelected(new Set());
      setPickerOpen(false);
      // Judging runs in the background; refresh shortly to show pending rows.
      setTimeout(() => load(), 800);
    } catch (err) {
      console.error("Error importing stories for eval:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to import stories"
      );
    } finally {
      setImporting(false);
    }
  }, [selected, getAccessTokenSilently, load]);

  const handleRejudge = useCallback(
    async (rowId: number) => {
      try {
        setRejudgingId(rowId);
        const token = await getAccessTokenSilently();
        await rejudgeStoryEval(rowId, {}, token);
        toast.success("Story re-judged");
        await load();
      } catch (err) {
        console.error("Error re-judging story:", err);
        toast.error(err instanceof Error ? err.message : "Re-judge failed");
      } finally {
        setRejudgingId(null);
      }
    },
    [getAccessTokenSilently, load]
  );

  return (
    <div>
      {error && <div className={styles.errorMessage}>{error}</div>}

      {/* Import picker */}
      <div className={styles.tableContainer} style={{ marginBottom: 16 }}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>Import stories for judging</span>
          <button type="button" onClick={() => setPickerOpen((o) => !o)}>
            {pickerOpen ? "Close" : "Browse stories"}
          </button>
        </div>
        {pickerOpen && (
          <>
            <div
              className={styles.tableHeader}
              style={{ gap: 8, flexWrap: "wrap" }}
            >
              <input
                type="text"
                placeholder="Search headline or hash…"
                value={candQ}
                onChange={(e) => {
                  setCandQ(e.target.value);
                  setCandPage(1);
                }}
              />
              <label style={{ fontSize: 12, display: "flex", gap: 4 }}>
                <input
                  type="checkbox"
                  checked={candUnjudgedOnly}
                  onChange={(e) => {
                    setCandUnjudgedOnly(e.target.checked);
                    setCandPage(1);
                  }}
                />
                Unjudged only
              </label>
              <button
                type="button"
                disabled={selected.size === 0 || importing}
                onClick={handleImport}
              >
                {importing ? (
                  <Loader size="sm" color="dark" />
                ) : (
                  `Judge ${selected.size} selected`
                )}
              </button>
            </div>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th} />
                    <th className={styles.th}>Story</th>
                    <th className={styles.th}>City</th>
                    <th className={styles.th}>Scope</th>
                    <th className={styles.th}>Type</th>
                    <th className={styles.th}>Published</th>
                    <th className={styles.th}>Evals</th>
                  </tr>
                </thead>
                <tbody>
                  {candLoading ? (
                    <tr>
                      <td colSpan={7} className={styles.emptyState}>
                        <Loader size="sm" color="dark" /> Loading stories…
                      </td>
                    </tr>
                  ) : candidates.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={styles.emptyState}>
                        No matching active stories.
                      </td>
                    </tr>
                  ) : (
                    candidates.map((c) => (
                      <tr
                        key={c.id}
                        className={styles.rowClickable}
                        onClick={() => toggleSelected(c.id)}
                      >
                        <td className={styles.td}>
                          <input
                            type="checkbox"
                            checked={selected.has(c.id)}
                            onChange={() => toggleSelected(c.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className={styles.td}>
                          <div>{c.headline || "(no headline)"}</div>
                          <div className={styles.muted} style={{ fontSize: 11 }}>
                            id {c.id}
                            {c.short_hash ? ` · /s/${c.short_hash}` : ""}
                            {c.latest_accuracy != null
                              ? ` · accuracy ${c.latest_accuracy}`
                              : ""}
                          </div>
                        </td>
                        <td className={styles.td}>{c.city_name || c.city_id}</td>
                        <td className={styles.td}>
                          {districtLabel(c.district)}
                        </td>
                        <td className={styles.td}>{c.story_type || "\u2014"}</td>
                        <td className={styles.td}>{formatWhen(c.published_at)}</td>
                        <td className={styles.td}>{c.eval_count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {candPages > 1 && (
              <div
                className={styles.tableHeader}
                style={{
                  borderBottom: "none",
                  borderTop: "1px solid var(--border-primary)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setCandPage((p) => Math.max(1, p - 1))}
                  disabled={candPage <= 1 || candLoading}
                >
                  ← Prev
                </button>
                <span className={styles.tableCount}>
                  Page {candPage} of {candPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCandPage((p) => Math.min(candPages, p + 1))}
                  disabled={candPage >= candPages || candLoading}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Eval results */}
      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>
            Story evals{" "}
            <span className={styles.tableCount}>({total} rows)</span>
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              placeholder="Search headline or hash…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            <select
              value={verdict}
              onChange={(e) => {
                setVerdict(e.target.value as "" | "passing" | "failing");
                setPage(1);
              }}
            >
              <option value="">All verdicts</option>
              <option value="passing">Passing (accuracy ≥ 4)</option>
              <option value="failing">Failing (accuracy &lt; 4)</option>
            </select>
            <select
              value={cityId}
              onChange={(e) => {
                setCityId(e.target.value === "" ? "" : Number(e.target.value));
                setPage(1);
              }}
            >
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c.city_id} value={c.city_id}>
                  {c.city_name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => load()} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Story</th>
                <th className={styles.th}>Scope</th>
                <th className={`${styles.th} ${styles.hideNarrow}`}>Type</th>
                <th className={styles.th}>Accuracy</th>
                <th className={`${styles.th} ${styles.hideNarrow}`}>Overall</th>
                <th className={styles.th}>Gating</th>
                <th className={styles.th}>Status</th>
                <th className={`${styles.th} ${styles.hideNarrow}`}>Judged</th>
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className={styles.emptyState}>
                    <Loader size="sm" color="dark" /> Loading story evals…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className={styles.emptyState}>
                    No story evals yet. New stories are judged automatically
                    when producer jobs run; import existing stories above.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      className={styles.rowClickable}
                      onClick={() =>
                        setExpandedRowId((prev) =>
                          prev === row.id ? null : row.id
                        )
                      }
                    >
                      <td className={styles.td}>
                        <div>{row.headline || "(no headline)"}</div>
                        <div className={styles.muted} style={{ fontSize: 11 }}>
                          {row.city_name || row.city_id}
                          {row.short_hash ? (
                            <>
                              {" · "}
                              <a
                                href={`/s/${row.short_hash}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                /s/{row.short_hash}
                              </a>
                            </>
                          ) : null}
                          {" · "}
                          {row.source}
                        </div>
                      </td>
                      <td className={styles.td}>{districtLabel(row.district)}</td>
                      <td className={`${styles.td} ${styles.hideNarrow}`}>
                        {row.story_type || "\u2014"}
                      </td>
                      <td className={styles.td}>
                        {row.accuracy_score != null ? (
                          <span
                            className={`${styles.badge} ${scoreBadgeClass(row.accuracy_score)}`}
                          >
                            {row.accuracy_score}
                          </span>
                        ) : (
                          "\u2014"
                        )}
                      </td>
                      <td className={`${styles.td} ${styles.hideNarrow}`}>
                        {row.overall_score ?? "\u2014"}
                      </td>
                      <td className={styles.td}>
                        <GatingBadge row={row} />
                      </td>
                      <td className={styles.td}>
                        {row.status === "failed" ? (
                          <span
                            className={`${styles.badge} ${styles.badgeRed}`}
                            title={row.error || undefined}
                          >
                            failed
                          </span>
                        ) : (
                          row.status
                        )}
                      </td>
                      <td className={`${styles.td} ${styles.hideNarrow}`}>
                        {formatWhen(row.completed_at)}
                      </td>
                      <td className={styles.td}>
                        <button
                          type="button"
                          disabled={rejudgingId === row.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRejudge(row.id);
                          }}
                        >
                          {rejudgingId === row.id ? (
                            <Loader size="sm" color="dark" />
                          ) : (
                            "Re-judge"
                          )}
                        </button>
                      </td>
                    </tr>
                    {expandedRowId === row.id && (
                      <tr>
                        <td
                          colSpan={9}
                          className={styles.td}
                          style={{ background: "var(--bg-secondary)" }}
                        >
                          {row.scores_json ? (
                            <JudgeDetail scores={row.scores_json} />
                          ) : row.error ? (
                            <div className={styles.errorMessage}>{row.error}</div>
                          ) : (
                            <span className={styles.muted}>
                              Not judged yet.
                            </span>
                          )}
                          <div style={{ marginTop: 10 }}>
                            <JobSessionDebugLink
                              sessionId={row.session_id}
                              label="Creation session"
                            />
                          </div>
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
            style={{
              borderBottom: "none",
              borderTop: "1px solid var(--border-primary)",
            }}
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
