"use client";

import { Card } from "@/components/ui/card";
import { useWasteState } from "@/lib/admin/waste/useWasteState";

type Cell = { label: string; value: number; hint?: string };

function format(n: number): string {
  return n.toLocaleString("en-US");
}

export function Readout() {
  const ui = useWasteState();

  const cells: readonly Cell[] = [
    {
      label: "Detectors active",
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
          <div className="text-xs text-gray-500">{c.label}</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">
            {format(c.value)}
          </div>
          {c.hint && <div className="mt-0.5 text-xs text-gray-400">{c.hint}</div>}
        </Card>
      ))}
    </div>
  );
}
