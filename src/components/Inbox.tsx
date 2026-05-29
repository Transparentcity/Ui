"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { InboxItem, InboxListResponse, listInbox } from "@/lib/apiClient";
import { recordProductEvent } from "@/lib/productAnalytics";
import { trackInboxView } from "@/lib/analytics";
import InboxCard from "./InboxCard";
import styles from "./Inbox.module.css";

// ---------------------------------------------------------------------------
// Empty + loading icons
// ---------------------------------------------------------------------------

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InboxProps {
  surface?: "mobile_bottom_nav" | "desktop_sidebar";
  onOpen: (id: string, item: InboxItem) => void;
  onUnreadCountChange?: (count: number) => void;
  /** Optional billboard rendered above the card list (e.g. onboarding welcome message). */
  billboard?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Inbox({
  surface = "desktop_sidebar",
  onOpen,
  onUnreadCountChange,
  billboard,
}: InboxProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [response, setResponse] = useState<InboxListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const didTrackView = useRef(false);

  const fetchInbox = useCallback(async () => {
    let token: string;
    try {
      token = await getAccessTokenSilently();
    } catch {
      return;
    }
    try {
      const data = await listInbox(token, { limit: 50 });
      setResponse(data);
      setError(null);
      onUnreadCountChange?.(data.unread_count);

      if (!didTrackView.current) {
        didTrackView.current = true;
        const placeCount = data.items.filter((i) => i.scope === "place").length;
        const districtCount = data.items.filter((i) => i.scope === "district").length;
        const cityCount = data.items.filter((i) => i.scope === "city").length;

        recordProductEvent("inbox_view", {
          surface,
          unread_count: data.unread_count,
          total_count: data.items.length,
          place_count: placeCount,
          district_count: districtCount,
          city_count: cityCount,
        });
        trackInboxView({
          surface,
          unread_count: data.unread_count,
          total_count: data.items.length,
          place_count: placeCount,
          district_count: districtCount,
          city_count: cityCount,
        });

        if (data.items.length === 0) {
          recordProductEvent("inbox_empty_view", {});
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      recordProductEvent("inbox_load_failed", { phase: "list", status: "network" });
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently, surface, onUnreadCountChange]);

  // Initial fetch
  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  // Refetch on window focus
  useEffect(() => {
    const onFocus = () => {
      didTrackView.current = false; // allow re-fire on return
      fetchInbox();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchInbox]);

  const handleCardClick = useCallback(
    (id: string, item: InboxItem, position: number) => {
      const wasUnread = !item.is_read;

      // Optimistic unread update
      setResponse((prev) => {
        if (!prev) return prev;
        const items = prev.items.map((it) =>
          it.id === id ? { ...it, is_read: true } : it
        );
        const unread_count = items.filter((it) => !it.is_read).length;
        return { items, unread_count };
      });

      const daysSinceSent =
        item.sent_at
          ? Math.floor(
              (Date.now() - new Date(item.sent_at).getTime()) / 86_400_000
            )
          : 0;

      recordProductEvent("inbox_item_opened", {
        item_id: id,
        item_type: item.type,
        scope: item.scope,
        is_private: item.is_private,
        city_slug: item.city_slug,
        was_unread: wasUnread,
        days_since_sent: daysSinceSent,
        position,
      });

      onOpen(id, item);
    },
    [onOpen, surface, response]
  );

  return (
    <div className={styles.inbox}>
      <header className={styles.inboxHeader}>
        <h1 className={styles.inboxTitle}>Newsletters</h1>
        <p className={styles.inboxSubtitle}>New edition every Sunday</p>
      </header>

      {/* Optional billboard (e.g. onboarding welcome message) */}
      {billboard && (
        <div className={styles.billboardWrapper}>{billboard}</div>
      )}

      {loading && (
        <div className={styles.centeredState}>
          <div className="tc-loader" data-size="md" />
        </div>
      )}

      {!loading && error && (
        <div className={styles.centeredState}>
          <p className={styles.emptyText}>
            Could not load your inbox. Please try again.
          </p>
        </div>
      )}

      {!loading && !error && response?.items.length === 0 && !billboard && (
        <div className={styles.centeredState}>
          <InboxIcon className={styles.emptyIcon} />
          <h3 className={styles.emptyTitle}>No newsletters yet</h3>
          <p className={styles.emptyText}>
            Newsletters from your saved cities and districts will land here.
            Save a city to start.
          </p>
        </div>
      )}

      {!loading && !error && response?.items.length === 0 && billboard && (
        <div className={styles.centeredState} style={{ paddingTop: "var(--space-lg)" }}>
          <InboxIcon className={styles.emptyIcon} />
          <p className={styles.emptyText} style={{ marginTop: 0 }}>
            No prior newsletters yet — check back Sunday.
          </p>
        </div>
      )}

      {!loading && !error && (response?.items.length ?? 0) > 0 && (
        <div className={styles.inboxList} role="list" aria-label="Inbox">
          {response!.items.map((item, idx) => (
            <div key={item.id} role="listitem">
              <InboxCard
                item={item}
                onClick={(id) => handleCardClick(id, item, idx)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
