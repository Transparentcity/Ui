"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useState } from "react";
import {
  listInboundEmails,
  getInboundEmail,
  listOutboundEmails,
  getOutboundEmail,
  type InboundEmailListItem,
  type InboundEmailDetail,
  type OutboundEmailListItem,
  type OutboundEmailDetail,
} from "@/lib/apiClient";
import styles from "./EmailAdmin.module.css";

type Tab = "inbox" | "outbox";

export default function EmailAdmin() {
  const { getAccessTokenSilently } = useAuth0();
  const [tab, setTab] = useState<Tab>("inbox");
  const [emails, setEmails] = useState<InboundEmailListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<InboundEmailDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [outboundEmails, setOutboundEmails] = useState<OutboundEmailListItem[]>([]);
  const [outboundTotal, setOutboundTotal] = useState(0);
  const [outboundOffset, setOutboundOffset] = useState(0);
  const [outboundLoading, setOutboundLoading] = useState(false);
  const [selectedOutboundId, setSelectedOutboundId] = useState<number | string | null>(null);
  const [selectedNewsletterSend, setSelectedNewsletterSend] = useState<OutboundEmailListItem | null>(null);
  const [outboundDetail, setOutboundDetail] = useState<OutboundEmailDetail | null>(null);
  const [outboundDetailLoading, setOutboundDetailLoading] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await listInboundEmails(token, {
        status: statusFilter || undefined,
        limit,
        offset,
      });
      setEmails(res.emails);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inbox");
      setEmails([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently, statusFilter, limit, offset]);

  const loadOutboundList = useCallback(async () => {
    setOutboundLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await listOutboundEmails(token, { limit, offset: outboundOffset });
      setOutboundEmails(res.emails);
      setOutboundTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load outbox");
      setOutboundEmails([]);
      setOutboundTotal(0);
    } finally {
      setOutboundLoading(false);
    }
  }, [getAccessTokenSilently, limit, outboundOffset]);

  useEffect(() => {
    if (tab === "inbox") loadList();
    else loadOutboundList();
  }, [tab, loadList, loadOutboundList]);

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    getAccessTokenSilently()
      .then((token) => getInboundEmail(selectedId, token))
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, getAccessTokenSilently]);

  useEffect(() => {
    if (selectedOutboundId == null) {
      setOutboundDetail(null);
      setSelectedNewsletterSend(null);
      return;
    }
    const isNewsletterSend = typeof selectedOutboundId === "string" && String(selectedOutboundId).startsWith("ns-");
    if (isNewsletterSend) {
      const item = outboundEmails.find((e) => e.id === selectedOutboundId);
      setSelectedNewsletterSend(item || null);
      setOutboundDetail(null);
      setOutboundDetailLoading(false);
      return;
    }
    setSelectedNewsletterSend(null);
    let cancelled = false;
    setOutboundDetailLoading(true);
    getAccessTokenSilently()
      .then((token) => getOutboundEmail(selectedOutboundId as number, token))
      .then((d) => {
        if (!cancelled) setOutboundDetail(d);
      })
      .catch(() => {
        if (!cancelled) setOutboundDetail(null);
      })
      .finally(() => {
        if (!cancelled) setOutboundDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOutboundId, outboundEmails, getAccessTokenSilently]);

  const formatDate = (s: string | null) => {
    if (!s) return "—";
    try {
      return new Date(s).toLocaleString(undefined, {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return s;
    }
  };

  const isRefreshing = tab === "inbox" ? loading : outboundLoading;

  const handleRefresh = () => {
    if (tab === "inbox") {
      void loadList();
    } else {
      void loadOutboundList();
    }
  };

  return (
    <div className={styles.container}>
      <p className={styles.intro}>
        <strong>Inbox:</strong> Mail sent to seymour@transparent.city (forwarded via
        the parse subdomain) and Seymour&apos;s replies.{" "}
        <strong>Sent items:</strong> Newsletters Seymour generated and sent (e.g. &quot;Generate sample newsletter&quot;).
        Each sample is emailed to the user who requested it and logged here.
      </p>

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={tab === "inbox" ? styles.tabActive : styles.tab}
            onClick={() => {
              setTab("inbox");
              setSelectedOutboundId(null);
            }}
          >
            Inbox
          </button>
          <button
            type="button"
            className={tab === "outbox" ? styles.tabActive : styles.tab}
            onClick={() => {
              setTab("outbox");
              setSelectedId(null);
            }}
          >
            Sent items
          </button>
        </div>

        <div className={styles.toolbarActions}>
          {tab === "inbox" && (
            <div className={styles.filterRow}>
              <label htmlFor="email-admin-status" className={styles.label}>
                Status
              </label>
              <select
                id="email-admin-status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setOffset(0);
                }}
                className={styles.select}
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="retry">Retry</option>
                <option value="processing">Processing</option>
                <option value="replied">Replied</option>
                <option value="failed">Failed</option>
                <option value="auto_filtered">Auto-filtered</option>
                <option value="throttled">Throttled</option>
              </select>
            </div>
          )}
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Refresh"
          >
            {isRefreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.listPanel}>
          {tab === "inbox" && (
            <>
              {loading ? (
                <p className={styles.muted}>Loading inbox…</p>
              ) : emails.length === 0 ? (
                <p className={styles.muted}>
                  {total === 0 ? "No inbound emails." : "No more emails in this range."}
                </p>
              ) : (
                <>
                  <p className={styles.muted}>
                    {total} total · showing {offset + 1}–{Math.min(offset + limit, total)}
                  </p>
                  <ul className={styles.emailList}>
                    {emails.map((e) => (
                      <li
                        key={e.id}
                        className={`${styles.emailItem} ${selectedId === e.id ? styles.emailItemSelected : ""}`}
                      >
                        <button
                          type="button"
                          className={styles.emailItemBtn}
                          onClick={() => setSelectedId(e.id)}
                        >
                          <span className={styles.emailFrom}>
                            {e.from_name || e.from_email}
                          </span>
                          <span className={styles.emailSubject}>
                            {e.subject || "(no subject)"}
                          </span>
                          <span className={styles.emailMeta}>
                            {formatDate(e.received_at)} · {e.status}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className={styles.pagination}>
                    <button
                      type="button"
                      disabled={offset === 0}
                      onClick={() => setOffset((o) => Math.max(0, o - limit))}
                      className={styles.pageBtn}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={offset + limit >= total}
                      onClick={() => setOffset((o) => o + limit)}
                      className={styles.pageBtn}
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          {tab === "outbox" && (
            <>
              {outboundLoading ? (
                <p className={styles.muted}>Loading outbox…</p>
              ) : outboundEmails.length === 0 ? (
                <p className={styles.muted}>
                  {outboundTotal === 0 ? "No outbound emails." : "No more in this range."}
                </p>
              ) : (
                <>
                  <p className={styles.muted}>
                    {outboundTotal} total · showing {outboundOffset + 1}–
                    {Math.min(outboundOffset + limit, outboundTotal)}
                  </p>
                  <ul className={styles.emailList}>
                    {outboundEmails.map((e) => (
                      <li
                        key={e.id}
                        className={`${styles.emailItem} ${selectedOutboundId === e.id ? styles.emailItemSelected : ""}`}
                      >
                        <button
                          type="button"
                          className={styles.emailItemBtn}
                          onClick={() => setSelectedOutboundId(Number(e.id))}
                        >
                          <span className={styles.emailFrom}>{e.to_email}</span>
                          <span className={styles.emailSubject}>
                            {e.subject || "(no subject)"}
                          </span>
                          <span className={styles.emailMeta}>
                            {formatDate(e.created_at)} · {e.source}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className={styles.pagination}>
                    <button
                      type="button"
                      disabled={outboundOffset === 0}
                      onClick={() => setOutboundOffset((o) => Math.max(0, o - limit))}
                      className={styles.pageBtn}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={outboundOffset + limit >= outboundTotal}
                      onClick={() => setOutboundOffset((o) => o + limit)}
                      className={styles.pageBtn}
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className={styles.detailPanel}>
          {tab === "inbox" && (
            <>
              {selectedId == null ? (
                <p className={styles.muted}>Select an email to view body and reply.</p>
              ) : loadingDetail ? (
                <p className={styles.muted}>Loading…</p>
              ) : detail ? (
                <div className={styles.detailContent}>
                  <div className={styles.detailRow}>
                    <strong>From:</strong>{" "}
                    {detail.from_name ? `${detail.from_name} <${detail.from_email}>` : detail.from_email}
                  </div>
                  <div className={styles.detailRow}>
                    <strong>To:</strong> {detail.to_email}
                  </div>
                  <div className={styles.detailRow}>
                    <strong>Subject:</strong> {detail.subject || "(no subject)"}
                  </div>
                  <div className={styles.detailRow}>
                    <strong>Received:</strong> {formatDate(detail.received_at)}
                  </div>
                  <div className={styles.detailRow}>
                    <strong>Status:</strong> {detail.status}
                    {detail.retry_count > 0 && ` (retries: ${detail.retry_count})`}
                  </div>
                  {detail.error_message && (
                    <div className={styles.detailRow}>
                      <strong>Error:</strong>{" "}
                      <span className={styles.errorText}>{detail.error_message}</span>
                    </div>
                  )}
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>Body</h3>
                    <div
                      className={styles.bodyBlock}
                      dangerouslySetInnerHTML={{
                        __html:
                          detail.body_html ||
                          (detail.body_plain
                            ? detail.body_plain.replace(/\n/g, "<br/>")
                            : "<em>No body content was captured for this email. " +
                              "(Emails received before the raw-MIME parsing fix " +
                              "were stored without bodies.)</em>"),
                      }}
                    />
                  </div>
                  {detail.response_text && (
                    <div className={styles.section}>
                      <h3 className={styles.sectionTitle}>
                        Seymour&apos;s reply
                        {detail.responded_at && ` (${formatDate(detail.responded_at)})`}
                      </h3>
                      <div
                        className={styles.bodyBlock}
                        dangerouslySetInnerHTML={{
                          __html: detail.response_text,
                        }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <p className={styles.muted}>Could not load email.</p>
              )}
            </>
          )}
          {tab === "outbox" && (
            <>
              {selectedOutboundId == null ? (
                <p className={styles.muted}>Select an email to view subject, prompt, and body.</p>
              ) : outboundDetailLoading ? (
                <p className={styles.muted}>Loading…</p>
              ) : selectedNewsletterSend ? (
                <div className={styles.detailContent}>
                  <div className={styles.detailRow}>
                    <strong>To:</strong> {selectedNewsletterSend.to_email}
                  </div>
                  {selectedNewsletterSend.intended_email && (
                    <div className={styles.detailRow}>
                      <strong>Intended recipient:</strong> {selectedNewsletterSend.intended_email}
                    </div>
                  )}
                  <div className={styles.detailRow}>
                    <strong>Subject:</strong> {selectedNewsletterSend.subject || "(no subject)"}
                  </div>
                  <div className={styles.detailRow}>
                    <strong>Sent:</strong> {formatDate(selectedNewsletterSend.created_at)}
                  </div>
                  <div className={styles.detailRow}>
                    <strong>Source:</strong> {selectedNewsletterSend.source}
                  </div>
                  {selectedNewsletterSend.job_id && (
                    <div className={styles.detailRow}>
                      <strong>Job ID:</strong> {selectedNewsletterSend.job_id}
                    </div>
                  )}
                  {selectedNewsletterSend.session_id && (
                    <div className={styles.detailRow}>
                      <strong>Session ID:</strong> {selectedNewsletterSend.session_id}
                    </div>
                  )}
                  <p className={styles.muted} style={{ marginTop: 12, fontSize: "12px" }}>
                    Weekly newsletter sends are logged here. Full content is in the session.
                  </p>
                </div>
              ) : outboundDetail ? (
                <div className={styles.detailContent}>
                  <div className={styles.detailRow}>
                    <strong>To:</strong> {outboundDetail.to_email}
                  </div>
                  <div className={styles.detailRow}>
                    <strong>Subject:</strong> {outboundDetail.subject || "(no subject)"}
                  </div>
                  <div className={styles.detailRow}>
                    <strong>Sent:</strong> {formatDate(outboundDetail.created_at)}
                  </div>
                  {outboundDetail.prompt_text && (
                    <div className={styles.detailRow} style={{ marginTop: 8 }}>
                      <span className={styles.muted} style={{ fontSize: "12px" }}>
                        Prompt: {outboundDetail.prompt_text}
                      </span>
                    </div>
                  )}
                  <div className={styles.section} style={{ marginTop: 16 }}>
                    <div
                      className={styles.bodyBlock}
                      dangerouslySetInnerHTML={{
                        __html:
                          outboundDetail.body_html ||
                          (outboundDetail.body_plain
                            ? outboundDetail.body_plain.replace(/\n/g, "<br/>")
                            : "(empty)"),
                      }}
                    />
                  </div>
                </div>
              ) : (
                <p className={styles.muted}>Could not load email.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
