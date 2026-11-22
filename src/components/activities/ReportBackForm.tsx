"use client";

import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";

import { createActivityReport, listMyActivityReports, reportErrorMessage } from "@/lib/api/activities";
import { REPORT_ACTIONS, formatDate, type ActivityReport } from "@/lib/activities";

import styles from "./ActivityPage.module.css";

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Report-back for the signed-in resident. Each report is stored privately
 * on the platform; only the person who logged it can list it.
 */
export default function ReportBackForm({
  city,
  activity,
  areaSlug,
  pathKeys,
}: {
  city: string;
  activity: string;
  areaSlug: string;
  pathKeys: string[];
}) {
  const { isAuthenticated, isLoading, loginWithRedirect, getAccessTokenSilently } = useAuth0();
  const [reports, setReports] = useState<ActivityReport[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    action: "added_to_request",
    request_id: "",
    action_date: todayIso(),
    note: "",
  });
  const actions = REPORT_ACTIONS.filter((a) => !a.pathKey || pathKeys.includes(a.pathKey));

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const list = await listMyActivityReports(city, activity, token);
        if (!cancelled) setReports(list);
      } catch {
        // List is a convenience; the form still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, getAccessTokenSilently, city, activity]);

  if (isLoading) return null;
  if (!isAuthenticated) {
    return (
      <div className={styles.actions}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            void loginWithRedirect({
              appState: { returnTo: `${window.location.pathname}${window.location.search}` },
            })
          }
        >
          Sign in to log what you did
        </button>
      </div>
    );
  }

  function update(patch: Partial<typeof form>) {
    setForm((f) => ({ ...f, ...patch }));
    if (status !== "saving") setStatus("idle");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError("");
    try {
      const token = await getAccessTokenSilently();
      // A repair can only be logged on the repair day path; everything else is Path A.
      const pathKey = REPORT_ACTIONS.find((a) => a.value === form.action)?.pathKey ?? "report";
      const saved = await createActivityReport(
        city,
        activity,
        { ...form, path_key: pathKey, area_slug: areaSlug },
        token
      );
      setReports((r) => [saved, ...r]);
      setForm((f) => ({ ...f, request_id: "", note: "" }));
      setStatus("saved");
    } catch (err) {
      setError(reportErrorMessage(err));
      setStatus("error");
    }
  }

  return (
    <>
      <form className={styles.reportForm} onSubmit={submit}>
        <label>
          What you did
          <select value={form.action} onChange={(e) => update({ action: e.target.value })}>
            {actions.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Request number
          <input
            value={form.request_id}
            inputMode="numeric"
            maxLength={32}
            onChange={(e) => update({ request_id: e.target.value })}
          />
        </label>
        <label>
          Date
          <input
            type="date"
            value={form.action_date}
            max={todayIso()}
            required
            onChange={(e) => update({ action_date: e.target.value })}
          />
        </label>
        <label>
          Note (optional)
          <textarea
            value={form.note}
            maxLength={1000}
            rows={3}
            onChange={(e) => update({ note: e.target.value })}
          />
        </label>
        <div className={styles.actions}>
          <button type="submit" className="btn btn-primary" disabled={status === "saving"}>
            {status === "saving" ? "Saving" : "Log it"}
          </button>
          {status === "saved" && <span role="status">Saved.</span>}
          {status === "error" && <span role="alert">{error}</span>}
        </div>
      </form>
      {reports.length > 0 && (
        <>
          <h3 className={styles.subTitle}>Your reports</h3>
          <ol className={styles.steps}>
            {reports.map((r) => (
              <li key={r.id}>
                {formatDate(r.action_date)}: {REPORT_ACTIONS.find((a) => a.value === r.action)?.label ?? r.action}
                {r.request_id ? `, request ${r.request_id}` : ""}
                {r.note ? `. ${r.note}` : ""}
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}
