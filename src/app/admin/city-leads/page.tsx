"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AdminGuard } from "@/components/AdminGuard";
import Loader from "@/components/Loader";
import {
  getCityLeadActivity,
  type CityLeadActivity,
  type CityLeadActivityResponse,
} from "@/lib/apiClient";
import { useImpersonationCacheKey } from "@/lib/impersonation";

/**
 * What the city managers have been doing, week by week.
 *
 * Admin only, deliberately: this reports on the city leads, so it is not
 * theirs to read. The same data is emailed weekly by the platform; this page
 * is for looking mid-week.
 *
 * Chat summaries cost a model call per lead, so they are behind a toggle
 * rather than loaded with the page.
 */

const WINDOWS = [7, 14, 30];

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--border, #e5e5e5)",
        borderRadius: 8,
        padding: "12px 14px",
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1 }}>{value}</div>
      {hint ? (
        <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>{hint}</div>
      ) : null}
    </div>
  );
}

function LeadPanel({ lead, days }: { lead: CityLeadActivity; days: number }) {
  const cities = lead.cities.map((c) => c.name).filter(Boolean).join(", ");
  const lastSeen = lead.presence.last_seen
    ? new Date(lead.presence.last_seen).toLocaleString()
    : "never";

  return (
    <section
      style={{
        borderBottom: "1px solid var(--border, #e5e5e5)",
        padding: "24px 0",
      }}
    >
      <h2 style={{ margin: "0 0 2px", fontSize: 18 }}>{lead.name}</h2>
      <p style={{ margin: "0 0 16px", color: "#888", fontSize: 13 }}>
        {cities || "No city assigned"} &middot; {lead.email}
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard
          label="Active days"
          value={`${lead.presence.active_days} / ${days}`}
          hint="days with activity, not logins"
        />
        <StatCard label="Visits" value={String(lead.presence.sessions)} />
        <StatCard label="Chats" value={String(lead.chats.session_count)} />
        <StatCard label="Chat messages" value={String(lead.chats.message_count)} />
        <StatCard
          label="LLM spend"
          value={`$${lead.llm_spend.total_cost_usd.toFixed(2)}`}
        />
        {lead.produced.available ? (
          <StatCard label="Changes" value={String(lead.produced.total)} />
        ) : null}
      </div>

      <p style={{ fontSize: 13, color: "#666", margin: "0 0 16px" }}>
        Last seen {lastSeen}
      </p>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div>
          <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Where they spent time</h3>
          {lead.feature_use.views.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
              {lead.feature_use.views.slice(0, 8).map((v) => (
                <li key={v.view}>
                  {v.view} <span style={{ color: "#999" }}>({v.count})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: 13, color: "#888", margin: 0 }}>
              No in-app view events. Either they did not visit, or their
              browser is running a build from before view tracking shipped.
            </p>
          )}
        </div>

        <div>
          <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Chats</h3>
          {lead.chats.sessions.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
              {lead.chats.sessions.slice(0, 10).map((s) => (
                <li key={s.session_id}>
                  {s.title || "Untitled"}{" "}
                  <span style={{ color: "#999" }}>({s.message_count} messages)</span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: 13, color: "#888", margin: 0 }}>
              No chats in this window.
            </p>
          )}
        </div>

        <div>
          <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>What they changed</h3>
          {!lead.produced.available ? (
            <p style={{ fontSize: 13, color: "#888", margin: 0 }}>
              Audit log not present in this environment.
            </p>
          ) : lead.produced.entries.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
              {lead.produced.entries.slice(0, 10).map((e, i) => (
                <li key={`${e.action}-${e.entity_id}-${i}`}>
                  <code style={{ fontSize: 12 }}>{e.action}</code>{" "}
                  {e.summary || e.entity_id}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: 13, color: "#888", margin: 0 }}>
              No audited changes in this window.
            </p>
          )}
        </div>
      </div>

      {lead.chat_summary ? (
        <div
          style={{
            marginTop: 20,
            padding: 14,
            background: "#f7f7f5",
            borderLeft: "3px solid #ccc",
            whiteSpace: "pre-wrap",
            fontSize: 14,
          }}
        >
          {lead.chat_summary}
        </div>
      ) : null}
    </section>
  );
}

function CityLeadsInner() {
  const { getAccessTokenSilently } = useAuth0();
  const identityKey = useImpersonationCacheKey();
  const [days, setDays] = useState(7);
  const [summarize, setSummarize] = useState(false);

  const activityQuery = useQuery<CityLeadActivityResponse>({
    queryKey: ["admin", "city-lead-activity", identityKey, days, summarize],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return getCityLeadActivity(token, { days, summarize });
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 24 }}>City manager activity</h1>
      <p style={{ margin: "0 0 24px", color: "#888", fontSize: 13 }}>
        Presence is measured in active days from first-party product events.
        The platform keeps no login records.
      </p>

      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24 }}>
        <label style={{ fontSize: 14 }}>
          Window{" "}
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ padding: "4px 8px" }}
          >
            {WINDOWS.map((w) => (
              <option key={w} value={w}>
                {w} days
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={summarize}
            onChange={(e) => setSummarize(e.target.checked)}
          />
          Summarize chats
          <span style={{ color: "#aaa", fontSize: 12 }}>(one model call per manager)</span>
        </label>
      </div>

      {activityQuery.isLoading ? <Loader /> : null}

      {activityQuery.isError ? (
        <p style={{ color: "#b00" }}>
          Could not load activity. You need global admin access for this page.
        </p>
      ) : null}

      {activityQuery.data && activityQuery.data.leads.length === 0 ? (
        <p style={{ color: "#888" }}>
          No city leads are assigned yet.
        </p>
      ) : null}

      {activityQuery.data?.leads.map((lead) => (
        <LeadPanel key={lead.user_id} lead={lead} days={activityQuery.data.window_days} />
      ))}
    </div>
  );
}

export default function CityLeadsPage() {
  return (
    <AdminGuard fallbackUrl="/home">
      <CityLeadsInner />
    </AdminGuard>
  );
}
