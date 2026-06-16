"use client";

import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";

import { Mono } from "@/components/admin/waste/primitives";
import { sendChatMessage } from "@/lib/api/chat";
import type { SeymourData } from "@/lib/wasteFixtures";
import styles from "./feed.module.css";

function SeymourBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const cls = `${styles.seymourBadge} ${size === "md" ? styles.seymourBadgeMd : styles.seymourBadgeSm}`;
  return (
    <span className={cls}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2l2.4 6.4L21 11l-6.6 2.6L12 22l-2.4-8.4L3 11l6.6-2.6z" />
      </svg>
      Seymour
    </span>
  );
}

type Props = {
  data: SeymourData;
  onCollapse: () => void;
  isQuiet: boolean;
};

export function SeymourRail({ data, onCollapse, isQuiet }: Props) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const [question, setQuestion] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [thread, setThread] = useState<{ role: "user" | "seymour"; text: string }[]>([]);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const handleAsk = async () => {
    const trimmed = question.trim();
    if (!trimmed || asking) return;
    setAsking(true);
    setAskError(null);
    setThread(prev => [...prev, { role: "user", text: trimmed }]);
    setQuestion("");
    try {
      const token = isAuthenticated ? await getAccessTokenSilently() : "";
      const res = await sendChatMessage(
        { message: trimmed, session_id: sessionId ?? undefined },
        token
      );
      setSessionId(res.session_id);
      setThread(prev => [...prev, { role: "seymour", text: res.response }]);
    } catch (e) {
      setAskError(e instanceof Error ? e.message : "Couldn't reach Seymour");
    } finally {
      setAsking(false);
    }
  };

  return (
    <aside className={styles.seymour} aria-label="Seymour analyst rail">
      <div className={styles.seymourHeader}>
        <div className={styles.seymourTitleRow}>
          <SeymourBadge size="md" />
          <span className={styles.seymourEyebrow}>Analyst rail</span>
        </div>
        <button type="button" onClick={onCollapse} title="Collapse" aria-label="Collapse Seymour rail" className={styles.collapseBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className={styles.seymourAsk}>
        <label htmlFor="seymour-ask" className={styles.seymourAskLabel}>Ask Seymour</label>
        <textarea
          id="seymour-ask"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleAsk();
            }
          }}
          rows={2}
          placeholder="e.g. Why is THE BANK OF NEW YORK MELLON flagged?"
          className={styles.seymourAskInput}
          disabled={asking}
        />
        <div className={styles.seymourAskRow}>
          <span className={styles.seymourAskHint}>⌘+Enter to send</span>
          <button
            type="button"
            onClick={handleAsk}
            disabled={asking || !question.trim()}
            className={styles.seymourAskBtn}
          >
            {asking ? "Asking…" : "Ask →"}
          </button>
        </div>
        {askError && <div className={styles.seymourAskError} role="alert">{askError}</div>}
        {thread.length > 0 && (
          <div className={styles.seymourAskThread}>
            {thread.map((m, i) => (
              <div key={i} className={m.role === "user" ? styles.seymourAskUser : styles.seymourAskReply}>
                {m.text}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.seymourScroll}>
        <div className={styles.seymourSection}>
          <div className={styles.seymourSectionHead}>
            <span className={styles.seymourEyebrowTeal}>Today&apos;s read</span>
            <Mono color="#9ca3af">{data.generatedAt}</Mono>
          </div>
          {isQuiet ? (
            <div className={styles.todaysReadCardQuiet}>
              <p className={styles.todaysReadTextQuiet}>
                No new clusters since the last run. Nothing new to escalate.
              </p>
            </div>
          ) : (
            <div className={styles.todaysReadCard}>
              <p className={styles.todaysReadText}>{data.todaysRead}</p>
            </div>
          )}
        </div>

        {!isQuiet && (
          <>
            <div className={styles.seymourSection}>
              <div className={styles.seymourSectionHead}>
                <span className={styles.seymourEyebrow}>Cross-detector clusters</span>
                <Mono>{data.clusters.length}</Mono>
              </div>
              <div className={styles.clusterList}>
                {data.clusters.map(c => (
                  <div key={c.id} className={styles.clusterCard}>
                    <div className={styles.clusterRowTop}>
                      <Mono color="#9ca3af">{c.id}</Mono>
                      <SeymourBadge />
                    </div>
                    <div className={styles.clusterEntity}>{c.entity}</div>
                    <div className={styles.clusterDetectorRow}>
                      {c.detectors.map(d => (
                        <span key={d} className={styles.clusterDetectorChip}>{d}</span>
                      ))}
                      <span className={styles.clusterMeta}>· {c.findings} findings · {c.exposure}</span>
                    </div>
                    <p className={styles.clusterReasoning}>{c.reasoning}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className={styles.seymourEyebrow} style={{ marginBottom: 8 }}>Suggested investigations</div>
              <div className={styles.suggestedList}>
                {data.suggested.map(s => (
                  <div key={s.id} className={styles.suggestedCard}>
                    <div className={styles.suggestedTopRow}>
                      <Mono color="#9ca3af">{s.id}</Mono>
                      <SeymourBadge />
                    </div>
                    <div className={styles.suggestedTitle}>{s.title}</div>
                    <div className={styles.suggestedMeta}>Basis: {s.basis}</div>
                    <div className={styles.suggestedMeta}>{s.lift}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

type TabProps = {
  count: number;
  onExpand: () => void;
};

export function SeymourCollapsedTab({ count, onExpand }: TabProps) {
  return (
    <button type="button" onClick={onExpand} className={styles.seymourTab} aria-label="Expand Seymour rail">
      <span className={styles.seymourTabLabel}>Seymour</span>
      <span className={styles.seymourTabBadge}>{count}</span>
    </button>
  );
}
