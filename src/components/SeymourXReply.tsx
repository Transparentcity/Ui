"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useAuth0 } from "@auth0/auth0-react";

import SessionViewerModal from "@/components/eval/SessionViewerModal";
import { getJob, startCivicXReply, type CivicXReplyDraft } from "@/lib/apiClient";
import { cardImagePathForLink } from "@/lib/linkCardImage";
import { notifyJobCreated } from "@/lib/useJobWebSocket";

const X_LIMIT = 280;
const X_URL_LENGTH = 23;
const MAX_COACHING_LENGTH = 500;
const POLL_MS = 2000;
const TIMEOUT_MS = 5 * 60 * 1000;
const URL_RE = /https?:\/\/\S+?(?=[.,!?;:)'"]*(?:\s|$))/g;

/** X's weighted length: a link counts 23, most scripts 1 per character, CJK and emoji 2. */
export function xCharCount(text: string): number {
  let count = 0;
  const rest = text.normalize("NFC").replace(URL_RE, () => {
    count += X_URL_LENGTH;
    return "";
  });
  for (const char of rest) {
    const code = char.codePointAt(0) ?? 0;
    const single =
      code <= 4351 ||
      (code >= 8192 && code <= 8205) ||
      (code >= 8208 && code <= 8223) ||
      (code >= 8242 && code <= 8247);
    count += single ? 1 : 2;
  }
  return count;
}

/** X's reply window for a post, prefilled with the reply text. */
export function xReplyIntentUrl(tweetId: string, text: string): string {
  return `https://x.com/intent/post?in_reply_to=${tweetId}&text=${encodeURIComponent(text)}`;
}

/** Card image X shows under the reply, when its last link is a chart or map page. */
export function replyCardImagePath(text: string): string | null {
  const links = text.match(URL_RE) ?? [];
  const last = links[links.length - 1];
  return last ? cardImagePathForLink(last) : null;
}

const linkButtonStyle: CSSProperties = {
  padding: 0,
  border: "none",
  background: "none",
  color: "var(--brand-primary, #ad35fa)",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};
const primaryButtonStyle: CSSProperties = {
  padding: "4px 10px",
  borderRadius: 5,
  border: "1px solid var(--brand-primary, #ad35fa)",
  background: "var(--brand-primary, #ad35fa)",
  color: "#fff",
  fontSize: 11,
  fontWeight: 600,
  textDecoration: "none",
  cursor: "pointer",
};
const secondaryButtonStyle: CSSProperties = {
  padding: "3px 8px",
  borderRadius: 5,
  border: "1px solid var(--border-primary, #e5e7eb)",
  background: "transparent",
  color: "var(--text-secondary, #374151)",
  fontSize: 11,
  cursor: "pointer",
};
const panelStyle: CSSProperties = {
  flexBasis: "100%",
  marginTop: 4,
  padding: "8px 10px",
  border: "1px solid var(--border-primary, #e5e7eb)",
  borderRadius: 8,
  background: "var(--bg-primary, #fff)",
  color: "var(--text-primary, #111827)",
  fontSize: 12,
  cursor: "default",
};
const textareaStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--border-primary, #e5e7eb)",
  background: "var(--bg-primary, #fff)",
  color: "var(--text-primary, #111827)",
  font: "inherit",
  fontSize: 13,
  lineHeight: 1.5,
  resize: "vertical",
};
const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  marginTop: 3,
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid var(--border-primary, #e5e7eb)",
  background: "var(--bg-primary, #fff)",
  color: "var(--text-primary, #111827)",
  font: "inherit",
  fontSize: 12,
};
const cardImageStyle: CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: 320,
  aspectRatio: "1200 / 630",
  objectFit: "cover",
  borderRadius: 8,
  border: "1px solid var(--border-primary, #e5e7eb)",
  background: "var(--bg-secondary, #f3f4f6)",
};
const mutedStyle: CSSProperties = { color: "var(--text-tertiary, #6b7280)", fontSize: 11 };
const errorStyle: CSSProperties = { color: "var(--error, #ef4444)", fontSize: 11 };

// The post row opens its detail modal on click and on Enter/Space; Escape must
// still reach the session viewer's window listener.
function stopClick(e: MouseEvent) {
  e.stopPropagation();
}
function stopRowKeys(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") e.stopPropagation();
}

interface ReplyRequest {
  coaching?: string;
  previousDraft?: string;
}

interface SeymourXReplyProps {
  /** civic_items id of an official's own X post. */
  itemId: number;
}

/**
 * "Reply with Seymour" for one X post. The admin can coach Seymour before he
 * writes or on his draft. He drafts in a background job; the admin edits the
 * draft and posts it from X's reply window, because X's API rejects replies to
 * posts that don't mention our account. When the reply links a chart or map,
 * the panel shows the card image X will put under it.
 */
