"use client";

/**
 * NewsletterAdminV2 — scalable newsletter admin UI.
 *
 * Uses the new paginated /api/admin/newsletter/* endpoints instead of the
 * unbounded legacy routes (cap=200/500/3000).  The old NewsletterAdmin.tsx
 * is kept as the fallback until the unified pipeline is fully cut over.
 *
 * Tabs:
 *   Dashboard   — aggregate stats from /stats + link to queue
 *   Queue       — newsletter_pending_sends (paginated, searchable)
 *   Sends       — newsletter_sends log (paginated, searchable)
 *   Subscribers — newsletter_subscribers joined to users (paginated, searchable)
 *   Prompts     — wrapper prompt for unified pipeline (read-only until
 *                 unified jobs are enabled)
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { toast } from "sonner";
import { AdminDataTable } from "@/components/admin/AdminDataTable";
import { API_BASE } from "@/lib/apiBase";

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiFetch(path: string, token: string, params?: Record<string, unknown>) {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    });
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = "dashboard" | "queue" | "sends" | "subscribers" | "prompts";

const TABS: { id: TabId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "queue", label: "Queue" },
  { id: "sends", label: "Sends" },
  { id: "subscribers", label: "Subscribers" },
  { id: "prompts", label: "Prompts" },
];

interface Stats {
  unsent_drafts?: number;
  unified_unsent_drafts?: number;
  sent_this_week?: number;
  active_subscribers?: number;
  stories_scored_today?: number;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function NewsletterAdminV2() {
  const { getAccessTokenSilently } = useAuth0();
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [token, setToken] = useState<string | null>(null);

  // Filters
  const [queueStatus, setQueueStatus] = useState("unsent");
  const [sendSource, setSendSource] = useState("");
  const [cityIdFilter, setCityIdFilter] = useState("");

  useEffect(() => {
    getAccessTokenSilently().then(setToken).catch(() => {});
  }, [getAccessTokenSilently]);

  if (!token) {
    return <div style={{ padding: 24, color: "#9ca3af" }}>Loading…</div>;
  }

  return (
    <div style={{ padding: "0 0 48px" }}>
      {/* Tab nav */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "2px solid #e5e7eb",
          marginBottom: 24,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 20px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid #ad35fa" : "2px solid transparent",
              marginBottom: -2,
              fontWeight: activeTab === tab.id ? 700 : 500,
              fontSize: 14,
              color: activeTab === tab.id ? "#ad35fa" : "#6b7280",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && <DashboardTab token={token} onNavigate={setActiveTab} />}
      {activeTab === "queue" && (
        <QueueTab
          token={token}
          status={queueStatus}
          onStatusChange={setQueueStatus}
          cityId={cityIdFilter}
          onCityIdChange={setCityIdFilter}
        />
      )}
      {activeTab === "sends" && (
        <SendsTab
          token={token}
          source={sendSource}
          onSourceChange={setSendSource}
          cityId={cityIdFilter}
          onCityIdChange={setCityIdFilter}
        />
      )}
      {activeTab === "subscribers" && (
        <SubscribersTab
          token={token}
          cityId={cityIdFilter}
          onCityIdChange={setCityIdFilter}
        />
      )}
      {activeTab === "prompts" && <PromptsTab token={token} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard tab
// ---------------------------------------------------------------------------

function DashboardTab({
  token,
  onNavigate,
}: {
  token: string;
  onNavigate: (tab: TabId) => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    apiFetch("/api/admin/newsletter/stats", token)
      .then(setStats)
      .catch(() => {});
  }, [token]);

  if (!stats) return <div style={{ color: "#9ca3af" }}>Loading stats…</div>;

  const cards = [
    {
      label: "Active subscribers",
      value: stats.active_subscribers ?? "—",
      tab: "subscribers" as TabId,
    },
    {
      label: "Unsent drafts",
      value: stats.unsent_drafts ?? "—",
      tab: "queue" as TabId,
    },
    {
      label: "Unified pipeline drafts",
      value: stats.unified_unsent_drafts ?? "—",
      tab: "queue" as TabId,
    },
    {
      label: "Sent this week",
      value: stats.sent_this_week ?? "—",
      tab: "sends" as TabId,
    },
    {
      label: "Stories scored today",
      value: stats.stories_scored_today ?? "—",
      tab: null,
    },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 20px" }}>
        Newsletter Dashboard
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.label}
            onClick={() => card.tab && onNavigate(card.tab)}
            style={{
              padding: 20,
              borderRadius: 12,
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              cursor: card.tab ? "pointer" : "default",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              if (card.tab) (e.currentTarget as HTMLElement).style.background = "#f3f4f6";
            }}
            onMouseLeave={(e) => {
              if (card.tab) (e.currentTarget as HTMLElement).style.background = "#f9fafb";
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 800, color: "#ad35fa" }}>
              {typeof card.value === "number"
                ? card.value.toLocaleString()
                : card.value}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4, fontWeight: 600 }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Queue tab
