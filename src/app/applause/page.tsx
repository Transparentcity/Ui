"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { toast } from "sonner";
import styles from "./applause.module.css";

interface ApplauseItem {
  id: number;
  feed_story_id: number;
  recipient_name: string | null;
  recipient_email: string | null;
  department: string | null;
  email_subject: string | null;
  email_body_html: string | null;
  email_status: string;
  headline: string | null;
  created_at: string | null;
  sent_at: string | null;
}

type TabKey = "draft" | "sent";

async function fetchQueue(token: string, status?: string): Promise<{ items: ApplauseItem[]; total: number }> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const res = await fetch(`/api/applause/queue?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch queue");
  return res.json();
}

async function sendEmail(token: string, entryId: number): Promise<void> {
  const res = await fetch(`/api/applause/queue/${entryId}/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to send");
}

async function updateDraft(
  token: string,
  entryId: number,
  data: { email_subject?: string; email_body_html?: string; recipient_email?: string },
): Promise<void> {
  const res = await fetch(`/api/applause/queue/${entryId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update");
}

export default function ApplauseDashboard() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const [tab, setTab] = useState<TabKey>("draft");
  const [items, setItems] = useState<ApplauseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const loadItems = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const token = await getAccessTokenSilently();
      // "draft" tab shows both pending_draft and draft; "sent" shows sent
      const result = await fetchQueue(token, tab === "draft" ? undefined : "sent");
      const filtered = tab === "draft"
        ? result.items.filter((i) => i.email_status !== "sent")
        : result.items.filter((i) => i.email_status === "sent");
      setItems(filtered);
    } catch {
      toast.error("Could not load applause queue");
    } finally {
      setLoading(false);
    }
  }, [tab, isAuthenticated, getAccessTokenSilently]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleSend = useCallback(
    async (id: number, recipientName?: string | null) => {
      const target = recipientName || "the recipient";
      if (!confirm(`Send this email to ${target}?`)) return;
      try {
        const token = await getAccessTokenSilently();
        await sendEmail(token, id);
        toast.success("Email queued for sending");
        loadItems();
      } catch {
        toast.error("Could not send email");
      }
    },
    [getAccessTokenSilently, loadItems],
  );

  const draftCount = items.filter((i) => i.email_status !== "sent").length;
  const sentCount = items.filter((i) => i.email_status === "sent").length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Applause Dashboard</h1>
        <p className={styles.subtitle}>
          Review and send congratulatory emails to departments doing great work.
        </p>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "draft" ? styles.tabActive : ""}`}
          onClick={() => setTab("draft")}
        >
          Drafts {draftCount > 0 && <span className={styles.badge}>{draftCount}</span>}
        </button>
        <button
          className={`${styles.tab} ${tab === "sent" ? styles.tabActive : ""}`}
          onClick={() => setTab("sent")}
        >
          Sent
        </button>
      </div>

      {loading ? (
        <div className={styles.loadingState}>Loading...</div>
      ) : items.length === 0 ? (
        <div className={styles.emptyState}>
          <p>{tab === "draft" ? "No pending emails. Applaud a story to get started!" : "No sent emails yet."}</p>
        </div>
      ) : (
        <div className={styles.list}>
          {items.map((item) => (
            <div key={item.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardMeta}>
                  <span className={`${styles.statusChip} ${styles[`status_${item.email_status}`] || ""}`}>
                    {item.email_status === "pending_draft" ? "Drafting\u2026" : item.email_status}
                    {item.email_status === "pending_draft" && (
                      <span title="AI is composing a congratulatory email" style={{ cursor: "help", marginLeft: 4 }}>{"\u2139\uFE0F"}</span>
                    )}
                  </span>
                  {item.department && (
                    <span className={styles.department}>{item.department}</span>
                  )}
                </div>
                {item.created_at && (
                  <span className={styles.timestamp}>{new Date(item.created_at).toLocaleDateString()}</span>
                )}
              </div>

              <h3 className={styles.cardTitle}>{item.headline || `Story #${item.feed_story_id}`}</h3>

              {item.email_subject && (
                <div className={styles.emailPreview}>
                  <div className={styles.emailSubject}>Subject: {item.email_subject}</div>
                  {item.recipient_email && (
                    <div className={styles.emailTo}>To: {item.recipient_name || item.recipient_email}</div>
                  )}
                </div>
              )}

              {expandedId === item.id && item.email_body_html && (
                <div
                  className={styles.emailBody}
                  dangerouslySetInnerHTML={{ __html: item.email_body_html }}
                />
              )}

              <div className={styles.cardActions}>
                {item.email_body_html && (
                  <button
                    className={styles.secondaryBtn}
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  >
                    {expandedId === item.id ? "Collapse" : "Preview"}
                  </button>
                )}
                {item.email_status === "draft" && (
                  <button
                    className={styles.primaryBtn}
                    onClick={() => handleSend(item.id, item.recipient_name || item.recipient_email)}
                  >
                    Send Email
                  </button>
                )}
                {item.email_status === "sent" && item.sent_at && (
                  <span className={styles.sentTimestamp}>
                    Sent {new Date(item.sent_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
