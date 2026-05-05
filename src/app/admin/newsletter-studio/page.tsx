"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { expand, EXAMPLE_DRAFT, ShortcodeError } from "@/lib/newsletterLayoutShortcodes";

const VIEWPORTS: Array<{ label: string; width: number }> = [
  { label: "Mobile (375)", width: 375 },
  { label: "Email (600)", width: 600 },
  { label: "Desktop (1024)", width: 1024 },
];

export default function NewsletterStudioPage() {
  const [src, setSrc] = useState(EXAMPLE_DRAFT);
  const [debounced, setDebounced] = useState(EXAMPLE_DRAFT);
  const [viewport, setViewport] = useState(VIEWPORTS[1].width);
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(src), 200);
    return () => clearTimeout(t);
  }, [src]);

  const { html, error } = useMemo(() => {
    try {
      return { html: expand(debounced), error: null as string | null };
    } catch (e) {
      const msg = e instanceof ShortcodeError ? e.message : String(e);
      return { html: "", error: msg };
    }
  }, [debounced]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#fff;color:#111827;}img{max-width:100%;height:auto;}</style></head><body>${html}</body></html>`);
    doc.close();
  }, [html]);

  const onCopy = async () => {
    await navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const tokenSavings = useMemo(() => {
    const srcLen = debounced.length;
    const htmlLen = html.length;
    if (!srcLen) return null;
    return { srcLen, htmlLen, ratio: htmlLen / srcLen };
  }, [debounced, html]);

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100vh", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <header style={{ padding: "12px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 16 }}>Newsletter Studio</strong>
        <span style={{ fontSize: 12, color: "#6b7280" }}>shortcode mockup · no Platform changes</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {tokenSavings && (
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              src {tokenSavings.srcLen} chars → html {tokenSavings.htmlLen} chars
              {" "}
              ({tokenSavings.ratio.toFixed(1)}x)
            </span>
          )}
          {VIEWPORTS.map((v) => (
            <button
              key={v.width}
              onClick={() => setViewport(v.width)}
              data-testid={`viewport-${v.width}`}
              style={{
                padding: "6px 10px",
                fontSize: 12,
                border: "1px solid #e5e7eb",
                background: viewport === v.width ? "#f5f0ff" : "#fff",
                borderColor: viewport === v.width ? "#ad35fa" : "#e5e7eb",
                color: "#111827",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {v.label}
            </button>
          ))}
          <button
            onClick={onCopy}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              border: "1px solid #e5e7eb",
              background: "#fff",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {copied ? "Copied!" : "Copy HTML"}
          </button>
        </div>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(360px, 40%) 1fr", overflow: "hidden" }}>
        <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid #e5e7eb", minHeight: 0 }}>
          {error && (
            <div role="alert" style={{ padding: "8px 12px", background: "#fef2f2", color: "#991b1b", fontSize: 13, borderBottom: "1px solid #fecaca" }}>
              {error}
            </div>
          )}
          <textarea
            data-testid="shortcode-textarea"
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              padding: 16,
              fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace",
              fontSize: 13,
              lineHeight: 1.5,
              resize: "none",
              color: "#111827",
              background: "#fafafa",
            }}
          />
        </div>
        <div style={{ background: "#f3f4f6", overflow: "auto", display: "flex", justifyContent: "center", padding: 24 }}>
          <iframe
            ref={iframeRef}
            data-testid="preview-iframe"
            title="newsletter preview"
            style={{
              width: viewport,
              maxWidth: "100%",
              height: "100%",
              minHeight: 600,
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              background: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
