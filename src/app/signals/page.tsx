"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { toast } from "sonner";
import styles from "./signals.module.css";

// ── Types ───────────────────────────────────────────────────────────────────

interface SignalStory {
  id: number;
  headline: string | null;
  description: string | null;
  story_type: string | null;
  city_id: number | null;
  district: number | null;
  story_date: string | null;
  reaction_count?: number;
  flag_count?: number;
  with_comments?: number;
  last_reaction_at?: string | null;
  last_flag_at?: string | null;
}

interface DepartmentRow {
  department: string | null;
  applause_count: number;
  story_count: number;
  unique_applauders: number;
  last_applause_at: string | null;
}

interface DigestRow {
  week_start: string | null;
  district: number | null;
  story_type: string | null;
  reaction_type: string | null;
  count: number;
}

interface EscalationAlert {
  id: number;
  headline: string | null;
  district: number | null;
  city_id: number | null;
  story_type: string | null;
  flag_count: number;
  comments: string[];
}

type TabKey = "applauded" | "escalated" | "recognition" | "digest" | "alerts";

// ── Data fetchers ───────────────────────────────────────────────────────────

async function fetchJSON<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json();
}

// ── Component ───────────────────────────────────────────────────────────────

export default function SignalsDashboard() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const [tab, setTab] = useState<TabKey>("applauded");
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  // Data
  const [applauded, setApplauded] = useState<SignalStory[]>([]);
  const [escalated, setEscalated] = useState<SignalStory[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [digest, setDigest] = useState<DigestRow[]>([]);
  const [alerts, setAlerts] = useState<EscalationAlert[]>([]);

  const loadData = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const token = await getAccessTokenSilently();
      const params = `days=${days}`;

      if (tab === "applauded") {
        const data = await fetchJSON<{ stories: SignalStory[] }>(
          `/api/signals/top-applauded?${params}`,
          token,
        );
        setApplauded(data.stories);
      } else if (tab === "escalated") {
        const data = await fetchJSON<{ stories: SignalStory[] }>(
          `/api/signals/top-escalated?${params}`,
          token,
        );
        setEscalated(data.stories);
      } else if (tab === "recognition") {
        const data = await fetchJSON<{ departments: DepartmentRow[] }>(
          `/api/signals/department-recognition?${params}`,
          token,
        );
        setDepartments(data.departments);
      } else if (tab === "digest") {
        const data = await fetchJSON<{ rows: DigestRow[] }>(
          `/api/signals/weekly-digest?weeks=4`,
          token,
        );
        setDigest(data.rows);
      } else if (tab === "alerts") {
        const data = await fetchJSON<{ alerts: EscalationAlert[] }>(
          `/api/signals/escalation-alerts?days=7`,
          token,
        );
        setAlerts(data.alerts);
      }
    } catch {
      toast.error("Could not load signals data");
    } finally {
      setLoading(false);
    }
  }, [tab, days, isAuthenticated, getAccessTokenSilently]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Department bar chart max
  const maxApplause = useMemo(
    () => Math.max(1, ...departments.map((d) => d.applause_count)),
    [departments],
  );

  // Group digest rows by week
  const digestByWeek = useMemo(() => {
    const map = new Map<string, DigestRow[]>();
    for (const row of digest) {
      const key = row.week_start || "Unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return Array.from(map.entries());
  }, [digest]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Constituent Signals</h1>
        <p className={styles.subtitle}>
          See what constituents are applauding, flagging, and reacting to across your city.
        </p>
      </div>

      <div className={styles.controls}>
        <select
          className={styles.select}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className={styles.tabs}>
        {(
          [
            ["applauded", "Top Applauded"],
            ["escalated", "Top Escalated"],
            ["recognition", "Dept. Recognition"],
            ["digest", "Weekly Digest"],
            ["alerts", "Alerts"],
          ] as [TabKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
            {key === "alerts" && alerts.length > 0 && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 18,
                height: 18,
                padding: "0 5px",
                fontSize: 11,
                fontWeight: 600,
                color: "#fff",
                background: "var(--error)",
                borderRadius: 9,
                marginLeft: 4,
              }}>
                {alerts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loadingState}>Loading...</div>
      ) : (
        <>
          {/* Top Applauded */}
          {tab === "applauded" && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>
                Most applauded stories ({days} days)
              </h2>
              {applauded.length === 0 ? (
                <div className={styles.emptyState}>No applause data yet.</div>
              ) : (
                <div className={styles.storyList}>
                  {applauded.map((story, i) => (
                    <div key={story.id} className={styles.storyCard}>
                      <div className={styles.storyRank}>{i + 1}</div>
                      <div className={styles.storyContent}>
                        <h3 className={styles.storyHeadline}>
                          {story.headline || `Story #${story.id}`}
                        </h3>
                        <div className={styles.storyMeta}>
                          <span className={styles.badgeApplaud}>
                            {story.reaction_count} applause
                          </span>
                          {story.district != null && (
                            <span>District {story.district}</span>
                          )}
                          {story.story_type && <span>{story.story_type}</span>}
                        </div>
                      </div>
                      <div className={styles.storyActions}>
                        <a
                          href={`/feed/${story.id}`}
                          className={styles.viewBtn}
                        >
                          View
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Top Escalated */}
          {tab === "escalated" && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>
                Most flagged stories ({days} days)
              </h2>
              {escalated.length === 0 ? (
                <div className={styles.emptyState}>No flags yet.</div>
              ) : (
                <div className={styles.storyList}>
                  {escalated.map((story, i) => (
                    <div key={story.id} className={styles.storyCard}>
                      <div className={styles.storyRank}>{i + 1}</div>
                      <div className={styles.storyContent}>
                        <h3 className={styles.storyHeadline}>
                          {story.headline || `Story #${story.id}`}
                        </h3>
                        <div className={styles.storyMeta}>
                          <span className={styles.badgeFlag}>
                            {story.flag_count} flags
                          </span>
                          {story.with_comments != null &&
                            story.with_comments > 0 && (
                              <span>
                                {story.with_comments} with comments
                              </span>
                            )}
                          {story.district != null && (
                            <span>District {story.district}</span>
                          )}
                        </div>
                      </div>
                      <div className={styles.storyActions}>
                        <a
                          href={`/feed/${story.id}`}
                          className={styles.viewBtn}
                        >
                          View
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Department Recognition */}
          {tab === "recognition" && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>
                Department Recognition ({days} days)
              </h2>
              {departments.length === 0 ? (
                <div className={styles.emptyState}>
                  No department recognition data yet.
                </div>
              ) : (
                <table className={styles.deptTable}>
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>Applause</th>
                      <th>Stories</th>
                      <th>Unique People</th>
                      <th style={{ width: "30%" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {departments.map((dept) => (
                      <tr key={dept.department}>
                        <td className={styles.deptName}>
                          {dept.department || "Unknown"}
                        </td>
                        <td>{dept.applause_count}</td>
                        <td>{dept.story_count}</td>
                        <td>{dept.unique_applauders}</td>
                        <td>
                          <div className={styles.deptBarWrap}>
                            <div
                              className={styles.deptBar}
                              style={{
                                width: `${(dept.applause_count / maxApplause) * 100}%`,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Weekly Digest */}
          {tab === "digest" && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Weekly Digest</h2>
              {digestByWeek.length === 0 ? (
                <div className={styles.emptyState}>
                  No reaction data for the digest period.
                </div>
              ) : (
                <div className={styles.digestGrid}>
                  {digestByWeek.map(([week, rows]) => (
                    <div key={week} className={styles.digestCard}>
                      <div className={styles.digestWeek}>
                        Week of{" "}
                        {new Date(week).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                      {rows.map((row, i) => (
                        <div key={i} className={styles.digestRow}>
                          <span className={styles.digestLabel}>
                            {row.district != null ? `District ${row.district}` : "City-wide"}{" \u00B7 "}
                            {(row.story_type || "").replace(/_/g, " ")}{" \u00B7 "}
                            {row.count} {row.reaction_type}{row.count !== 1 ? "s" : ""}
                          </span>
                          <span className={styles.digestCount}>{row.count}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Escalation Alerts */}
          {tab === "alerts" && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Escalation Alerts (7 days)</h2>
              {alerts.length === 0 ? (
                <div className={styles.emptyState}>
                  No escalation alerts. Stories need 5+ flags in 7 days to appear here.
                </div>
              ) : (
                alerts.map((alert) => (
                  <div key={alert.id} className={styles.alertCard}>
                    <div className={styles.alertHeader}>
                      <span className={styles.alertIcon}>&#9888;</span>
                      <h3 className={styles.alertHeadline}>
                        {alert.headline || `Story #${alert.id}`}
                      </h3>
                    </div>
                    <div className={styles.alertMeta}>
                      {alert.flag_count} flags
                      {alert.district != null && ` / District ${alert.district}`}
                      {alert.story_type && ` / ${alert.story_type}`}
                    </div>
                    {alert.comments.length > 0 && (
                      <ul className={styles.alertComments}>
                        {alert.comments.map((c, i) => (
                          <li key={i} className={styles.alertComment}>
                            &ldquo;{c}&rdquo;
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
