import type { WasteFinding } from "@/lib/apiClient"

/**
 * The people (or records) behind an aggregated payroll finding.
 *
 * A department-level finding ("Public Works: a handful of employees collect
 * most of the overtime") is only actionable once it names the pay records
 * behind it. The backend ships them as `case_exemplars`: on a live run as
 * `caseExemplars`, on a persisted run inside `evidence`. They are rows of the
 * city's public payroll file; the shapes differ by detector, so each fact is
 * read only when it is present.
 */
export type WasteExemplar = Record<string, unknown>

type WithExemplars = Pick<WasteFinding, "caseExemplars" | "evidence">

export function getExemplars(finding: WithExemplars): WasteExemplar[] {
  const live = finding.caseExemplars
  const stored = (finding.evidence as Record<string, unknown> | null | undefined)
    ?.case_exemplars
  const raw = Array.isArray(live) ? live : Array.isArray(stored) ? stored : []
  return raw.filter(
    (e): e is WasteExemplar => typeof e === "object" && e !== null,
  )
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

function usd(n: number): string {
  return USD.format(n)
}

function num(e: WasteExemplar, key: string): number | null {
  const v = e[key]
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

export interface DescribedExemplar {
  who: string
  /** One short line per record (a person with several years has several). */
  facts: string[]
}

/**
 * A readable line for one exemplar row. Missing facts are skipped. `withJob`
 * (default true) prefixes the job title; the list drops it when every row
 * shares one title, because the finding's headline already names the role.
 */
export function describeExemplar(
  e: WasteExemplar,
  withJob = true,
): DescribedExemplar {
  const who =
    typeof e.employee === "string" && e.employee.trim()
      ? e.employee.trim()
      : "Unnamed record"
  const parts: string[] = []

  const year = num(e, "fiscal_year")
  const overtime = num(e, "overtime")
  const base = num(e, "base_salary")
  if (overtime !== null && base !== null) {
    parts.push(`${usd(overtime)} overtime on ${usd(base)} base pay`)
  } else if (overtime !== null) {
    parts.push(`${usd(overtime)} overtime`)
  } else if (base !== null) {
    parts.push(`${usd(base)} base pay`)
  }

  const multiple = num(e, "multiple_of_next")
  const peers = num(e, "people_in_title")
  const next = num(e, "next_highest_overtime")
  if (multiple !== null && peers !== null) {
    parts.push(
      next !== null && next < 1_000
        ? `no one else in the title of ${peers} was paid more than ${usd(1_000)}`
        : `${multiple.toFixed(1)}× the next-highest of ${peers} in the title`,
    )
  }

  const share = num(e, "share_of_title_overtime")
  if (share !== null && peers !== null) {
    parts.push(
      `the group held ${Math.round(share * 100)}% of the title's overtime (${peers} people)`,
    )
  }

  const paid = num(e, "paid_hours")
  const weekly = num(e, "weekly_hours")
  if (paid !== null && weekly === null) {
    parts.push(`${Math.round(paid).toLocaleString("en-US")} regular hours`)
  }
  const namesake = num(e, "chance_of_namesake")
  if (namesake !== null) {
    parts.push(`chance of a namesake match about ${Math.round(namesake * 100)}%`)
  }
  if (paid !== null && weekly !== null) {
    parts.push(
      `${Math.round(paid).toLocaleString("en-US")} paid hours (about ${Math.round(weekly)} a week)`,
    )
  }

  const extra = num(e, "implied_extra_hours_per_week")
  if (extra !== null && extra > 0) {
    parts.push(`about ${Math.round(extra)} extra hours a week`)
  }

  const spike = num(e, "spike_pct")
  if (spike !== null) parts.push(`pay up ${Math.round(spike)}% on the prior average`)
  const total = num(e, "current_total_comp")
  if (total !== null) parts.push(`${usd(total)} total pay`)
  const other = num(e, "other_salaries")
  if (other !== null && other > 0) parts.push(`${usd(other)} other pay`)
  if (e.departed_next_year === true) parts.push("left the next year")

  const fact = parts.join(", ")
  const job =
    withJob && typeof e.job === "string" && e.job.trim() ? e.job.trim() : null
  const lead = [job, year !== null ? `FY${year}` : null].filter(Boolean).join(", ")
  return { who, facts: [lead && fact ? `${lead}: ${fact}` : fact].filter(Boolean) }
}

/** Describe exemplars, merging several rows for the same person into one. */
export function describeExemplars(
  exemplars: readonly WasteExemplar[],
  limit = 5,
): DescribedExemplar[] {
  const jobs = new Set(
    exemplars.map((e) => (typeof e.job === "string" ? e.job.trim() : "")),
  )
  const withJob = jobs.size > 1
  const byPerson = new Map<string, DescribedExemplar>()
  for (const e of exemplars) {
    const d = describeExemplar(e, withJob)
    const prior = byPerson.get(d.who)
    if (prior) prior.facts.push(...d.facts)
    else byPerson.set(d.who, { who: d.who, facts: [...d.facts] })
  }
  return Array.from(byPerson.values()).slice(0, limit)
}
