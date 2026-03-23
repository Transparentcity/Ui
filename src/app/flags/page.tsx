"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { toast } from "sonner";
import styles from "./flags.module.css";

interface FlagItem {
  id: number;
  feed_story_id: number;
  user_name: string | null;
  user_role: string | null;
  comment: string | null;
  include_name: boolean | null;
  status: string;
  resolution_note: string | null;
  headline: string | null;
  created_at: string | null;
  resolved_at: string | null;
}

type TabKey = "open" | "resolved";

async function fetchFlags(
  token: string,
  status?: string,
): Promise<{ items: FlagItem[]; counts: Record<string, number> }> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const res = await fetch(`/api/flags/list?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch flags");
  return res.json();
}

async function resolveFlag(token: string, flagId: number, note?: string): Promise<void> {
  const res = await fetch(`/api/flags/${flagId}/resolve`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ resolution_note: note }),
  });
  if (!res.ok) throw new Error("Failed to resolve");
}

export default function FlagDashboard() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const [tab, setTab] = useState<TabKey>("open");
  const [items, setItems] = useState<FlagItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [resolveNote, setResolveNote] = useState("");

  const loadItems = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const token = await getAccessTokenSilently();
      const result = await fetchFlags(token, tab);
      setItems(result.items);
      setCounts(result.counts);
    } catch {
      toast.error("Could not load flags");
    } finally {
      setLoading(false);
    }
  }, [tab, isAuthenticated, getAccessTokenSilently]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleResolve = useCallback(
    async (flagId: number) => {
      try {
        const token = await getAccessTokenSilently();
        await resolveFlag(token, flagId, resolveNote || undefined);
        toast.success("Flag resolved");
        setResolvingId(null);
        setResolveNote("");
        loadItems();
      } catch {
        toast.error("Could not resolve flag");
      }
    },
    [getAccessTokenSilently, resolveNote, loadItems],
  );

  const openCount = counts["open"] || 0;
  const resolvedCount = counts["resolved"] || 0;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Flag Dashboard</h1>
        <p className={styles.subtitle}>
          Stories flagged by constituents that may need attention or follow-up.
        </p>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "open" ? styles.tabActive : ""}`}
          onClick={() => setTab("open")}
        >
          Open {openCount > 0 && <span className={styles.badge}>{openCount}</span>}
        </button>
        <button
          className={`${styles.tab} ${tab === "resolved" ? styles.tabActive : ""}`}
          onClick={() => setTab("resolved")}
        >
          Resolved {resolvedCount > 0 && <span className={styles.badgeResolved}>{resolvedCount}</span>}
        </button>
      </div>

      {loading ? (
        <div className={styles.loadingState}>Loading...</div>
      ) : items.length === 0 ? (
        <div className={styles.emptyState}>
          <p>{tab === "open" ? "No open flags. All clear!" : "No resolved flags yet."}</p>
        </div>
      ) : (
        <div className={styles.list}>
          {items.map((item) => (
            <div key={item.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={`${styles.statusDot} ${item.status === "open" ? styles.statusOpen : styles.statusResolved}`} />
                <span className={styles.cardStatus}>{item.status}</span>
                {item.created_at && (
                  <span className={styles.timestamp}>{new Date(item.created_at).toLocaleDateString()}</span>
                )}
              </div>

              <h3 className={styles.cardTitle}>{item.headline || `Story #${item.feed_story_id}`}</h3>

              {item.comment && (
                <div className={styles.commentBlock}>
                  <div className={styles.commentAuthor}>
                    {item.include_name && item.user_name ? item.user_name : "Anonymous constituent"}
                  </div>
                  <p className={styles.commentText}>{item.comment}</p>
                </div>
              )}

              {item.resolution_note && (
                <div className={styles.resolutionBlock}>
                  <div className={styles.resolutionLabel}>Resolution</div>
                  <p className={styles.resolutionText}>{item.resolution_note}</p>
                </div>
              )}

              {item.status === "open" && (
                <div className={styles.cardActions}>
                  {resolvingId === item.id ? (
                    <div className={styles.resolveForm}>
                      <textarea
                        className={styles.resolveInput}
                        placeholder="Resolution note (optional)"
                        value={resolveNote}
                        onChange={(e) => setResolveNote(e.target.value)}
                        rows={2}
                      />
                      <div className={styles.resolveButtons}>
                        <button
                          className={styles.primaryBtn}
                          onClick={() => handleResolve(item.id)}
                        >
                          Resolve
                        </button>
                        <button
                          className={styles.secondaryBtn}
                          onClick={() => { setResolvingId(null); setResolveNote(""); }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        className={styles.primaryBtn}
                        onClick={() => setResolvingId(item.id)}
                      >
                        Resolve
                      </button>
                      <a
                        className={styles.secondaryBtn}
                        href={`/feed/${item.feed_story_id}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        View Story
                      </a>
                    </>
                  )}
                </div>
              )}

              {item.status === "resolved" && item.resolved_at && (
                <div className={styles.resolvedTimestamp}>
                  Resolved {new Date(item.resolved_at).toLocaleDateString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