export default function SeymourXReply({ itemId }: SeymourXReplyProps) {
  const { getAccessTokenSilently } = useAuth0();
  const coachingId = useId();
  const coachingInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const attempt = useRef(0);
  const lastRequest = useRef<ReplyRequest>({});
  const [open, setOpen] = useState(false);
  const [coaching, setCoaching] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CivicXReplyDraft | null>(null);
  const [text, setText] = useState("");
  const [failedCardImage, setFailedCardImage] = useState<string | null>(null);
  const [viewingSession, setViewingSession] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (open && !draft) coachingInput.current?.focus();
  }, [open, draft]);

  const writeReply = useCallback(
    async (request: ReplyRequest) => {
      const mine = ++attempt.current;
      const current = () => mounted.current && attempt.current === mine;
      lastRequest.current = request;
      setDrafting(true);
      setError(null);
      try {
        const token = await getAccessTokenSilently();
        const started = await startCivicXReply(itemId, request, token);
        notifyJobCreated(started.job_id);
        const deadline = Date.now() + TIMEOUT_MS;
        while (Date.now() < deadline) {
          const job = await getJob(started.job_id, token);
          if (!current()) return;
          if (job.status === "completed") {
            const result = job.result as CivicXReplyDraft | undefined;
            if (!result?.reply_text) throw new Error("Seymour finished without a reply.");
            setDraft(result);
            setText(result.reply_text);
            setCoaching("");
            return;
          }
          if (job.status === "failed" || job.status === "cancelled") {
            throw new Error(job.error_message || job.error || `Job ${job.status}.`);
          }
          await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
        }
        throw new Error("Seymour is still writing. Check the Jobs panel for progress.");
      } catch (e) {
        if (current()) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (current()) setDrafting(false);
      }
    },
    [itemId, getAccessTokenSilently]
  );

  // With a draft on screen, an empty box means "try again" with the last request.
  const write = () => {
    const advice = coaching.trim();
    if (!advice) void writeReply(draft ? lastRequest.current : {});
    else if (draft) void writeReply({ coaching: advice, previousDraft: text });
    else void writeReply({ coaching: advice });
  };

  const close = () => {
    attempt.current += 1;
    setOpen(false);
    setDrafting(false);
    setDraft(null);
    setText("");
    setCoaching("");
    setError(null);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          stopClick(e);
          setOpen(true);
        }}
        onKeyDown={stopRowKeys}
        style={linkButtonStyle}
      >
        Reply with Seymour
      </button>
    );
  }

  const count = xCharCount(text);
  const cardImage = draft ? replyCardImagePath(text) : null;
  const busyStyle = { opacity: drafting ? 0.6 : 1 };
  return (
    <div onClick={stopClick} onKeyDown={stopRowKeys} style={panelStyle}>
      {draft && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontWeight: 700 }}>Seymour&apos;s reply to @{draft.author_handle}</span>
            <span style={count > X_LIMIT ? errorStyle : mutedStyle}>
              {count}/{X_LIMIT}
            </span>
          </div>
          <textarea
            aria-label="Reply text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            disabled={drafting}
            style={textareaStyle}
          />
          {cardImage &&
            (failedCardImage === cardImage ? (
              <div style={{ ...errorStyle, marginTop: 4 }}>
                The picture for this link didn&apos;t load, so X may show the reply without one.
                Check the link before posting.
              </div>
            ) : (
              <div style={{ marginTop: 6 }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the card route's own PNG, sized by X */}
                <img
                  src={cardImage}
                  alt="Picture X shows under the reply"
                  onError={() => setFailedCardImage(cardImage)}
                  style={cardImageStyle}
                />
                <div style={{ ...mutedStyle, marginTop: 2 }}>X shows this picture under the reply.</div>
              </div>
            ))}
          {draft.note && <div style={{ ...mutedStyle, marginTop: 4 }}>Note: {draft.note}</div>}
        </>
      )}
      <label htmlFor={coachingId} style={{ display: "block", fontWeight: 600, marginTop: draft ? 8 : 0 }}>
        Coach Seymour <span style={{ ...mutedStyle, fontWeight: 400 }}>(optional)</span>
      </label>
      <input
        ref={coachingInput}
        id={coachingId}
        type="text"
        value={coaching}
        onChange={(e) => setCoaching(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !drafting) write();
        }}
        maxLength={MAX_COACHING_LENGTH}
        disabled={drafting}
        placeholder={draft ? "What should he change?" : "An angle, a tone, or something to check"}
        style={inputStyle}
      />
      {error && <div style={{ ...errorStyle, marginTop: 4 }}>{error}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        {draft ? (
          <>
            <a
              href={xReplyIntentUrl(draft.tweet_id, text.trim())}
              target="_blank"
              rel="noopener noreferrer"
              style={primaryButtonStyle}
            >
              Post on X ↗
            </a>
            <button
              type="button"
              onClick={write}
              disabled={drafting}
              style={{ ...secondaryButtonStyle, ...busyStyle }}
            >
              {drafting ? "Seymour is writing…" : coaching.trim() ? "Rewrite" : "Try again"}
            </button>
            <button type="button" onClick={close} style={secondaryButtonStyle}>
              Discard
            </button>
            {draft.session_id && (
              <button type="button" onClick={() => setViewingSession(true)} style={linkButtonStyle}>
                View session
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={write}
              disabled={drafting}
              style={{ ...primaryButtonStyle, ...busyStyle }}
            >
              {drafting ? "Seymour is writing…" : "Write reply"}
            </button>
            <button type="button" onClick={close} style={secondaryButtonStyle}>
              Cancel
            </button>
          </>
        )}
      </div>
      {draft && (
        <div style={{ ...mutedStyle, marginTop: 6 }}>
          Opens X&apos;s reply window with this text; you post it from there.
        </div>
      )}
      {viewingSession && draft?.session_id && (
        <SessionViewerModal
          sessionId={draft.session_id}
          label="Seymour's reply"
          onClose={() => setViewingSession(false)}
        />
      )}
    </div>
  );
}
