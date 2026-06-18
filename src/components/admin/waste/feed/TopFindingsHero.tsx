"use client";

import type { Finding } from "@/lib/wasteFixtures";
import { selectTopAdminFindings } from "@/lib/admin/waste/adapters";

const SEV_DOT: Record<string, string> = {
  high: "#dc2626",
  med: "#d97706",
  low: "#9ca3af",
};

/**
 * Curated "Most suspicious this period" hero atop the admin findings list — the
 * handful of highest-confidence, highest-impact findings told as a plain
 * ranked list, so an investigator sees the worst patterns before the firehose.
 * Clicking a row selects that finding (opens it in the ProvenancePanel).
 */
export function TopFindingsHero({
  findings,
  onSelect,
  count = 5,
}: {
  findings: readonly Finding[];
  onSelect: (id: string) => void;
  count?: number;
}) {
  const top = selectTopAdminFindings(findings, count);
  if (top.length === 0) return null;

  return (
    <section
      aria-label="Most suspicious findings"
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        overflow: "hidden",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderBottom: "1px solid #f3f4f6",
          background: "#fafafa",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
          Most suspicious this period
        </span>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          — the {top.length} highest-confidence, highest-impact patterns
        </span>
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {top.map((f, i) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => onSelect(f.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                textAlign: "left",
                padding: "9px 14px",
                background: "transparent",
                border: "none",
                borderTop: i === 0 ? "none" : "1px solid #f3f4f6",
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", width: 14 }}>
                {i + 1}
              </span>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: SEV_DOT[f.severity] ?? "#9ca3af",
                }}
              />
              <span
                style={{
                  fontSize: 13,
                  color: "#111827",
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {f.headline}
              </span>
              {f.amount !== "—" && (
                <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                  {f.amount}
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
