"use client";

/**
 * PeopleActivityPanel — admin-only "People" tab. Usage and output for every
 * chat-enabled system user: admins, city leads, analysts, and anyone else who
 * chatted in the window. Replaces the standalone /admin/city-leads page.
 */

import { Fragment, useCallback, useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  getPeopleActivity,
  type PeopleActivityResponse,
  type PersonActivity,
  type PersonRole,
} from "@/lib/apiClient";
import { money, StatCard } from "@/components/analytics/dashboardParts";
import styles from "./ProductAnalyticsDashboard.module.css";

const WINDOWS = [7, 14, 30, 90];

const ROLE_LABELS: Record<PersonRole, string> = {
  admin: "Admin",
  city_lead: "City lead",
  analyst: "Analyst",
  chat_user: "Chat user",
};

type RoleFilter = "all" | PersonRole;

function PersonDetail({ person }: { person: PersonActivity }) {
  const sessions = person.chats.sessions.slice(0, 10);
  return (
    <div style={{ padding: "8px 12px", fontSize: 12 }}>
      <div style={{ marginBottom: 6 }}>
        <strong>Cities:</strong>{" "}
        {person.cities.length ? person.cities.map((c) => c.name ?? c.city_id).join(", ") : "—"}
      </div>
      {person.llm_spend.by_context.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <strong>Spend by context:</strong>{" "}
          {person.llm_spend.by_context
            .map((c) => `${c.context.replace(/_/g, " ")} ${money(c.cost_usd)}`)
            .join(" · ")}
        </div>
      )}
      {person.produced.by_action.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <strong>Changes:</strong>{" "}
          {person.produced.by_action.map((a) => `${a.action} ×${a.count}`).join(" · ")}
        </div>
      )}
      {sessions.length > 0 && (
        <div>
          <strong>Recent chats:</strong>
          <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
            {sessions.map((s) => (
              <li key={s.session_id}>
                {s.title || "Untitled"} · {s.message_count} messages · {money(s.cost_usd)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function PeopleActivityPanel() {
  const { getAccessTokenSilently } = useAuth0();
  const [days, setDays] = useState(30);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [data, setData] = useState<PeopleActivityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      setData(await getPeopleActivity(token, { days }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load people");
    } finally {
      setLoading(false);
    }
  }, [days, getAccessTokenSilently]);

  useEffect(() => {
    void load();
  }, [load]);

  const people = (data?.people ?? []).filter(
    (p) => roleFilter === "all" || p.roles.includes(roleFilter)
  );
  const filteredCost = people.reduce((sum, p) => sum + p.llm_spend.total_cost_usd, 0);
  const metricsCreated = people.reduce((sum, p) => sum + p.produced.metrics_created, 0);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <div className={styles.chartCardHeader} style={{ marginBottom: 12 }}>
        <div className={styles.filterGroup}>
          <select
            className={styles.metricSelect}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            aria-label="Role"
          >
            <option value="all">All roles</option>
            {(Object.keys(ROLE_LABELS) as PersonRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.toolbar}>
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              className={days === w ? styles.presetBtnActive : styles.presetBtn}
              onClick={() => setDays(w)}
            >
              L{w}
            </button>
          ))}
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}
      {loading && !data && <div className={styles.loading}>Loading people…</div>}

      {data && (
        <>
          <div className={styles.statGrid}>
            <StatCard label="LLM spend" value={money(filteredCost)} highlight />
            <StatCard label="People" value={String(people.length)} />
            <StatCard label="Metrics created" value={String(metricsCreated)} />
          </div>
          <p className={styles.note}>
            Counts cover the selected window; Last chat is all-time. Active days come from
            first-party events, not logins. Spend is all{" "}
            <code>token_usage_log</code> rows for the person; job-generated stories are counted on
            the city dashboards instead. Metrics created come from the audit log.
          </p>
          <div className={styles.section}>
            <div className={styles.card}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {[
                      "Person",
                      "Role",
                      "Active days",
                      "Chats",
                      "Last chat",
                      "Messages",
                      "Metrics created",
                      "Changes",
                      "LLM spend",
                    ].map((h, i) => (
                      <th key={h} className={i > 1 ? styles.thRight : styles.th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => (
                    <Fragment key={p.user_id}>
                      <tr onClick={() => toggle(p.user_id)} style={{ cursor: "pointer" }}>
                        <td className={styles.td}>
                          <div>{p.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-secondary, #888)" }}>
                            {p.email}
                          </div>
                        </td>
                        <td className={styles.td}>{p.roles.map((r) => ROLE_LABELS[r]).join(", ")}</td>
                        <td className={styles.tdRight}>{p.presence.active_days}</td>
                        <td className={styles.tdRight}>{p.chats.session_count}</td>
                        <td className={styles.tdRight}>
                          {p.chats.last_chat_at
                            ? new Date(p.chats.last_chat_at).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            : "Never"}
                        </td>
                        <td className={styles.tdRight}>{p.chats.message_count}</td>
                        <td className={styles.tdRight}>{p.produced.metrics_created}</td>
                        <td className={styles.tdRight}>
                          {p.produced.available ? p.produced.total : "—"}
                        </td>
                        <td className={styles.tdRight}>{money(p.llm_spend.total_cost_usd)}</td>
                      </tr>
                      {expanded.has(p.user_id) && (
                        <tr>
                          <td colSpan={9} className={styles.subRowsWrap}>
                            <PersonDetail person={p} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