// ---------------------------------------------------------------------------

interface QueueItem {
  id: number;
  recipient_email: string;
  subject: string;
  city_name: string;
  district: string;
  draft_type: string;
  generation_mode: string;
  created_at: string;
  sent_at: string | null;
  archived_at: string | null;
  llm_tokens: number | null;
  llm_billed_input_tokens: number | null;
  llm_cache_read_tokens: number | null;
  llm_cache_savings_usd: number | null;
  has_html: boolean;
}

function QueueTab({
  token,
  status,
  onStatusChange,
  cityId,
  onCityIdChange,
}: {
  token: string;
  status: string;
  onStatusChange: (v: string) => void;
  cityId: string;
  onCityIdChange: (v: string) => void;
}) {
  const fetch_ = useCallback(
    ({ q, page, pageSize }: { q: string; page: number; pageSize: number }) =>
      apiFetch("/api/admin/newsletter/queue", token, {
        q: q || undefined,
        page,
        page_size: pageSize,
        status,
        city_id: cityId || undefined,
      }),
    [token, status, cityId]
  );

  const columns = [
    {
      key: "email",
      header: "Recipient",
      render: (r: QueueItem) => (
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>
          {r.recipient_email}
        </span>
      ),
    },
    {
      key: "subject",
      header: "Subject",
      render: (r: QueueItem) => (
        <span
          style={{
            maxWidth: 300,
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={r.subject}
        >
          {r.subject}
        </span>
      ),
      width: "300px",
    },
    {
      key: "city",
      header: "City",
      render: (r: QueueItem) => `${r.city_name || "—"} D${r.district || 0}`,
    },
    {
      key: "type",
      header: "Type",
      render: (r: QueueItem) => (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 10,
            background: r.draft_type === "unified_plan" ? "#f5f0ff" : "#f3f4f6",
            color: r.draft_type === "unified_plan" ? "#ad35fa" : "#6b7280",
          }}
        >
          {r.draft_type || r.generation_mode || "legacy"}
        </span>
      ),
    },
    {
      key: "tokens",
      header: "Tokens",
      render: (r: QueueItem) => {
        if (!r.llm_tokens) return "—";
        const savings = r.llm_cache_savings_usd ?? 0;
        const cacheRead = r.llm_cache_read_tokens ?? 0;
        const title = cacheRead
          ? `${cacheRead.toLocaleString()} tokens served from prompt cache` +
            (savings > 0 ? ` · saved $${savings.toFixed(2)}` : "")
          : undefined;
        return (
          <span title={title}>
            {r.llm_tokens.toLocaleString()}
            {savings > 0 && (
              <span style={{ color: "#16a34a", fontSize: 11, marginLeft: 6 }}>
                −${savings.toFixed(2)}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "created",
      header: "Created",
      render: (r: QueueItem) =>
        r.created_at
          ? new Date(r.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—",
    },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 16px" }}>
        Draft Queue
      </h2>
      <AdminDataTable
        fetchPage={fetch_}
        columns={columns}
        rowKey={(r: QueueItem) => r.id}
        placeholder="Search by email or subject…"
        pageSize={25}
        fetchDeps={[status, cityId]}
        filterControls={
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={status}
              onChange={(e) => onStatusChange(e.target.value)}
              style={_filterSelect}
            >
              <option value="unsent">Unsent</option>
              <option value="sent">Sent</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
            <input
              type="number"
              placeholder="City ID"
              value={cityId}
              onChange={(e) => onCityIdChange(e.target.value)}
              style={{ ..._filterSelect, width: 90 }}
            />
          </div>
        }
        emptyMessage="No drafts found matching the current filters."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sends tab
// ---------------------------------------------------------------------------

interface SendItem {
  id: number;
  to_email: string;
  subject: string;
  city_name: string;
  source: string;
  status: string;
  sent_at: string;
}

function SendsTab({
  token,
  source,
  onSourceChange,
  cityId,
  onCityIdChange,
}: {
  token: string;
  source: string;
  onSourceChange: (v: string) => void;
  cityId: string;
  onCityIdChange: (v: string) => void;
}) {
  const fetch_ = useCallback(
    ({ q, page, pageSize }: { q: string; page: number; pageSize: number }) =>
      apiFetch("/api/admin/newsletter/sends", token, {
        q: q || undefined,
        page,
        page_size: pageSize,
        source: source || undefined,
        city_id: cityId || undefined,
      }),
    [token, source, cityId]
  );

  const columns = [
    {
      key: "email",
      header: "To",
      render: (r: SendItem) => (
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>{r.to_email}</span>
      ),
    },
    {
      key: "subject",
      header: "Subject",
      render: (r: SendItem) => (
        <span
          style={{
            maxWidth: 280,
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={r.subject}
        >
          {r.subject}
        </span>
      ),
      width: "280px",
    },
    { key: "city", header: "City", render: (r: SendItem) => r.city_name || "—" },
    {
      key: "source",
      header: "Source",
      render: (r: SendItem) => (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 10,
            background: r.source === "unified_newsletter" ? "#f5f0ff" : "#f3f4f6",
            color: r.source === "unified_newsletter" ? "#ad35fa" : "#6b7280",
          }}
        >
          {r.source}
        </span>
      ),
    },
    {
      key: "sent",
      header: "Sent",
      render: (r: SendItem) =>
        r.sent_at
          ? new Date(r.sent_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—",
    },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 16px" }}>Send Log</h2>
      <AdminDataTable
        fetchPage={fetch_}
        columns={columns}
        rowKey={(r: SendItem) => r.id}
        placeholder="Search by email or subject…"
        pageSize={25}
        fetchDeps={[source, cityId]}
        filterControls={
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={source}
              onChange={(e) => onSourceChange(e.target.value)}
              style={_filterSelect}
            >
              <option value="">All sources</option>
              <option value="weekly_newsletter">Legacy weekly</option>
              <option value="unified_newsletter">Unified pipeline</option>
              <option value="sample">Sample</option>
            </select>
            <input
              type="number"
              placeholder="City ID"
              value={cityId}
              onChange={(e) => onCityIdChange(e.target.value)}
              style={{ ..._filterSelect, width: 90 }}
            />
          </div>
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscribers tab
// ---------------------------------------------------------------------------

interface SubscriberItem {
  email: string;
  city_name: string;
  district: number;
  frequency: string;
  has_places: boolean;
  place_count: number;
  has_custom_prompt: boolean;
  subscribed_at: string;
  last_sent_at: string | null;
  eligible_story_count: number;
}

function SubscribersTab({
  token,
  cityId,
  onCityIdChange,
}: {
  token: string;
  cityId: string;
  onCityIdChange: (v: string) => void;
}) {
  const [hasPlacesFilter, setHasPlacesFilter] = useState("");

  const fetch_ = useCallback(
    ({ q, page, pageSize }: { q: string; page: number; pageSize: number }) =>
      apiFetch("/api/admin/newsletter/subscribers", token, {
        q: q || undefined,
        page,
        page_size: pageSize,
        city_id: cityId || undefined,
        has_places:
          hasPlacesFilter === "yes"
            ? true
            : hasPlacesFilter === "no"
              ? false
              : undefined,
      }),
    [token, cityId, hasPlacesFilter]
  );

  const columns = [
    {
      key: "email",
      header: "Email",
      render: (r: SubscriberItem) => (
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>{r.email}</span>
      ),
    },
    {
      key: "city",
      header: "City / District",
      render: (r: SubscriberItem) =>
        `${r.city_name || "—"} D${r.district || 0}`,
    },
    {
      key: "places",
      header: "Places",
      render: (r: SubscriberItem) => (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 10,
            background: r.has_places ? "#dcfce7" : "#f3f4f6",
            color: r.has_places ? "#16a34a" : "#6b7280",
          }}
        >
          {r.has_places ? `${r.place_count} place${r.place_count !== 1 ? "s" : ""}` : "None"}
        </span>
      ),
    },
    {
      key: "custom",
      header: "Custom prompt",
      render: (r: SubscriberItem) =>
        r.has_custom_prompt ? (
          <span style={{ color: "#ad35fa", fontWeight: 700, fontSize: 12 }}>Yes</span>
        ) : (
          <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>
        ),
    },
    {
      key: "last_sent",
      header: "Last sent",
      render: (r: SubscriberItem) =>
        r.last_sent_at
          ? new Date(r.last_sent_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          : "Never",
    },
    {
      key: "story_inventory",
      header: "Stories (7d)",
      render: (r: SubscriberItem) => {
        const n = r.eligible_story_count ?? 0;
        const color = n >= 5 ? "#16a34a" : n >= 2 ? "#d97706" : "#dc2626";
        return (
          <span style={{ fontWeight: 700, fontSize: 13, color }}>
            {n}
          </span>
        );
      },
    },
    {
      key: "subscribed",
      header: "Subscribed",
      render: (r: SubscriberItem) =>
        r.subscribed_at
          ? new Date(r.subscribed_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "2-digit",
            })
          : "—",
    },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 16px" }}>
        Subscribers
      </h2>
      <AdminDataTable
        fetchPage={fetch_}
        columns={columns}
        rowKey={(r: SubscriberItem) => r.email}
        placeholder="Search by email…"
        pageSize={25}
        fetchDeps={[cityId, hasPlacesFilter]}
        filterControls={
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={hasPlacesFilter}
              onChange={(e) => setHasPlacesFilter(e.target.value)}
              style={_filterSelect}
            >
              <option value="">All</option>
              <option value="yes">Has saved places</option>
              <option value="no">No saved places</option>
            </select>
            <input
              type="number"
              placeholder="City ID"
              value={cityId}
              onChange={(e) => onCityIdChange(e.target.value)}
              style={{ ..._filterSelect, width: 90 }}
            />
          </div>
        }
        emptyMessage="No subscribers found."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompts tab
// ---------------------------------------------------------------------------

type PromptKey = "unified" | "personalized" | "shared";

interface PromptData {
  unified: string;
  personalized: string;
  shared: string;
  defaultUnified: string;
  defaultPersonalized: string;
  defaultShared: string;
  jobId: number | null;
}

function PromptEditor({
  label,
  badge,
  description,
  value,
  defaultValue,
  saving,
  onSave,
  onChange,
}: {
  label: string;
  badge: React.ReactNode;
  description: React.ReactNode;
  value: string;
  defaultValue: string;
  saving: boolean;
  onSave: () => void;
  onChange: (v: string) => void;
}) {
  const isDefault = value.trim() === defaultValue.trim();
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{label}</h3>
        {badge}
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 10,
            background: isDefault ? "#f3f4f6" : "#fef3c7",
            color: isDefault ? "#6b7280" : "#92400e",
          }}
        >
          {isDefault ? "DEFAULT" : "CUSTOM"}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 10px", lineHeight: 1.5 }}>
        {description}
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          height: 480,
          fontFamily: "monospace",
          fontSize: 12,
          lineHeight: 1.6,
          padding: 14,
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "#fafafa",
          resize: "vertical",
          boxSizing: "border-box",
          color: "#111827",
        }}
        spellCheck={false}
      />
      <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            padding: "7px 18px",
            borderRadius: 8,
            background: saving ? "#e9d5ff" : "#ad35fa",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            border: "none",
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => onChange(defaultValue)}
          disabled={isDefault || saving}
          style={{
            padding: "7px 14px",
            borderRadius: 8,
            background: "#f3f4f6",
            color: isDefault ? "#9ca3af" : "#374151",
            fontWeight: 600,
            fontSize: 13,
            border: "none",
            cursor: isDefault || saving ? "default" : "pointer",
          }}
        >
          Reset to default
        </button>
        <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 2 }}>
          {value.length.toLocaleString()} chars
        </span>
      </div>
    </div>
  );
}

function PromptsTab({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<PromptKey | null>(null);
  const [data, setData] = useState<PromptData>({
    unified: "",
    personalized: "",
    shared: "",
    defaultUnified: "",
    defaultPersonalized: "",
    defaultShared: "",
    jobId: null,
  });
  const [activePrompt, setActivePrompt] = useState<PromptKey>("unified");
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    apiFetch("/api/admin/newsletter-prompts", token)
      .then((d) => {
        setData({
          unified: d.unified_newsletter_prompt ?? "",
          personalized: d.personalized_newsletter_prompt ?? "",
          shared: d.shared_newsletter_prompt ?? "",
          defaultUnified: d.default_unified_prompt ?? "",
          defaultPersonalized: d.default_personalized_prompt ?? "",
          defaultShared: d.default_shared_prompt ?? "",
          jobId: d.custom_job_id ?? null,
        });
      })
      .catch(() => setError("Failed to load prompts."))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSave = async (key: PromptKey) => {
    setSavingKey(key);
    setError("");
    try {
      const body =
        key === "unified"
          ? { unified_newsletter_prompt: data.unified }
          : key === "personalized"
            ? { personalized_newsletter_prompt: data.personalized }
            : { shared_newsletter_prompt: data.shared };
      const res = await fetch(`${API_BASE}/api/admin/newsletter-prompts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      toast.success(
        key === "unified"
          ? "Unified prompt saved."
          : key === "personalized"
            ? "Personalized prompt saved."
            : "Shared prompt saved."
      );
    } catch {
      setError("Save failed.");
      toast.error("Save failed.");
    } finally {
      setSavingKey(null);
    }
  };

  const _tab: React.CSSProperties = {
    padding: "7px 16px",
    borderRadius: 8,
    border: "none",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Newsletter Prompts</h2>
        {data.jobId && (
          <span style={{ fontSize: 12, color: "#9ca3af" }}>weekly_newsletter job {data.jobId}</span>
        )}
      </div>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>
        All three prompts live on a single <code>weekly_newsletter</code> scheduled job.
        The unified assembly pipeline uses the <strong>Unified (plan-based)</strong> prompt;
        the legacy paths use the Personalized and Shared prompts.
      </p>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fee2e2", color: "#dc2626", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Sub-tab switcher */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        <button
          onClick={() => setActivePrompt("unified")}
          style={{
            ..._tab,
            background: activePrompt === "unified" ? "#ad35fa" : "#f3f4f6",
            color: activePrompt === "unified" ? "#fff" : "#374151",
          }}
        >
          Unified (plan-based)
        </button>
        <button
          onClick={() => setActivePrompt("personalized")}
          style={{
            ..._tab,
            background: activePrompt === "personalized" ? "#ad35fa" : "#f3f4f6",
            color: activePrompt === "personalized" ? "#fff" : "#374151",
          }}
        >
          Personalized (legacy)
        </button>
        <button
          onClick={() => setActivePrompt("shared")}
          style={{
            ..._tab,
            background: activePrompt === "shared" ? "#ad35fa" : "#f3f4f6",
            color: activePrompt === "shared" ? "#fff" : "#374151",
          }}
        >
          Shared / Citywide (legacy)
        </button>
      </div>

      {loading ? (
        <div style={{ color: "#9ca3af", fontSize: 14, padding: "24px 0" }}>Loading prompts…</div>
      ) : activePrompt === "unified" ? (
        <PromptEditor
          label="Unified prompt (plan-based)"
          badge={
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#dcfce7", color: "#15803d" }}>
              ACTIVE — unified draft assembly
            </span>
          }
          description={
            <>
              Used by the unified draft-assembly pipeline. Seymour researches with tools
              guided by the pre-ranked story slate, then submits a structured plan via{" "}
              <code>submit_newsletter_plan</code> — it never writes HTML. The platform
              renders the Public Record layout and the Citywide Scorecard deterministically.
              Placeholders: <code>{"{subs_text}"}</code> <code>{"{instructions_block}"}</code>{" "}
              <code>{"{city_id}"}</code> <code>{"{district_int}"}</code>{" "}
              <code>{"{city_name}"}</code>. Changes take effect on the next
              draft-assembly run.
            </>
          }
          value={data.unified}
          defaultValue={data.defaultUnified}
          saving={savingKey === "unified"}
          onSave={() => handleSave("unified")}
          onChange={(v) => setData((d) => ({ ...d, unified: v }))}
        />
      ) : activePrompt === "personalized" ? (
        <PromptEditor
          label="Personalized prompt (legacy)"
          badge={
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#f3f4f6", color: "#6b7280" }}>
              LEGACY — per-subscriber HTML sends
            </span>
          }
          description={
            <>
              Used by the legacy per-subscriber pipeline, where Seymour writes the full
              email HTML via <code>submit_newsletter</code>. Not used by the unified
              plan-based pipeline.
            </>
          }
          value={data.personalized}
          defaultValue={data.defaultPersonalized}
          saving={savingKey === "personalized"}
          onSave={() => handleSave("personalized")}
          onChange={(v) => setData((d) => ({ ...d, personalized: v }))}
        />
      ) : (
        <PromptEditor
          label="Shared / Citywide prompt (legacy)"
          badge={
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#f3f4f6", color: "#6b7280" }}>
              LEGACY — shared city sends only
            </span>
          }
          description={
            <>
              Used only by the old shared city-level newsletter path. Not used by the
              unified pipeline or per-subscriber personalized sends.
            </>
          }
          value={data.shared}
          defaultValue={data.defaultShared}
          saving={savingKey === "shared"}
          onSave={() => handleSave("shared")}
          onChange={(v) => setData((d) => ({ ...d, shared: v }))}
        />
      )}

      <div
        style={{
          marginTop: 24,
          padding: 14,
          borderRadius: 10,
          background: "#f5f0ff",
          border: "1px solid #e4d9ff",
          fontSize: 13,
          color: "#6b21a8",
        }}
      >
        <strong>Scoring config</strong> (severity tiers, slot weights) is in{" "}
        <code>story_scoring_service.py</code> and{" "}
        <code>newsletter_selector.py</code>. These are audited in code review,
        not editable at runtime.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const _filterSelect: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 13,
  background: "#fff",
  color: "#374151",
};
