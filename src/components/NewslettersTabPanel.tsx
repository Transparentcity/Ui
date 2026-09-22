"use client";

import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";
import {
  listNewsletterEditionsAdmin,
  type InboxItem,
  type NewsletterEditionAdminItem,
} from "@/lib/apiClient";
import InboxCard from "./InboxCard";
import Loader from "./Loader";
import "./NewslettersTabPanel.css";

interface NewslettersTabPanelProps {
  cityId: number;
  cityName: string;
  onClose?: () => void;
}

export default function NewslettersTabPanel({
  cityId,
  cityName,
  onClose,
}: NewslettersTabPanelProps) {
  const router = useRouter();
  const { getAccessTokenSilently } = useAuth0();
  const [editions, setEditions] = useState<NewsletterEditionAdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadEditions = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getAccessTokenSilently();
        const response = await listNewsletterEditionsAdmin(token, {
          cityId,
          limit: 200,
        });
        setEditions(
          [...response.items].sort((a, b) => {
            const dateOrder = (b.edition_date ?? "").localeCompare(
              a.edition_date ?? "",
            );
            if (dateOrder !== 0) return dateOrder;
            return (b.created_at ?? "").localeCompare(a.created_at ?? "");
          }),
        );
      } catch (err: unknown) {
        console.error("Failed to load newsletter editions:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load newsletters",
        );
      } finally {
        setLoading(false);
      }
    };

    void loadEditions();
  }, [cityId, getAccessTokenSilently]);

  const inboxItems: InboxItem[] = editions.map((edition) => {
    const district = edition.district > 0 ? String(edition.district) : null;
    const sentAt = edition.edition_date
      ? `${edition.edition_date}T12:00:00Z`
      : edition.created_at ?? new Date(0).toISOString();
    return {
      id: `edition:${edition.short_hash ?? edition.id}`,
      type: "edition",
      subject: edition.subject,
      preview: edition.preview,
      cover_image_url: edition.cover_image_url,
      sent_at: sentAt,
      is_read: true,
      is_private: false,
      scope: district ? "district" : "city",
      city_id: edition.city_id,
      city_name: edition.city_name || cityName,
      city_slug: edition.city_slug,
      city_emoji: edition.city_emoji,
      district,
      district_label: district ? `D${district}` : null,
      place_id: null,
      place_name: null,
      public_url:
        edition.city_slug && edition.short_hash
          ? `/c/${edition.city_slug}/newsletter/${edition.short_hash}`
          : null,
    };
  });

  if (loading) {
    return (
      <div className="newsletters-tab-panel">
        <div className="newsletters-loading">
          <Loader size="md" color="dark" />
          <p>Loading newsletters...</p>
        </div>
      </div>
    );
  }

  if (error && !editions.length) {
    return (
      <div className="newsletters-tab-panel">
        <div className="newsletters-error">
          <p>Error: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="newsletters-tab-panel">
      <div className="newsletters-header">
        <div className="newsletters-header-top">
          <h2>Newsletters</h2>
          {onClose && (
            <button
              className="newsletters-close-btn"
              onClick={onClose}
              aria-label="Close newsletters panel"
            >
              ✕
            </button>
          )}
        </div>
        <p className="newsletters-subtitle">
          Citywide and district editions for {cityName}
        </p>
      </div>

      {error && editions.length > 0 && (
        <div className="newsletters-error" style={{ marginBottom: "16px", padding: "12px", borderRadius: "8px", background: "var(--bg-secondary)" }}>
          <p style={{ margin: 0 }}>Error: {error}</p>
        </div>
      )}

      {inboxItems.length === 0 ? (
        <div className="newsletters-empty">
          <p>No shared newsletter editions found for this city.</p>
        </div>
      ) : (
        <div className="newsletters-list">
          {inboxItems.map((item) => (
            <InboxCard
              key={item.id}
              item={item}
              onClick={() => {
                if (item.public_url) router.push(item.public_url);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
