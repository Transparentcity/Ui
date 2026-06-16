"use client";

import { Card } from "@/components/ui/card";
import { useWasteState } from "@/lib/admin/waste/useWasteState";

type Cell = { label: string; value: number; hint?: string };

function format(n: number): string {
  return n.toLocaleString("en-US");
}

export function Readout() {
  const ui = useWasteState();
  // Until the KPI data resolves (or if it failed), show an em dash instead of
  // a fabricated "0" that reads as a real, confident zero.
  const unknown = ui.isLoading || ui.isError;
  const display = (n: number): string => (unknown ? "—" : format(n));

  const cells: readonly Cell[] = [
    {
      label: "Detectors firing (30d)",
      value: ui.detectorsActive,
      hint:
        ui.detectorsConfigured != null
          ? `of ${ui.detectorsConfigured} configured`
          : undefined,
    },
    { label: "Findings today", value: ui.findingsToday },
    { label: "This week", value: ui.findingsThisWeek },
    { label: "In review", value: ui.inReview },
    { label: "Confirmed (30d)", value: ui.confirmed30d },
  ];

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4"
      role="group"
      aria-label="Waste KPIs"
    >
      {cells.map((c) => (
        <Card key={c.label} className="p-4">
          <div className="text-xs text-[var(--text-tertiary)]">{c.label}</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--text-primary)] tabular-nums">
            {display(c.value)}
          </div>
          {c.hint && !unknown && (
            <div className="mt-0.5 text-xs text-[var(--text-tertiary)]">{c.hint}</div>
          )}
        </Card>
      ))}
    </div>
  );
}
