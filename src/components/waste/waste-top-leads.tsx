"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, ChevronDown } from "lucide-react"
import type { WasteFinding } from "@/lib/apiClient"
import { deriveHeadline, whySuspicious } from "./waste-finding-narrator"
import {
  LEAD_TIER_HELP,
  LEAD_TIER_LABEL,
  topLeads,
  type RankedLead,
} from "./waste-leads"
import { normalizeWasteCategory } from "./waste-utils"

const DATA_FONT = { fontFamily: "var(--font-data)" } as const
const HEADING_FONT = {
  fontFamily: "var(--font-heading)",
  fontWeight: 800,
  letterSpacing: "-0.02em",
} as const

/** Detector codes ("D10", "NP4") mean nothing to a reader; drop them. */
function stripCodes(text: string): string {
  return text.replace(/\b(?:B-|C-)?(?:D|NP|RD|I)\d+[a-z]?\b\s*/g, "").trim()
}

function LeadRow({
  rank,
  item,
  open,
  onToggle,
}: {
  rank: number
  item: RankedLead
  open: boolean
  onToggle: () => void
}) {
  const { finding, lead } = item
  const headline = stripCodes(deriveHeadline(finding))
  const dash = headline.indexOf(" — ")
  const why = whySuspicious(finding)
  // The row's second line is the fact that is specific to THIS finding;
  // the general "why it matters" waits in the expanded view, so ten rows
  // from one detector don't repeat one sentence ten times.
  const fact = stripCodes(finding.metricDetail ?? "")
  const category = normalizeWasteCategory(finding.category)
  const strong = lead.tier === "lead"
  // The first reason restates the tier; the rest say what earned it.
  const reasons = lead.reasons.slice(1).map(stripCodes)

  return (
    <li
      className="border-b"
      style={{ borderColor: "#f3f4f6" }}
      data-testid="top-lead-row"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left flex items-start gap-3 px-3 py-3 hover:bg-gray-50/60 transition-colors"
      >
        <span
          className="w-5 shrink-0 text-right text-[13px] font-bold tabular-nums"
          style={{ ...DATA_FONT, color: "#9ca3af" }}
        >
          {rank}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14.5px] leading-snug">
            {dash > 0 ? (
              <>
                <span style={{ color: "#111827", fontWeight: 700 }}>
                  {headline.slice(0, dash)}
                </span>
                <span style={{ color: "#374151" }}>{headline.slice(dash)}</span>
              </>
            ) : (
              <span style={{ color: "#111827", fontWeight: 700 }}>
                {headline}
              </span>
            )}
          </span>
          {(fact || why) && (
            <span className="block mt-0.5 text-[13px]" style={{ color: "#6b7280" }}>
              {fact || why}
            </span>
          )}
        </span>
        <span className="shrink-0 flex flex-col items-end gap-1">
          <span
            className="text-[11px] font-bold uppercase"
            style={{
              letterSpacing: "0.04em",
              color: strong ? "#ad35fa" : "#6b7280",
            }}
            title={LEAD_TIER_HELP[lead.tier]}
            data-testid="lead-tier"
          >
            {LEAD_TIER_LABEL[lead.tier]}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open && (
        <div
          className="pl-11 pr-3 pb-4 text-[13px] space-y-3"
          style={{ color: "#374151" }}
          data-testid="top-lead-detail"
        >
          <p className="leading-relaxed">{finding.description}</p>
          {why && (
            <p>
              <span className="font-semibold" style={{ color: "#111827" }}>
                Why it matters:
              </span>{" "}
              {why}
            </p>
          )}
          {finding.caveat && (
            <p>
              <span className="font-semibold" style={{ color: "#111827" }}>
                What could explain it:
              </span>{" "}
              {finding.caveat}
            </p>
          )}
          {reasons.length > 0 && (
            <p>
              <span className="font-semibold" style={{ color: "#111827" }}>
                Why it ranks here:
              </span>{" "}
              {reasons.join(". ")}.
            </p>
          )}
          <Link
            href={`/waste/categories/${category}?finding=${encodeURIComponent(finding.id)}`}
            className="inline-flex items-center gap-1 text-[13px] font-semibold no-underline"
            style={{ color: "#ad35fa" }}
          >
            See the records
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </li>
  )
}

/**
 * The answer to "what should I look at first?": a ranked, cross-category
 * shortlist of new leads. Strong leads come first, then findings worth a
 * look. Anything matching a case that is already public is left out and
 * counted in the footer, because the point of the list is what nobody has
 * looked at yet.
 */
export function WasteTopLeads({
  findings,
  cityName,
  limit = 10,
}: {
  findings: readonly WasteFinding[]
  cityName?: string | null
  limit?: number
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const { leads, knownCount, strongCount, reviewCount } = useMemo(
    () => topLeads(findings, limit),
    [findings, limit],
  )

  return (
    <section className="mb-8" data-testid="top-leads">
      <div className="px-3 pb-2">
        <h2 className="text-[#111827]" style={{ ...HEADING_FONT, fontSize: "18px" }}>
          Top leads{cityName ? ` in ${cityName}` : ""}
        </h2>
        <p className="text-[13px] mt-0.5" style={{ color: "#6b7280" }}>
          {leads.length === 0
            ? "No finding in this run is specific and well-evidenced enough to lead with."
            : `${strongCount} strong ${strongCount === 1 ? "lead" : "leads"} and ${reviewCount} worth a look, out of ${findings.length.toLocaleString()} findings. Ranked on evidence, not dollar size.`}
        </p>
      </div>

      {leads.length > 0 && (
        <ol className="border-t" style={{ borderColor: "#e5e7eb" }}>
          {leads.map((item, i) => (
            <LeadRow
              key={item.finding.id}
              rank={i + 1}
              item={item}
              open={openId === item.finding.id}
              onToggle={() =>
                setOpenId((prev) =>
                  prev === item.finding.id ? null : item.finding.id,
                )
              }
            />
          ))}
        </ol>
      )}

      {knownCount > 0 && (
        <p
          className="px-3 pt-2 text-xs"
          style={{ color: "#9ca3af" }}
          data-testid="top-leads-known"
        >
          {knownCount} more {knownCount === 1 ? "finding matches" : "findings match"}{" "}
          cases that are already public (audited or reported) and{" "}
          {knownCount === 1 ? "is" : "are"} left out of this list.
        </p>
      )}
    </section>
  )
}
