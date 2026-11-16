/**
 * Lead eval, UI side.
 *
 * The Platform repo's `scripts/waste_loops.py` scores each improvement loop of
 * the waste module. This spec is its other half: it runs the real `topLeads`
 * and the real narrator on fixtures that script exports (the findings behind
 * each city's Top leads), and checks two things.
 *
 * 1. Parity. The UI's Top leads must be the list the scoreboard scored. If this
 *    fails, `shown_top` in the Platform script and `topLeads` in
 *    `waste-leads.ts` have drifted: change both, then re-export the fixtures
 *    (`python scripts/waste_loops.py export-ui-fixture --tag <run> --ui <this repo>`).
 * 2. Clarity. For each of the ten rows, the text a person reads (headline,
 *    fact line, ranking reasons, why-it-matters line) is short, free of
 *    detector codes and statistics jargon, does not repeat itself, and exists.
 *    These are proxies; whether the page is compelling needs a human read.
 *    The per-check failure counts are written to `WASTE_UI_EVAL_OUT` (JSON)
 *    when that variable is set, which is how the scoreboard reads them.
 *
 * Fixtures hold public vendor and department names and role titles, never
 * people: case exemplars are left out.
 */
import { afterAll, describe, expect, it } from "vitest"
import { writeFileSync } from "node:fs"
import type { WasteFinding } from "@/lib/apiClient"
import { deriveHeadline, whySuspicious } from "./waste-finding-narrator"
import { topLeads } from "./waste-leads"
import { stripCodes } from "./waste-top-leads"

interface Fixture {
  city_id: number
  city: string
  limit: number
  expected_ids: string[]
  findings: unknown[]
}

const fixtures = Object.entries(
  import.meta.glob<Fixture>("./__fixtures__/lead-eval/*.json", {
    eager: true,
    import: "default",
  }),
).sort(([a], [b]) => a.localeCompare(b))

/** Keep these equal to `HEADLINE_MAX` and the patterns in waste_loops.py. */
const HEADLINE_MAX = 160
const DETECTOR_CODE = /\b(?:D\d{1,2}b?|RD\d|NP\d|W\d[a-z]?)\b/
const JARGON =
  /benford|pareto|z-?score|herfindahl|\bhhi\b|kurtosis|chi-?square|mahalanobis/i

function hasRepeatedPhrase(text: string): boolean {
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean)
  for (let n = 2; n <= 6; n++) {
    for (let i = 0; i + 2 * n <= tokens.length; i++) {
      let same = true
      for (let k = 0; k < n; k++) {
        if (tokens[i + k] !== tokens[i + n + k]) {
          same = false
          break
        }
      }
      if (same) return true
    }
  }
  return false
}

const CHECKS = [
  "headline_present",
  "headline_short",
  "no_codes_or_jargon",
  "no_repeats",
  "has_reasons",
  "has_why",
  "has_fact",
] as const
type Check = (typeof CHECKS)[number]

/** The strings a person reads for one Top leads row (as LeadRow renders them). */
function renderedText(finding: WasteFinding, reasons: string[]) {
  return {
    headline: stripCodes(deriveHeadline(finding)),
    fact: stripCodes(finding.metricDetail ?? ""),
    reasons: reasons.slice(1).map(stripCodes),
    why: whySuspicious(finding),
  }
}

function failedChecks(
  text: ReturnType<typeof renderedText>,
): Check[] {
  const failed: Check[] = []
  const all = [text.headline, text.fact, text.why, ...text.reasons].join(" \n ")
  if (!text.headline) failed.push("headline_present")
  if (text.headline.length > HEADLINE_MAX) failed.push("headline_short")
  if (DETECTOR_CODE.test(all) || JARGON.test(all)) failed.push("no_codes_or_jargon")
  if (hasRepeatedPhrase(text.headline) || hasRepeatedPhrase(text.fact)) {
    failed.push("no_repeats")
  }
  if (text.reasons.length === 0) failed.push("has_reasons")
  if (!text.why) failed.push("has_why")
  if (!text.fact) failed.push("has_fact")
  return failed
}

const metrics: {
  cities: Record<string, { rows: number; failed: number; total: number; fails: Record<string, number>; worst: string[] }>
} = { cities: {} }

describe("lead eval (fixtures exported by the Platform scoreboard)", () => {
  if (fixtures.length === 0) {
    it.skip("no fixtures exported yet", () => {})
  }

  for (const [path, fixture] of fixtures) {
    describe(`${fixture.city} (${path.split("/").pop()})`, () => {
      const findings = fixture.findings as unknown as WasteFinding[]
      const { leads } = topLeads(findings, fixture.limit)

      it("shows the list the scoreboard scored", () => {
        expect(
          leads.map((r) => r.finding.id),
          "UI topLeads() and waste_loops.py shown_top() have drifted apart",
        ).toEqual(fixture.expected_ids)
      })

      it("shows no person-level record", () => {
        for (const r of leads) {
          expect(r.finding.entity).not.toBe("[person-level record]")
          expect(r.finding.tool).not.toMatch(/^RD\d/)
        }
      })

      it("reads clearly (soft: counted for the scoreboard)", () => {
        const fails: Record<string, number> = {}
        const worst: string[] = []
        for (const r of leads) {
          const failed = failedChecks(renderedText(r.finding, r.lead.reasons))
          for (const c of failed) fails[c] = (fails[c] ?? 0) + 1
          if (failed.length >= 2) {
            worst.push(`${r.finding.tool}: ${failed.join(", ")}`)
          }
        }
        const failedTotal = Object.values(fails).reduce((a, b) => a + b, 0)
        metrics.cities[String(fixture.city_id)] = {
          rows: leads.length,
          failed: failedTotal,
          total: leads.length * CHECKS.length,
          fails,
          worst,
        }
        expect(leads.length).toBeGreaterThan(0)
      })
    })
  }

  afterAll(() => {
    const out = process.env.WASTE_UI_EVAL_OUT
    if (out && Object.keys(metrics.cities).length > 0) {
      writeFileSync(out, JSON.stringify(metrics, null, 1))
    }
  })
})
