"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { toast } from "sonner";
import Link from "next/link";
import {
  listResearchQueue,
  updateResearchQueueItem,
  deleteResearchQueueItem,
  type ResearchQueueItem,
} from "@/lib/apiClient";
import styles from "./researchQueue.module.css";

type StatusFilter = "all" | "queued" | "in_progress" | "resolved";

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  in_progress: "In Progress",
  resolved: "Resolved",
};

const STATUS_STYLE: Record<string, string> = {
  queued: styles.statusQueued,
  in_progress: styles.statusInProgress,
  resolved: styles.statusResolved,
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ResearchQueuePage() {
  const { getAccessTokenSilently, isAuthenticated, isLoading: authLoading } = useAuth0();
  const [tab, setTab] = useState<StatusFilter>("all");
  const [items, setItems] = useState<ResearchQueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Inline editing state
  const [editStatus, setEditStatus] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(
    async () => {
      if (!isAuthenticated) return;
      setLoading(true);
      try {
        const token = await getAccessTokenSilently();
        const res = await listResearchQueue(token, { limit: 200 });
        setItems(res.items);
        setTotal(res.total);
      } catch {
        toast.error("Could not load research queue");
      } finally {
        setLoading(false);
      }
    },
    [isAuthenticated, getAccessTokenSilently]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter items client-side so tab counts are always accurate
  const filteredItems = tab === "all" ? items : items.filter((i) => i.status === tab);

  const counts = {
    all: total,
    queued: items.filter((i) => i.status === "queued").length,
    in_progress: items.filter((i) => i.status === "in_progress").length,
    resolved: items.filter((i) => i.status === "resolved").length,
  };

  const handleExpand = (item: ResearchQueueItem) => {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(item.id);
    setEditStatus(item.status);
    setEditNotes(item.notes ?? "");
  };

  const handleSave = async (queueId: number) => {
    setSaving(true);
    try {
      const token = await getAccessTokenSilently();
      await updateResearchQueueItem(token, queueId, {
        status: editStatus,
        notes: editNotes,
      });
      toast.success("Updated");
      setExpandedId(null);
      loadData();
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (queueId: number) => {
    if (!confirm("Remove this item from your research queue?")) return;
    try {
      const token = await getAccessTokenSilently();
      await deleteResearchQueueItem(token, queueId);
      toast.success("Removed");
      setExpandedId(null);
      loadData();
    } catch {
      toast.error("Failed to remove");
    }
  };

  if (authLoading) return null;
  if (!isAuthenticated) {
    return (
      <div className={styles.authGuard}>
        Sign in to access your Research Queue.
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Research Queue</h1>
        <p className={styles.subtitle}>
          Stories you&apos;ve investigated for further review
        </p>
      </div>

      {/* Status tabs */}
      <div className={styles.tabs}>
        {(["all", "queued", "in_progress", "resolved"] as StatusFilter[]).map(
          (t) => (
            <button
              key={t}
              type="button"
              className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
              onClick={() => setTab(t)}
            >
              {t === "all" ? "All" : STATUS_LABELS[t]}
              {t !== "all" && counts[t] > 0 && (
                <span
                  className={`${styles.tabBadge} ${tab === t ? styles.tabBadgeActive : ""}`}
                >
                  {counts[t]}
                </span>
              )}
              {t === "all" && (
                <span
                  className={`${styles.tabBadge} ${tab === "all" ? styles.tabBadgeActive : ""}`}
                >
                  {counts.all}
                </span>
              )}
            </button>
          )
        )}
      </div>

      {loading ? (
        <div className={styles.loading}>Loading...</div>
      ) : filteredItems.length === 0 ? (
        <div className={styles.emptyState}>
          {tab === "all"
            ? 'No items in your research queue yet. Tap "Investigate" on feed stories to add them here.'
            : `No ${STATUS_LABELS[tab]?.toLowerCase() ?? tab} items.`}
        </div>
      ) : (
        <div className={styles.queueList}>
          {filteredItems.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                className={`${styles.queueCard} ${isExpanded ? styles.queueCardExpanded : ""}`}
                onClick={() => handleExpand(item)}
              >
                <div className={styles.cardTop}>
                  <div className={styles.cardContent}>
                    <p className={styles.cardHeadline}>
                      {item.headline ?? "Untitled story"}
                    </p>
                    <div className={styles.cardMeta}>
                      {item.story_type && (
                        <span className={styles.typeBadge}>
                          {item.story_type.replace(/_/g, " ")}
                        </span>
                      )}
                      <span
                        className={`${styles.statusBadge} ${STATUS_STYLE[item.status] ?? ""}`}
                      >
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                      {item.district != null && (
                        <span>District {item.district}</span>
                      )}
                      {item.added_at && (
                        <span>Added {formatDate(item.added_at)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div
                    className={styles.expandedDetail}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div>
                      <div className={styles.fieldLabel}>Status</div>
                      <select
                        className={styles.statusSelect}
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                      >
                        <option value="queued">Queued</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>

                    <div>
                      <div className={styles.fieldLabel}>Notes</div>
                      <textarea
                        className={styles.notesArea}
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Add notes about this investigation..."
                      />
                    </div>

                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        className={styles.saveBtn}
                        disabled={saving}
                        onClick={() => handleSave(item.id)}
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={() => handleRemove(item.id)}
                      >
                        Remove
                      </button>
                      <Link
                        href={`/feed/${item.story_id}`}
                        className={styles.viewStoryLink}
                      >
                        View Story
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
