"use client"

import type { WasteFinding } from "@/lib/apiClient"
import { describeExemplars, getExemplars } from "./waste-exemplars"

/**
 * "In the public payroll record": the pay records behind a payroll finding,
 * for the expanded view of a card or a Top leads row. Renders nothing when
 * the finding carries none (every non-payroll finding, and payroll findings
 * persisted before exemplars were stored).
 */
export function ExemplarList({
  finding,
  limit = 5,
}: {
  finding: Pick<WasteFinding, "caseExemplars" | "evidence">
  limit?: number
}) {
  const people = describeExemplars(getExemplars(finding), limit)
  if (people.length === 0) return null
  return (
    <div className="text-[13px]" data-testid="exemplars">
      <p className="font-semibold" style={{ color: "#111827" }}>
        In the public payroll record:
      </p>
      <ul className="mt-1 space-y-1" style={{ color: "#374151" }}>
        {people.map((p) => (
          <li key={p.who} data-testid="exemplar">
            <span className="font-medium">{p.who}</span>
            {p.facts.map((fact, i) => (
              <span key={i} className="block pl-3" style={{ color: "#6b7280" }}>
                {fact}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}
