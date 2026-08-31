"use client";

import { useState, useEffect, useRef } from "react";

type FeedbackState = "idle" | "explaining" | "submitting" | "thanked" | "already" | "error";

export default function PageFeedback({
  pageUrl,
  pageType,
  variant = "standalone",
}: {
  pageUrl: string;
  pageType?: string;
  variant?: "standalone" | "inline";
}) {
  const [state, setState] = useState<FeedbackState>("idle");
  const [explanation, setExplanation] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [visible, setVisible] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const storageKey = `page-feedback:${pageUrl}`;

  useEffect(() => {
    try {
      const ts = localStorage.getItem(storageKey);
      if (ts && Date.now() - Number(ts) < 86_400_000) {
        setState("already");
      }
    } catch {
      // localStorage unavailable
    }
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [storageKey]);

  useEffect(() => {
    if (state === "explaining" && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [state]);

  const markSubmitted = () => {
    try {
      localStorage.setItem(storageKey, String(Date.now()));
    } catch {
      // ignore
    }
  };

  const submit = async (type: "accurate" | "wrong", text?: string) => {
    setState("submitting");
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
      const res = await fetch(`${apiBase}/api/public/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageUrl,
          pageType,
          feedbackType: type,
          explanation: text || "",
          submitterName: name.trim() || undefined,
          submitterEmail: email.trim() || undefined,
        }),
      });
      if (!res.ok && res.status !== 429) throw new Error("Failed");
      markSubmitted();
      setState("thanked");
    } catch {
      setState("error");
    }
  };

  if (variant === "inline") {
    return <InlineFeedback
      state={state}
      setState={setState}
      visible={visible}
      explanation={explanation}
      setExplanation={setExplanation}
      name={name}
      setName={setName}
      email={email}
      setEmail={setEmail}
      textareaRef={textareaRef}
      submit={submit}
    />;
  }

  // Standalone styles
  const containerStyle: React.CSSProperties = {
    borderTop: "1px solid var(--border-primary)",
    padding: "20px 0",
    marginTop: 32,
    opacity: visible ? 1 : 0,
    transition: "opacity 0.4s ease",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: "var(--text-secondary, var(--text-muted))",
    marginBottom: 10,
    lineHeight: 1.4,
  };

  const buttonBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 500,
    border: "1px solid var(--border-primary)",
    borderRadius: 20,
    cursor: "pointer",
    transition: "all 0.15s ease",
    minHeight: 30,
    lineHeight: 1,
    letterSpacing: "0.01em",
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: "8px 10px",
    fontSize: 13,
    border: "1px solid var(--border-primary)",
    borderRadius: 8,
    background: "var(--bg-secondary, #f9fafb)",
    color: "var(--text-primary)",
    fontFamily: "inherit",
    boxSizing: "border-box",
    outline: "none",
  };

  if (state === "already") {
    return (
      <div style={containerStyle}>
        <p style={{ ...labelStyle, opacity: 0.7 }}>
          <span style={{ marginRight: 6 }}>&#10003;</span>
          You already left feedback on this page. Thank you!
        </p>
      </div>
    );
  }

  if (state === "thanked") {
    return (
      <div style={containerStyle}>
        <p style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "rgba(16, 185, 129, 0.12)",
              color: "var(--success)",
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            &#10003;
          </span>
          Thanks for your feedback!
        </p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div style={containerStyle}>
        <p style={labelStyle}>
          Something went wrong.{" "}
          <button
            onClick={() => setState("idle")}
            style={{
              background: "none",
              border: "none",
              color: "var(--brand-primary)",
              cursor: "pointer",
              fontSize: 13,
              textDecoration: "underline",
              padding: 0,
            }}
          >
            Try again
          </button>
        </p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <p style={labelStyle}>Is this page accurate?</p>

      {(state === "idle" || state === "explaining" || state === "submitting") && (
        <>
          {/* Button row */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: state === "explaining" || state === "submitting" ? 12 : 0,
            }}
          >
            <button
              onClick={() => submit("accurate")}
              disabled={state === "submitting"}
              style={{
                ...buttonBase,
                background: state === "explaining" ? "transparent" : "rgba(16, 185, 129, 0.06)",
                color: state === "explaining" ? "var(--text-secondary, var(--text-muted))" : "#059669",
                borderColor: state === "explaining" ? "var(--border-primary)" : "rgba(16, 185, 129, 0.25)",
                opacity: state === "submitting" ? 0.6 : 1,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Yes, looks right
            </button>
            <button
              onClick={() => {
                if (state === "idle") setState("explaining");
              }}
              disabled={state === "submitting"}
              style={{
                ...buttonBase,
                background: state === "explaining" ? "rgba(245, 158, 11, 0.08)" : "transparent",
                color: state === "explaining" ? "#d97706" : "var(--text-secondary, var(--text-muted))",
                borderColor: state === "explaining" ? "rgba(245, 158, 11, 0.3)" : "var(--border-primary)",
                opacity: state === "submitting" ? 0.6 : 1,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Something seems wrong
            </button>
          </div>

          {/* Explanation textarea (expands in) */}
          {(state === "explaining" || state === "submitting") && (
            <div
              style={{
                overflow: "hidden",
                animation: "pageFeedbackSlide 0.25s ease-out",
              }}
            >
              <textarea
                ref={textareaRef}
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="What looks wrong? (e.g., outdated numbers, incorrect comparison...)"
                disabled={state === "submitting"}
                maxLength={2000}
                style={{
                  width: "100%",
                  minHeight: 80,
                  padding: 12,
                  fontSize: 13,
                  lineHeight: 1.5,
                  border: "1px solid var(--border-primary)",
                  borderRadius: 8,
                  background: "var(--bg-secondary, #f9fafb)",
                  color: "var(--text-primary)",
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name (optional)"
                  disabled={state === "submitting"}
                  maxLength={200}
                  style={inputStyle}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email (optional)"
                  disabled={state === "submitting"}
                  maxLength={320}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => submit("wrong", explanation)}
                  disabled={state === "submitting" || !explanation.trim()}
                  style={{
                    ...buttonBase,
                    background:
                      !explanation.trim()
                        ? "var(--bg-secondary, #f5f5f5)"
                        : "var(--brand-primary)",
                    color: !explanation.trim() ? "var(--text-secondary, var(--text-muted))" : "#fff",
                    border: "none",
                    opacity: state === "submitting" ? 0.6 : 1,
                  }}
                >
                  {state === "submitting" ? "Sending..." : "Submit"}
                </button>
                {state !== "submitting" && (
                  <button
                    onClick={() => {
                      setState("idle");
                      setExplanation("");
                    }}
                    style={{
                      ...buttonBase,
                      background: "transparent",
                      color: "var(--text-secondary, var(--text-muted))",
                      border: "none",
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Animation keyframes */}
          <style>{`
            @keyframes pageFeedbackSlide {
              from { max-height: 0; opacity: 0; }
              to   { max-height: 300px; opacity: 1; }
            }
          `}</style>
        </>
      )}
    </div>
  );
}

/* ---- Inline variant (for footer integration) ---- */

function InlineFeedback({
  state,
  setState,
  visible,
  explanation,
  setExplanation,
  name,
  setName,
  email,
  setEmail,
  textareaRef,
  submit,
}: {
  state: FeedbackState;
  setState: (s: FeedbackState) => void;
  visible: boolean;
  explanation: string;
  setExplanation: (s: string) => void;
  name: string;
  setName: (s: string) => void;
  email: string;
  setEmail: (s: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  submit: (type: "accurate" | "wrong", text?: string) => Promise<void>;
}) {
  if (state === "already") return null;

  if (state === "thanked") {
    return (
      <span className="footer-feedback" style={{ opacity: visible ? 1 : 0 }}>
        <span className="footer-feedback-thanks">Thanks for your feedback!</span>
      </span>
    );
  }

  if (state === "error") {
    return (
      <span className="footer-feedback" style={{ opacity: visible ? 1 : 0 }}>
        <span className="footer-feedback-label">Something went wrong.</span>
        <button className="footer-feedback-link" onClick={() => setState("idle")}>
          Try again
        </button>
      </span>
    );
  }

  return (
    <>
      <span className="footer-feedback" style={{ opacity: visible ? 1 : 0 }}>
        <span className="footer-feedback-label">Is this page accurate?</span>
        <button
          className="footer-feedback-link footer-feedback-yes"
          onClick={() => submit("accurate")}
          disabled={state === "submitting"}
        >
          Yes
        </button>
        <span className="footer-feedback-dot">&middot;</span>
        <button
          className="footer-feedback-link footer-feedback-wrong"
          onClick={() => { if (state === "idle") setState("explaining"); }}
          disabled={state === "submitting"}
        >
          Something wrong
        </button>
      </span>

      {(state === "explaining" || state === "submitting") && (
        <div className="footer-feedback-form">
          <textarea
            ref={textareaRef}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="What looks wrong? (e.g., outdated numbers, incorrect comparison...)"
            disabled={state === "submitting"}
            maxLength={2000}
            className="footer-feedback-textarea"
          />
          <div className="footer-feedback-fields">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              disabled={state === "submitting"}
              maxLength={200}
              className="footer-feedback-input"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (optional)"
              disabled={state === "submitting"}
              maxLength={320}
              className="footer-feedback-input"
            />
          </div>
          <div className="footer-feedback-actions">
            <button
              className="footer-feedback-submit"
              onClick={() => submit("wrong", explanation)}
              disabled={state === "submitting" || !explanation.trim()}
            >
              {state === "submitting" ? "Sending..." : "Submit"}
            </button>
            {state !== "submitting" && (
              <button
                className="footer-feedback-cancel"
                onClick={() => { setState("idle"); setExplanation(""); }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
