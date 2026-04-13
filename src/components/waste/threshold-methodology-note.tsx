"use client"

import { useState } from "react"
import { ChevronDown, BookOpen, Scale, Shield, Layers, Search, BarChart3, GitBranch, Target, Building2, Users, SlidersHorizontal } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/* ── Collapsible section helper ──────────────────────────────────────────── */

function MethodologySection({
  id,
  icon: Icon,
  title,
  subtitle,
  accentClass,
  children,
}: {
  id: string
  icon: typeof BookOpen
  title: string
  subtitle: string
  accentClass: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div id={id} className={cn("rounded-lg border bg-white overflow-hidden", accentClass)}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50/50 transition-colors"
          >
            <Icon className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">{title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
            </div>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-gray-500 shrink-0 mt-1 transition-transform",
                open && "rotate-180"
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-5 pt-0 text-sm text-gray-600 leading-relaxed space-y-4">
            {children}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function SectionBox({
  label,
  tone = "gray",
  children,
}: {
  label: string
  tone?: "gray" | "indigo" | "emerald" | "amber" | "rose" | "purple" | "slate" | "orange"
  children: React.ReactNode
}) {
  const toneMap: Record<string, string> = {
    gray: "border-gray-200 bg-gray-50",
    indigo: "border-indigo-200 bg-indigo-50",
    emerald: "border-emerald-200 bg-emerald-50",
    amber: "border-amber-200 bg-amber-50",
    rose: "border-rose-200 bg-rose-50",
    purple: "border-purple-200 bg-purple-50",
    slate: "border-slate-200 bg-slate-50",
    orange: "border-orange-200 bg-orange-50",
  }
  const labelMap: Record<string, string> = {
    gray: "text-gray-500",
    indigo: "text-indigo-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
    purple: "text-purple-700",
    slate: "text-slate-500",
    orange: "text-orange-700",
  }

  return (
    <div className={cn("rounded-md border p-3", toneMap[tone])}>
      <p className={cn("text-xs font-semibold uppercase tracking-wide mb-2", labelMap[tone])}>
        {label}
      </p>
      {children}
    </div>
  )
}

/* ── Main component ──────────────────────────────────────────────────────── */

export function ThresholdMethodologyNote() {
  const [open, setOpen] = useState(false)

  return (
    <Card className="mb-6" id="threshold-methodology">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Methodology: detector learning and threshold tuning
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Show full methodology
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 space-y-3">

            {/* ── 1. Process Overview ──────────────────────────────────── */}

            <MethodologySection
              id="methodology-process"
              icon={Layers}
              title="Full Process Overview"
              subtitle="Eight-step pipeline from data ingestion to threshold update"
              accentClass="border-gray-200"
            >
              <p>
                The Guardrails system runs a continuous loop that ingests city financial data,
                applies forensic detectors, surfaces findings for human review, and uses
                the outcomes of that review to refine its own sensitivity. No threshold
                change is ever applied automatically&mdash;every adjustment requires
                administrator approval.
              </p>
              <ol className="list-decimal pl-5 space-y-2 text-xs text-gray-700">
                <li>
                  <strong>Data ingestion</strong> pulls the latest city datasets (payroll,
                  vendor payments, contracts, 311 service requests, building permits,
                  campaign contributions, lobbyist disclosures, nonprofit registrations)
                  and normalizes fields used by detectors.
                </li>
                <li>
                  <strong>Detector execution</strong> runs domain-specific checks across
                  five families: payroll, vendor/procurement, infrastructure, integrity/influence,
                  and nonprofit. Each detector applies one or more forensic tests to a
                  slice of the data.
                </li>
                <li>
                  <strong>Scoring and ranking</strong> combines detector outputs using a
                  weighted composite formula that accounts for severity, confidence, detector
                  precision history, and corroboration across multiple signals.
                </li>
                <li>
                  <strong>Review queue dispositions</strong> present prioritized findings
                  to analysts, who label outcomes as confirmed, false positive, escalated,
                  or deferred.
                </li>
                <li>
                  <strong>Accuracy tracking</strong> updates per-detector precision, recall,
                  and support counts from those labeled outcomes, both locally and across
                  the consortium of cities.
                </li>
                <li>
                  <strong>Recalibration</strong> generates review-only threshold
                  recommendations using accumulated evidence: detectors with high
                  false-positive rates are nudged toward stricter thresholds; detectors
                  with strong confirmed support may be loosened to capture more cases.
                </li>
                <li>
                  <strong>Admin approval</strong> applies selected threshold updates via
                  the controls on this page.
                </li>
                <li>
                  <strong>Next analysis run</strong> uses the updated thresholds, and the
                  loop repeats with new evidence.
                </li>
              </ol>
            </MethodologySection>

            {/* ── 2. Origins: Learning from Real Cases ─────────────────── */}

            <MethodologySection
              id="methodology-origins"
              icon={Search}
              title="Origins: How We Built the Detectors"
              subtitle="Studying 22+ real fraud, waste, and abuse cases in San Francisco and beyond"
              accentClass="border-indigo-200"
            >
              <p>
                The detector library was not invented in the abstract. Every detector traces its
                origin to one or more documented cases of waste, fraud, or abuse&mdash;primarily in
                San Francisco, supplemented by landmark cases from other U.S. cities and the
                professional literature of forensic accounting and government audit.
              </p>

              <SectionBox label="The backtesting approach" tone="indigo">
                <p className="text-xs text-indigo-900">
                  We compiled a registry of 22+ confirmed San Francisco cases spanning 2016&ndash;2025
                  and asked: <em>which data signals were present before the fraud was discovered?</em>
                  &ensp;For each case, we mapped the observable patterns (unusual vendor concentrations,
                  impossible work hours, campaign contribution timing, missing nonprofit audits) to
                  specific detector logic. If a detector could not have flagged a known case, we either
                  refined its rules or built a new detector to fill the gap.
                </p>
              </SectionBox>

              <SectionBox label="San Francisco cases that shaped the detectors" tone="slate">
                <div className="space-y-3 text-xs text-slate-800">
                  <div>
                    <p className="font-semibold">Jones/Henriquez embezzlement ($1.4M)</p>
                    <p className="text-slate-600 mt-0.5">
                      A city employee and outside accomplice diverted $1.4 million through shell
                      vendors. The scheme relied on ghost vendor identities, concentrated
                      department spending, split purchase orders kept below approval thresholds,
                      and payments to entities with no verifiable physical presence. This single
                      case motivated four detectors: vendor concentration (D6), ghost vendor
                      screening (D9), split-PO detection (D8), and the nonprofit&ndash;vendor overlap
                      check (NP5) that catches entities appearing on both the grant and vendor rolls.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold">SF SAFE / Worthy ($700K+)</p>
                    <p className="text-slate-600 mt-0.5">
                      A nonprofit safety organization&rsquo;s former executive diverted over $700,000
                      through ineligible personal expenses&mdash;luxury travel, gift cards, personal
                      purchases&mdash;charged to city grants. This case drove the ineligible-expense
                      keyword scanner (NP2), which encodes OMB Uniform Guidance prohibitions
                      (2 CFR 200) and adds SF-specific patterns learned from this and similar cases.
                      It also informed the residential-address detector (D13) after investigators
                      found payments routed to personal addresses.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold">DBI / Cyril Yu permit bribery</p>
                    <p className="text-slate-600 mt-0.5">
                      A Department of Building Inspection official accepted bribes to fast-track
                      permits. The detectable signal: permits approved dramatically faster than
                      the statistical norm for their type and neighborhood. This led to the
                      permit fast-tracking detector (D6/Infrastructure), which compares each
                      permit&rsquo;s processing time against the median for its permit-type and
                      neighborhood cohort.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold">Dream Keeper Initiative / Davis ($4.6M)</p>
                    <p className="text-slate-600 mt-0.5">
                      Investigations found $4.6 million in questionable disbursements through a
                      city equity initiative, including split purchase orders designed to avoid
                      oversight thresholds, duplicate grant claims across departments, and
                      prohibited expense categories. The case reinforced split-PO detection,
                      cross-grant double-dipping (NP1), and tightened the ineligible-expense scanner.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold">Ellicott / IAG Services ($627K)</p>
                    <p className="text-slate-600 mt-0.5">
                      A fictitious consulting firm collected $627K in payments despite having no
                      employees, no verifiable office, and vague contract descriptions. Every
                      invoice was a round dollar amount. This case is a near-perfect illustration
                      of why the system combines ghost-vendor checks, residential/mail-drop
                      address detection, vague-contract language analysis, round-number anomaly
                      flagging, and split-PO detection.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold">SFPD systematic overtime abuse ($108M)</p>
                    <p className="text-slate-600 mt-0.5">
                      A Controller&rsquo;s audit documented $108 million in overtime spending with
                      structural failures: officers logging physically impossible hours, a tiny
                      fraction of employees capturing the majority of OT dollars, and departments
                      where OT exceeded base pay. This drove the entire payroll detector family:
                      OT-to-base ratio (D1), Pareto concentration (D2), department outlier
                      analysis (D4), and hours feasibility checks (D6).
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold">Parks Alliance / Recology ($570M+ / $94.5M)</p>
                    <p className="text-slate-600 mt-0.5">
                      Two interconnected scandals revealed how lobbyist relationships and
                      campaign contributions influenced contract awards. The Parks Alliance case
                      showed a single nonprofit capturing over $570M in city contracts while
                      maintaining close lobbyist ties to approving officials. The Recology case
                      demonstrated classic pay-to-play: campaign donations timed around contract
                      renewals worth $94.5M. These cases directly informed the lobbyist
                      chronology detector (D17), pay-to-play analysis (D18), and behested
                      payment tracking (D20i), all of which examine the timing relationship
                      between financial influence and contract awards.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold">140 state-barred nonprofits ($25M)</p>
                    <p className="text-slate-600 mt-0.5">
                      An investigation found that 140 nonprofits receiving a combined $25M in
                      city grants had been barred from operating by the California Attorney
                      General under Business &amp; Professions Code &sect;12580+. This led to the
                      charity-registration detector (NP4), which cross-references every grant
                      recipient against the CA AG&rsquo;s public registry files to flag entities
                      that may not operate, have been dissolved, or have indeterminate status.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold">Urban Ed Academy ($15.2M)</p>
                    <p className="text-slate-600 mt-0.5">
                      A single nonprofit received $15.2M through contracts whose spending drifted
                      far from the original scope, with budget-to-actual variances exceeding any
                      reasonable tolerance. This case sharpened the contract-drift detector (D10)
                      and the budget-variance analysis (D5), both of which compare actual
                      expenditures against contracted or budgeted amounts.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold">CCG score fabrication ($14M+)</p>
                    <p className="text-slate-600 mt-0.5">
                      A consulting firm received over $14M after fabricating performance metrics
                      used to justify contract renewals. The case highlighted the need for
                      convergence analysis: when procurement red flags (sole-source, vague scope)
                      align with infrastructure performance anomalies (fabricated resolution
                      metrics), the combined signal is far stronger than either alone.
                    </p>
                  </div>
                </div>
              </SectionBox>

              <SectionBox label="Patterns from other cities" tone="gray">
                <p className="text-xs text-gray-700 mb-2">
                  San Francisco&rsquo;s cases provided the primary training set, but the detector
                  library also encodes patterns documented in federal audits, inspector general
                  reports, and forensic accounting case studies from other jurisdictions:
                </p>
                <ul className="space-y-1.5 text-xs text-gray-700">
                  <li>
                    <strong>Dixon, IL (Rita Crundwell, $53.7M)</strong> &mdash; The largest
                    municipal fraud in U.S. history relied on ghost vendors and fabricated
                    invoices over 20 years. The SSS (Same-Same-Same) duplicate detection and
                    ghost-vendor screening encode the patterns that auditors later identified.
                  </li>
                  <li>
                    <strong>Bell, CA ($5.5M in excess compensation)</strong> &mdash; City
                    officials inflated their own salaries far above comparable positions. The
                    year-over-year compensation spike detector (D3) and cross-department
                    comparisons draw from the statistical approach that eventually exposed
                    the scheme.
                  </li>
                  <li>
                    <strong>Detroit pension fund fraud ($195M)</strong> &mdash; Vendor
                    kickbacks, sole-source contracts, and lobbyist influence produced a
                    pattern of concentrated spending with weak competitive justification.
                    The sole-source detector (D19) and vendor concentration analysis (D6)
                    reflect the red flags identified in the subsequent federal investigation.
                  </li>
                  <li>
                    <strong>New York CityTime project ($600M+)</strong> &mdash; Contract
                    drift from an original $63M scope to over $600M with vague amendments.
                    The contract-drift detector (D10) directly encodes the percentage-over-original
                    threshold that would have flagged this progression.
                  </li>
                  <li>
                    <strong>Federal IG / GAO patterns</strong> &mdash; The Government
                    Accountability Office and various inspectors general have published
                    recurring red-flag taxonomies for grant fraud, procurement fraud, and
                    payroll abuse. These taxonomies informed the category structure of the
                    detector families and the specific thresholds used for severity classification.
                  </li>
                </ul>
              </SectionBox>

              <p className="text-xs text-gray-500 italic">
                The backtesting registry is maintained as part of the system&rsquo;s validation suite.
                When a new confirmed case emerges, the team maps it against existing detectors to
                verify coverage and identify gaps.
              </p>
            </MethodologySection>

            {/* ── 3. Forensic Accounting Foundations ───────────────────── */}

            <MethodologySection
              id="methodology-forensic"
              icon={Scale}
              title="Forensic Accounting Foundations"
              subtitle="Professional standards and statistical techniques encoded in each detector"
              accentClass="border-emerald-200"
            >
              <p>
                The detectors implement techniques drawn from the professional practice of
                forensic accounting, government auditing standards (GAGAS / Yellow Book), and
                the fraud examination methodology defined by the Association of Certified Fraud
                Examiners (ACFE). Each technique has decades of validation in litigation,
                regulatory enforcement, and internal audit.
              </p>

              <SectionBox label="Benford&rsquo;s Law analysis" tone="emerald">
                <p className="text-xs text-emerald-900 mb-2">
                  Benford&rsquo;s Law predicts that in naturally occurring datasets, the leading
                  digit &ldquo;1&rdquo; appears approximately 30.1% of the time, while &ldquo;9&rdquo;
                  appears only 4.6%. Fabricated numbers typically show a more uniform distribution
                  because people unconsciously avoid patterns that &ldquo;look too regular.&rdquo;
                </p>
                <p className="text-xs text-emerald-900 mb-2">
                  The system applies three levels of Benford analysis to both vendor invoices and
                  overtime payments:
                </p>
                <ul className="space-y-1 text-xs text-emerald-900">
                  <li>
                    <strong>First-digit test:</strong> Compares the observed frequency of leading
                    digits 1&ndash;9 against expected Benford frequencies using a chi-square
                    goodness-of-fit statistic.
                  </li>
                  <li>
                    <strong>Second-digit test:</strong> Extends the analysis to the second digit
                    (0&ndash;9), which has its own predicted distribution and is more sensitive to
                    rounding and estimation.
                  </li>
                  <li>
                    <strong>First-two-digit test:</strong> Examines the joint distribution of the
                    first two digits (10&ndash;99), providing the most granular view. A spike at
                    specific two-digit combinations (e.g., 50, 10, 25) can indicate round-number
                    fabrication.
                  </li>
                </ul>
                <p className="text-xs text-emerald-800 mt-2 italic">
                  Benford anomalies alone are not proof of fraud. They indicate that a dataset&rsquo;s
                  digit distribution deviates from what would be expected of organic financial
                  activity. When combined with other signals (ghost vendors, split POs), the
                  evidentiary weight increases substantially.
                </p>
              </SectionBox>

              <SectionBox label="Same-Same-Same (SSS) duplicate detection" tone="gray">
                <p className="text-xs text-gray-700 mb-2">
                  SSS is a standard forensic accounting test for double billing. It identifies
                  transactions where the same vendor received the same dollar amount across
                  three or more distinct vouchers. While legitimate recurring payments (monthly
                  rent, subscription services) can produce SSS matches, the detector applies
                  suppression rules to filter them:
                </p>
                <ul className="space-y-1 text-xs text-gray-700">
                  <li>
                    <strong>Cadence suppression:</strong> If payment dates show low coefficient
                    of variation (CV&lt;0.30 on inter-payment intervals), the pattern is
                    consistent with a recurring subscription and is suppressed.
                  </li>
                  <li>
                    <strong>Blanket PO suppression:</strong> Payments under a blanket purchase
                    order with adequate headroom are expected to repeat.
                  </li>
                  <li>
                    <strong>Cross-fiscal continuity:</strong> Payments that span fiscal year
                    boundaries at the same cadence suggest ongoing contracts, not duplication.
                  </li>
                </ul>
              </SectionBox>

              <SectionBox label="Relative Size Factor (RSF)" tone="gray">
                <p className="text-xs text-gray-700">
                  The RSF test divides a vendor&rsquo;s largest single payment by their second-largest
                  payment. When this ratio exceeds 10 (and the largest payment exceeds $10K),
                  the outlier payment warrants scrutiny&mdash;it may represent an unauthorized
                  transaction, a data entry error, or a fraudulent invoice designed to extract a
                  large amount in a single transaction. RSF analysis is a recognized technique in
                  the ACFE&rsquo;s fraud examination toolkit and has been validated across hundreds
                  of forensic engagements.
                </p>
              </SectionBox>

              <SectionBox label="Structuring and threshold avoidance" tone="amber">
                <p className="text-xs text-amber-900 mb-2">
                  Structuring&mdash;splitting transactions to stay below reporting or approval
                  thresholds&mdash;is one of the most common procurement fraud patterns. Two
                  detectors target this behavior:
                </p>
                <ul className="space-y-1 text-xs text-amber-900">
                  <li>
                    <strong>Split purchase order detection (D8):</strong> Identifies multiple
                    payments to the same vendor within a 30-day rolling window where each
                    payment falls below common approval thresholds ($10K, $25K, $50K) but
                    the combined total exceeds them.
                  </li>
                  <li>
                    <strong>Adaptive threshold clustering (D12):</strong> Analyzes the
                    distribution of invoice amounts and looks for statistically significant
                    clustering just below known approval limits. If 40% of a vendor&rsquo;s
                    invoices land between $9,500 and $9,999 when the approval threshold is
                    $10,000, that pattern is unlikely to be coincidental.
                  </li>
                </ul>
              </SectionBox>

              <SectionBox label="Round-number analysis" tone="amber">
                <p className="text-xs text-amber-900">
                  Fraudulent invoices tend to use round dollar amounts ($5,000, $10,000, $25,000)
                  at a higher rate than legitimate invoices, because fabricated amounts lack the
                  natural variation of real pricing and hours-based billing. The round-number
                  detector compares the frequency of round amounts ($500, $1K, $5K, $8K, $10K)
                  in a given vendor&rsquo;s or department&rsquo;s payment stream against the city-wide
                  baseline rate. Excess round-number frequency, especially when combined with
                  ghost-vendor or vague-contract signals, raises the finding&rsquo;s severity.
                </p>
              </SectionBox>

              <SectionBox label="Hours feasibility and impossibility tests" tone="rose">
                <p className="text-xs text-rose-900">
                  Drawn from payroll fraud examination standards, these tests apply physical
                  constraints to reported work hours. A hard cap flags any employee reporting
                  more than 100 hours per week as physically impossible. A secondary threshold
                  flags 80&ndash;100 hours as improbable. The detector also checks for employees
                  reporting overtime with zero base salary (a &ldquo;ghost employee&rdquo; indicator)
                  and uses z-score analysis to identify employees whose total hours exceed
                  three standard deviations above their job-class peers. These are not judgment
                  calls&mdash;they encode the same physical-impossibility checks that auditors
                  apply manually during payroll investigations.
                </p>
              </SectionBox>

              <SectionBox label="Pareto concentration analysis" tone="purple">
                <p className="text-xs text-purple-900">
                  The Pareto principle (80/20 rule) is a standard forensic lens for identifying
                  disproportionate resource capture. In payroll, the detector calculates what
                  percentage of total overtime is earned by the top 15% of employees. When that
                  share exceeds 30%, and particularly when the same individuals appear in the
                  top tier across multiple fiscal years (chronic concentration), the pattern
                  indicates structural overtime abuse rather than occasional operational need.
                  The detector adjusts its expected concentration threshold by department headcount
                  to avoid false positives in small departments.
                </p>
              </SectionBox>

              <SectionBox label="Influence timing analysis" tone="indigo">
                <p className="text-xs text-indigo-900">
                  The pay-to-play and lobbyist chronology detectors encode a timing-based
                  forensic methodology. Rather than merely identifying that a campaign donor
                  also received a contract, the system examines the temporal relationship:
                  contributions within 90 days before a contract award carry more weight than
                  those 365 days prior. Lobbyist meetings with decision-makers in the window
                  between RFP issuance and contract award are weighted higher than routine
                  quarterly meetings. This approach mirrors the analysis used by ethics
                  commissions and the Department of Justice in public-corruption investigations.
                </p>
              </SectionBox>
            </MethodologySection>

            {/* ── 4. Detector Categories Deep Dive ────────────────────── */}

            <MethodologySection
              id="methodology-categories"
              icon={Target}
              title="Detector Categories: What Each Family Checks"
              subtitle="Detailed breakdown of all five detector families and their individual tests"
              accentClass="border-purple-200"
            >
              <p>
                The system organizes its 35+ detectors into five families. Each family targets
                a distinct domain of municipal spending and governance. Within each family,
                individual detectors test for specific fraud, waste, or abuse patterns using
                the forensic techniques described above.
              </p>

              <SectionBox label="Payroll &amp; Compensation (7 detectors)" tone="indigo">
                <div className="space-y-2 text-xs text-indigo-900">
                  <p className="italic text-indigo-700 mb-1">
                    Targets: overtime abuse, phantom employees, compensation manipulation,
                    pension inflation
                  </p>
                  <div>
                    <strong>D1 &mdash; Overtime-to-Base Ratio:</strong> Flags employees whose
                    overtime exceeds a percentage of their base salary. Uses higher thresholds for
                    public-safety departments (police, fire, sheriff) where overtime is structurally
                    higher. Tracks persistence across fiscal years to distinguish chronic abuse from
                    one-time surges.
                  </div>
                  <div>
                    <strong>D2 &mdash; Pareto Concentration:</strong> Identifies when a small group
                    captures a disproportionate share of overtime dollars. Calculates the share held
                    by the top 15% and compares to the expected concentration given department size.
                    Flags repeat top earners across years.
                  </div>
                  <div>
                    <strong>D3 &mdash; Year-over-Year Compensation Spikes:</strong> Detects employees
                    whose current-year total compensation exceeds their three-year trailing average by
                    more than 20%. Distinguishes OT-driven spikes from base-salary increases. Elevates
                    severity when the employee is approaching retirement (pension-inflation risk).
                  </div>
                  <div>
                    <strong>D4 &mdash; Department OT Outliers:</strong> Uses z-score analysis to
                    identify departments whose overtime ratio is statistically anomalous compared to
                    peer departments. Maintains separate comparison pools for public-safety and
                    non-safety departments to avoid false positives from known high-OT sectors.
                  </div>
                  <div>
                    <strong>D5 &mdash; Benford&rsquo;s Law (Payroll):</strong> Applies chi-square
                    digit analysis to overtime dollar amounts at both the city-wide and per-department
                    level, testing first-digit, second-digit, and first-two-digit distributions.
                  </div>
                  <div>
                    <strong>D6 &mdash; Hours Feasibility:</strong> Applies physical impossibility
                    thresholds (&gt;100 hrs/week = impossible, 80&ndash;100 = improbable) and
                    statistical outlier detection (z&gt;3 above job-class peers). Flags OT with
                    zero base salary as ghost-employee risk.
                  </div>
                  <div>
                    <strong>D7 &mdash; Comp-Time / Other Salary Manipulation:</strong> Detects when
                    &ldquo;other salaries&rdquo; (comp-time cashouts, special pay, stipends) exceed
                    30% of base pay, indicating potential pension-inflation or unauthorized
                    compensation schemes.
                  </div>
                </div>
              </SectionBox>

              <SectionBox label="Vendor &amp; Procurement (14 detectors)" tone="orange">
                <div className="space-y-2 text-xs text-orange-900">
                  <p className="italic text-orange-700 mb-1">
                    Targets: invoice fraud, shell companies, bid rigging, contract manipulation,
                    threshold avoidance
                  </p>
                  <div>
                    <strong>D1 &mdash; SSS Duplicate Payments:</strong> Same vendor, same amount,
                    three or more vouchers. Applies cadence, blanket-PO, and fiscal-year continuity
                    filters to suppress legitimate recurring payments.
                  </div>
                  <div>
                    <strong>D2 &mdash; Misdirected Payments:</strong> Same PO number, same amount,
                    different vendors. Indicates possible payment rerouting or invoice substitution.
                  </div>
                  <div>
                    <strong>D3 &mdash; Benford&rsquo;s Law (Invoices):</strong> Chi-square analysis
                    on invoice amounts by department, requiring minimum sample size of 200.
                  </div>
                  <div>
                    <strong>D4 &mdash; Relative Size Factor:</strong> Flags vendors whose largest
                    payment is 10x+ their second-largest when the large payment exceeds $10K.
                  </div>
                  <div>
                    <strong>D5 &mdash; Round-Number Anomalies:</strong> Compares round-amount
                    frequency ($500, $1K, $5K, $8K, $10K) against city-wide baseline rates.
                  </div>
                  <div>
                    <strong>D6 &mdash; Vendor Concentration:</strong> Herfindahl-style analysis
                    identifying when a single vendor dominates a department&rsquo;s spending.
                  </div>
                  <div>
                    <strong>D7/D7b &mdash; Price Disparity:</strong> Same commodity purchased at
                    materially different prices across departments or within the same department.
                  </div>
                  <div>
                    <strong>D8 &mdash; Split Purchase Orders:</strong> Multiple payments to one
                    vendor in 30 days, each below approval thresholds, combined total above them.
                  </div>
                  <div>
                    <strong>D9 &mdash; Ghost Vendors:</strong> Vendors with no verifiable entry in
                    the city&rsquo;s registered business database or no contract history.
                  </div>
                  <div>
                    <strong>D10 &mdash; Contract Drift:</strong> Current spending exceeds 25% above
                    original contract amount.
                  </div>
                  <div>
                    <strong>D11 &mdash; Short Bid Windows:</strong> Bid opportunities with a posting
                    period under 7 days, indicating potential steering.
                  </div>
                  <div>
                    <strong>D12 &mdash; Adaptive Threshold Clustering:</strong> Statistical
                    clustering of amounts just below approval limits.
                  </div>
                  <div>
                    <strong>D13 &mdash; Residential / Mail-Drop Addresses:</strong> Vendor addresses
                    at known mail-drop, virtual-office, or residential locations.
                  </div>
                  <div>
                    <strong>D14 &mdash; Vague Contract Language:</strong> Contracts with generic
                    scope descriptions (&ldquo;services,&rdquo; &ldquo;consulting&rdquo;) and no
                    specific deliverables&mdash;a red flag for slush-fund arrangements.
                  </div>
                </div>
              </SectionBox>

              <SectionBox label="Infrastructure &amp; Service Performance (8 detectors)" tone="emerald">
                <div className="space-y-2 text-xs text-emerald-900">
                  <p className="italic text-emerald-700 mb-1">
                    Targets: service deterioration, budget mismanagement, permit favoritism,
                    end-of-year spending surges
                  </p>
                  <div>
                    <strong>D1 &mdash; Response Time Deterioration:</strong> Calculates median
                    resolution time by agency from 311 data and flags year-over-year increases
                    exceeding 15%.
                  </div>
                  <div>
                    <strong>D2 &mdash; District Equity Gaps:</strong> Compares district-level
                    median response times against the city-wide median. A gap greater than 1.3x
                    indicates inequitable service delivery.
                  </div>
                  <div>
                    <strong>D3 &mdash; Resolution Rate Decline:</strong> Flags agencies or
                    categories where the issue resolution rate dropped more than 3 percentage
                    points year-over-year.
                  </div>
                  <div>
                    <strong>D5 &mdash; Budget Variance:</strong> Compares non-personnel spend
                    against budgeted amounts. Flags underspend below 50% (idle funds),
                    overspend above 110%, and year-over-year growth exceeding twice the CPI
                    rate. Excludes pass-through entities.
                  </div>
                  <div>
                    <strong>D6 &mdash; Permit Fast-Tracking:</strong> Compares each permit&rsquo;s
                    processing time against the median for its (permit type, neighborhood) cohort.
                    The top 5% fastest are flagged as potential favoritism.
                  </div>
                  <div>
                    <strong>D7 &mdash; Fiscal Year-End Spending Surges:</strong> Flags departments
                    where more than 25% of annual spending occurs in May&ndash;June. Elevates
                    severity when the surge concentrates in a single vendor or when spending
                    accelerates into the next fiscal year.
                  </div>
                  <div>
                    <strong>D8 &mdash; Failure-Risk Hotspots:</strong> Geospatial clustering of
                    infrastructure complaints (potholes, sidewalk defects, water/sewer issues)
                    in 500m grid cells over 90-day windows. Acceleration scoring compares the
                    last 30 days against the prior 30 days.
                  </div>
                  <div>
                    <strong>D21 &mdash; Work Order Overbudgeting:</strong> Program-level analysis
                    identifying budgets where less than 30% has been utilized when the budget
                    exceeds $500K, indicating idle funds. Calibrated against the SF Controller&rsquo;s
                    April 2025 audit that identified $332M in idle work-order funds.
                  </div>
                </div>
              </SectionBox>

              <SectionBox label="Integrity &amp; Influence (5 detectors)" tone="rose">
                <div className="space-y-2 text-xs text-rose-900">
                  <p className="italic text-rose-700 mb-1">
                    Targets: revolving door, lobbyist influence, pay-to-play, scheduling
                    impossibilities, behested payments
                  </p>
                  <div>
                    <strong>RD1 &mdash; Revolving Door:</strong> Flags former city employees who
                    became vendors or subcontractors within a restricted cooling-off period,
                    cross-referencing payroll and vendor records.
                  </div>
                  <div>
                    <strong>RD3 &mdash; Time Feasibility:</strong> Detects scheduling overlaps
                    in official duties that suggest an employee could not have performed
                    all claimed responsibilities.
                  </div>
                  <div>
                    <strong>D17 &mdash; Lobbyist Chronology:</strong> Matches lobbyist client
                    lists against contract awardees and examines whether lobbyist meetings
                    occurred in the window between RFP issuance and contract award (−90 to
                    +30 days). Department-match and official-seniority amplify severity.
                  </div>
                  <div>
                    <strong>D18 &mdash; Pay-to-Play:</strong> Matches campaign contribution
                    donor names against vendor names and examines timing (contributions within
                    &plusmn;365 days of contract award). Velocity scoring: if more than 60% of a
                    vendor&rsquo;s contributions cluster near contract dates, severity escalates.
                    Severity grades by contribution size and proximity (&lt;90 days +
                    &gt;$1K = CRITICAL).
                  </div>
                  <div>
                    <strong>D20i &mdash; Behested Payments:</strong> Analyzes SF Ethics Commission
                    Form 3620 filings to identify behested payments (donations solicited by city
                    officials) where the payor also received a city contract. Examines timing,
                    department match, and dollar magnitude.
                  </div>
                </div>
              </SectionBox>

              <SectionBox label="Nonprofit &amp; Grant Compliance (5 detectors)" tone="purple">
                <div className="space-y-2 text-xs text-purple-900">
                  <p className="italic text-purple-700 mb-1">
                    Targets: grant double-dipping, ineligible expenses, fiscal sponsor opacity,
                    registration violations, dual-role entities
                  </p>
                  <div>
                    <strong>NP1 &mdash; Cross-Grant Double Dipping:</strong> Same vendor, same
                    dollar amount, different departments on grant-coded payments (minimum $5K).
                    Indicates potential double billing across grants.
                  </div>
                  <div>
                    <strong>NP2 &mdash; Ineligible Expenses:</strong> Keyword scanner encoding
                    OMB Uniform Guidance (2 CFR 200) prohibitions plus SF-specific patterns:
                    alcohol, entertainment, gift cards, luxury travel, personal items. Includes
                    smart exclusions (hand sanitizer, rubbing alcohol).
                  </div>
                  <div>
                    <strong>NP3 &mdash; Fiscal Sponsor Opacity:</strong> Behavioral pattern
                    detector for fiscal sponsors (intermediary organizations that pass through
                    funds). Flags entities receiving grants from 3+ departments, with &gt;50%
                    round amounts, over $1M total, vague program titles, or names matching
                    known fiscal sponsors.
                  </div>
                  <div>
                    <strong>NP4 &mdash; Charity Registration:</strong> Cross-references every
                    grant recipient against the California Attorney General&rsquo;s public
                    charity registration files. CRITICAL if the entity &ldquo;may not
                    operate&rdquo;; HIGH if dissolved or undetermined; MEDIUM if not found in
                    the registry.
                  </div>
                  <div>
                    <strong>NP5 &mdash; Nonprofit&ndash;Vendor Overlap:</strong> Identifies
                    entities appearing on both the grant-payment roll and the vendor-payment roll
                    (minimum $25K in grants, $10K in vendor payments). Dual-role entities merit
                    additional scrutiny to ensure grant funds are not being recycled through
                    vendor-side contracts.
                  </div>
                </div>
              </SectionBox>
            </MethodologySection>

            {/* ── 5. How Detectors Work Together ──────────────────────── */}

            <MethodologySection
              id="methodology-convergence"
              icon={GitBranch}
              title="How Detectors Work Together"
              subtitle="Convergence analysis, corroboration, and the Fraud Triangle"
              accentClass="border-orange-200"
            >
              <p>
                Individual detectors produce individual findings. The real analytical power comes
                from examining how those findings overlap, reinforce, and converge on the same
                entities and departments. The system uses three mechanisms to evaluate
                multi-signal strength.
              </p>

              <SectionBox label="Cross-detector corroboration" tone="orange">
                <p className="text-xs text-orange-900 mb-2">
                  When multiple independent detectors flag the same entity, the system elevates
                  confidence beyond what any single detector could justify. The confidence
                  scoring module tracks which detectors contributed to each entity&rsquo;s
                  composite score and applies a corroboration multiplier (capped at 1.2&times;)
                  when findings come from different forensic families.
                </p>
                <p className="text-xs text-orange-900 mb-2">
                  For example: if a vendor is flagged by both the ghost-vendor detector (D9)
                  and the round-number anomaly detector (D5), those are independent signals
                  from different analytical methods. The combined finding carries more weight
                  than either alone. But if the same vendor triggers both the SSS duplicate
                  test and the RSF outlier test, those are both payment-amount analyses and
                  the corroboration bonus is smaller.
                </p>
                <p className="text-xs text-orange-800 italic">
                  Importantly, statistical-only detectors (Benford, round numbers) are
                  intentionally capped at lower confidence levels. They are supporting evidence,
                  not primary indicators. A Benford anomaly that corroborates a ghost-vendor
                  finding strengthens the case; a Benford anomaly alone is flagged as informational.
                </p>
              </SectionBox>

              <SectionBox label="Convergence meta-detector" tone="amber">
                <p className="text-xs text-amber-900 mb-2">
                  The convergence detector operates at the department level rather than the
                  entity level. It asks: <em>are multiple types of risk converging on the
                  same organizational unit?</em>
                </p>
                <p className="text-xs text-amber-900 mb-2">
                  It groups all findings by department and checks whether findings span
                  multiple domains&mdash;procurement risk combined with payroll anomalies,
                  or infrastructure performance problems coinciding with influence indicators.
                  Multi-domain convergence is a strong signal because it suggests systemic
                  issues rather than isolated incidents.
                </p>
                <p className="text-xs text-amber-900">
                  A department with vendor-concentration findings, overtime outliers, and a
                  lobbyist-linked contract award presents a very different risk profile than
                  a department with three separate overtime flags. The convergence detector
                  generates its own meta-findings that surface these multi-domain patterns.
                </p>
              </SectionBox>

              <SectionBox label="Fraud Triangle scoring" tone="rose">
                <p className="text-xs text-rose-900 mb-2">
                  The Fraud Triangle&mdash;a foundational concept in forensic accounting developed
                  by criminologist Donald Cressey&mdash;holds that fraud requires three elements:
                  <strong> opportunity</strong> (weak controls, concentrated authority),
                  <strong> pressure</strong> (budget stress, performance targets), and
                  <strong> rationalization</strong> (organizational culture that normalizes
                  rule-bending).
                </p>
                <p className="text-xs text-rose-900 mb-2">
                  The convergence detector maps findings to these three elements:
                </p>
                <ul className="space-y-1 text-xs text-rose-900">
                  <li>
                    <strong>Opportunity indicators:</strong> Sole-source contracts, vendor
                    concentration, vague contract language, permit fast-tracking&mdash;conditions
                    that create the opening for fraud.
                  </li>
                  <li>
                    <strong>Pressure indicators:</strong> Budget variances, end-of-year spending
                    surges, declining service metrics, overtime spikes&mdash;conditions that
                    create the motivation.
                  </li>
                  <li>
                    <strong>Rationalization indicators:</strong> Chronic patterns (same overtime
                    outliers year after year), normalized threshold avoidance (split POs as
                    standard practice), revolving-door relationships&mdash;conditions where
                    irregular behavior has become routine.
                  </li>
                </ul>
                <p className="text-xs text-rose-900 mt-2">
                  When all three elements are present for a department, the Fraud Triangle
                  score amplifies the overall risk assessment. This mirrors the professional
                  judgment framework that forensic accountants use when deciding where to
                  focus a detailed investigation.
                </p>
              </SectionBox>

              <SectionBox label="Composite scoring formula" tone="gray">
                <p className="text-xs text-gray-700 mb-2">
                  Each entity&rsquo;s final composite score is calculated as:
                </p>
                <div className="bg-white rounded border border-gray-300 p-3 font-mono text-xs text-gray-800 mb-2">
                  composite = &Sigma; (severity &times; confidence &times; detector_weight &times; repeat_discount)
                </div>
                <ul className="space-y-1 text-xs text-gray-700">
                  <li>
                    <strong>Severity</strong> maps to a numeric scale: critical = 1.0,
                    high = 0.7, medium = 0.4, low = 0.2, info = 0.1.
                  </li>
                  <li>
                    <strong>Confidence</strong> reflects evidence quality: high = 1.0,
                    medium = 0.7, low = 0.4. Boosted by corroboration, reduced by
                    partial data.
                  </li>
                  <li>
                    <strong>Detector weight</strong> reflects the detector&rsquo;s historical
                    precision. Ghost-vendor findings (weight ~0.95) contribute far more than
                    Benford anomalies (weight ~0.30) because ghost vendors have a much higher
                    rate of confirmed outcomes.
                  </li>
                  <li>
                    <strong>Repeat discount</strong> (0.25): If the same detector fires
                    multiple times on the same entity, subsequent hits are discounted to
                    prevent score inflation from a single noisy detector.
                  </li>
                </ul>
              </SectionBox>
            </MethodologySection>

            {/* ── 6. Cross-City Baselines ─────────────────────────────── */}

            <MethodologySection
              id="methodology-cross-city"
              icon={Building2}
              title="Cross-City Baselines: Establishing Reasonableness"
              subtitle="How the multi-city consortium creates a shared frame of reference"
              accentClass="border-slate-300"
            >
              <p>
                A single city&rsquo;s data can tell you what&rsquo;s unusual <em>for that city</em>,
                but it cannot tell you what&rsquo;s unusual <em>in absolute terms</em>. Is a 45%
                overtime ratio high? It depends on whether you&rsquo;re comparing against a police
                department or a libraries department, and whether the comparison set is one city
                or a dozen.
              </p>
              <p>
                The multi-city consortium model addresses this by pooling anonymized detector
                outcomes across all participating cities to establish baselines of reasonableness.
              </p>

              <SectionBox label="How cross-city comparison works" tone="slate">
                <div className="space-y-2 text-xs text-slate-800">
                  <div>
                    <strong>Local precision vs. consortium precision:</strong> Each detector
                    accumulates a local precision rate (what fraction of its findings are
                    confirmed vs. false positive) based on that city&rsquo;s review queue
                    outcomes. When a city has fewer than 20 labeled outcomes for a detector,
                    the system smooths the local precision toward the consortium-wide precision&mdash;the
                    aggregate precision observed across all cities for that same detector.
                  </div>
                  <div>
                    <strong>Why this matters for new cities:</strong> When a city first joins
                    the platform, it has zero disposition history. Without cross-city data, the
                    system would have no basis for weighting detectors. The consortium provides
                    initial detector weights derived from the collective experience of all
                    participating cities, giving new cities a calibrated starting point rather
                    than naive defaults.
                  </div>
                  <div>
                    <strong>Stabilizing volatile detectors:</strong> Some detectors have
                    inherently variable precision. Benford&rsquo;s Law analysis, for example,
                    produces many findings that turn out to be benign. A single city might see
                    a run of false positives that drives its local Benford precision to near
                    zero. Without consortium smoothing, the system might effectively disable
                    the detector. With smoothing, the consortium-wide evidence (which shows
                    Benford as useful in combination with other signals) keeps the detector
                    active at an appropriate weight.
                  </div>
                </div>
              </SectionBox>

              <SectionBox label="What the consortium measures" tone="gray">
                <ul className="space-y-1.5 text-xs text-gray-700">
                  <li>
                    <strong>Consortium precision:</strong> (total confirmed findings) /
                    (total confirmed + total false positives) across all cities for each
                    detector.
                  </li>
                  <li>
                    <strong>Consortium support:</strong> The total number of labeled outcomes
                    across all cities. Higher support means more stable precision estimates.
                  </li>
                  <li>
                    <strong>Local support:</strong> The city&rsquo;s own labeled outcome count.
                    The smoothing formula weights local vs. consortium proportionally to support.
                  </li>
                  <li>
                    <strong>Weight deltas:</strong> The trust report shows how each detector&rsquo;s
                    effective weight changed based on local outcomes and consortium smoothing,
                    providing full transparency into the calibration process.
                  </li>
                </ul>
              </SectionBox>

              <SectionBox label="Building the baseline of reasonableness" tone="emerald">
                <div className="space-y-2 text-xs text-emerald-900">
                  <p>
                    As more cities join the consortium, the system develops an increasingly
                    robust understanding of what &ldquo;normal&rdquo; looks like across
                    different city sizes, geographies, and governance structures:
                  </p>
                  <div>
                    <strong>Threshold validation:</strong> If overtime-ratio findings in
                    City A are confirmed at 80% but in City B at only 20%, the system can
                    identify that City A may have a genuine overtime problem while City B&rsquo;s
                    threshold may be too aggressive for its context. Over time, this produces
                    context-appropriate thresholds rather than one-size-fits-all values.
                  </div>
                  <div>
                    <strong>Detector effectiveness ranking:</strong> Across the consortium, some
                    detectors consistently produce more confirmed findings than others. This
                    empirical ranking informs the default detector weights for new cities and
                    helps administrators prioritize which detector families to focus their
                    review capacity on.
                  </div>
                  <div>
                    <strong>Anomaly contextualization:</strong> A 50% vendor concentration in a
                    small rural city may be normal (limited vendor pool), while the same
                    concentration in a major metropolitan area is concerning. As consortium data
                    accumulates, the system can contextualize findings against peer cities
                    with similar characteristics.
                  </div>
                </div>
              </SectionBox>

              <SectionBox label="Privacy and data separation" tone="amber">
                <p className="text-xs text-amber-900">
                  Cross-city comparison uses only aggregate detector performance metrics
                  (precision rates, support counts, confirmation rates). No city&rsquo;s
                  raw financial data, entity names, or finding details are shared with other
                  cities. Each city&rsquo;s detailed findings remain accessible only to
                  authorized users of that city&rsquo;s instance.
                </p>
              </SectionBox>
            </MethodologySection>

            {/* ── 7. The Learning Loop ────────────────────────────────── */}

            <MethodologySection
              id="methodology-learning"
              icon={BarChart3}
              title="The Learning Loop: How the System Improves Over Time"
              subtitle="Confirmed cases and false positives refine detector precision and weights"
              accentClass="border-emerald-200"
            >
              <p>
                The system is designed to get better with use. Every finding that an analyst
                reviews&mdash;whether confirmed, marked as a false positive, escalated, or
                deferred&mdash;feeds back into the detector calibration process. This is not
                machine learning in the traditional sense; it is a structured feedback loop
                that updates statistical weights based on labeled outcomes.
              </p>

              <SectionBox label="How confirmed outcomes shape detector behavior" tone="emerald">
                <ul className="space-y-1.5 text-xs text-emerald-900">
                  <li>
                    <strong>Confirmed findings increase trust:</strong> When a detector&rsquo;s
                    findings are consistently confirmed by reviewers, its precision rate rises.
                    Higher precision means the detector&rsquo;s weight in the composite score
                    increases, and its findings rank higher in the review queue.
                  </li>
                  <li>
                    <strong>False positives reduce trust:</strong> Findings marked as false
                    positives lower the detector&rsquo;s precision rate. Over time, this reduces
                    the detector&rsquo;s influence on the composite score. In the recalibration
                    process, persistently low-precision detectors receive recommendations to
                    tighten their thresholds (making them less sensitive).
                  </li>
                  <li>
                    <strong>Support size matters:</strong> A detector with 3 confirmed findings
                    and 0 false positives technically has 100% precision, but the system does
                    not treat this as strong evidence. Minimum support thresholds (typically 20+
                    labeled outcomes) are required before the system will recommend threshold
                    changes. Below that threshold, the detector is held stable and smoothed
                    toward consortium precision.
                  </li>
                  <li>
                    <strong>Bounded updates:</strong> Per-update movement is capped to prevent
                    over-correction. A detector that suddenly receives a burst of false positives
                    will see its recommended threshold tighten, but only by a bounded amount.
                    This prevents a single batch of mislabeled outcomes from destabilizing the
                    system.
                  </li>
                </ul>
              </SectionBox>

              <SectionBox label="Recalibration mechanics" tone="indigo">
                <div className="space-y-2 text-xs text-indigo-900">
                  <p>
                    The recalibration process (triggered from this page) performs the following
                    steps:
                  </p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>
                      Aggregates all labeled outcomes (confirmed, false positive) for each
                      detector across the selected city&rsquo;s history.
                    </li>
                    <li>
                      Computes local precision and compares it against the target precision
                      for each detector.
                    </li>
                    <li>
                      Smooths local precision toward consortium precision based on relative
                      support levels.
                    </li>
                    <li>
                      Calculates a recommended threshold adjustment:
                      <ul className="list-disc pl-4 mt-1">
                        <li>Low precision + high false positives → tighten threshold</li>
                        <li>High confirmed support + strong precision → allow more sensitivity</li>
                        <li>Insufficient support → hold current threshold</li>
                      </ul>
                    </li>
                    <li>
                      Suppresses adjustments below a materiality threshold to avoid noise.
                    </li>
                    <li>
                      Assigns a confidence label (high, medium, low) based on evidence strength.
                    </li>
                    <li>
                      Presents recommendations for administrator review&mdash;nothing is
                      auto-applied.
                    </li>
                  </ol>
                </div>
              </SectionBox>

              <SectionBox label="Watchlist seeding from confirmed cases" tone="purple">
                <p className="text-xs text-purple-900">
                  When recalibration runs, the system can optionally seed a watchlist from
                  confirmed fraud cases. This means entities associated with known fraud
                  are monitored across subsequent analysis runs, not just in the run where
                  the finding was originally generated. If an entity with a confirmed
                  Jones/Henriquez-style vendor scheme continues to receive city payments in
                  later fiscal years, the system will surface that entity in the queue even
                  if the specific threshold that originally caught it has been adjusted.
                </p>
              </SectionBox>

              <SectionBox label="Confidence labels vs. certainty" tone="amber">
                <p className="text-xs text-amber-900">
                  It is important to distinguish confidence from certainty. A &ldquo;high
                  confidence&rdquo; recommendation means there is strong statistical evidence
                  supporting the suggested threshold change&mdash;many labeled outcomes, stable
                  precision, clear directional signal. It does <strong>not</strong> mean the
                  system is certain that any particular finding is fraud. Similarly, a
                  &ldquo;low confidence&rdquo; label means the evidence base is thin, not that
                  the underlying finding is unimportant. The labels communicate
                  <em> evidence strength</em>, helping administrators decide which recommendations
                  to act on first.
                </p>
              </SectionBox>
            </MethodologySection>

            {/* ── 8. Signal Quality Controls ─────────────────────────── */}

            <MethodologySection
              id="methodology-signal-quality"
              icon={SlidersHorizontal}
              title="Signal Quality Controls"
              subtitle="How the system filters noise, ensures consistency across cities, and keeps findings actionable"
              accentClass="border-slate-300"
            >
              <p>
                Detection thresholds (e.g., &ldquo;flag overtime above 50% of base pay&rdquo;)
                determine <em>what</em> the system looks for. Signal quality controls determine
                <em>which of those findings are worth an auditor&rsquo;s time</em>. These are
                separate concerns: the detection standard is the same everywhere, but the
                actionability filters can be tuned per city based on context, budget size, and
                review capacity.
              </p>
              <p>
                All signal quality controls are configurable per city via the Policy Tuning page
                under &ldquo;Signal Quality Controls.&rdquo; Each control is stored as a
                threshold row in the database with a system default and an optional per-city
                override. Changes take effect on the next analysis run.
              </p>

              <SectionBox label="Materiality floor" tone="slate">
                <div className="space-y-2 text-xs text-slate-800">
                  <p>
                    The materiality floor sets the minimum dollar exposure for a finding to
                    appear in results. Findings where the flagged amount falls below this
                    threshold are suppressed from the default view. The number of suppressed
                    findings is reported in the analysis summary for transparency.
                  </p>
                  <div>
                    <strong>How it works:</strong> After all detectors have run and produced raw
                    findings, but before confidence scoring, the system checks each finding&rsquo;s
                    dollar amount against the floor. Findings below the floor are removed from the
                    results. Two categories are exempt:
                  </div>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>
                      <strong>Confirmed historical cases</strong> are never filtered&mdash;their
                      amounts are audited figures from real investigations.
                    </li>
                    <li>
                      <strong>Findings with no dollar amount</strong> (e.g., Benford anomalies,
                      statistical tests) pass through because they cannot be evaluated on dollars.
                    </li>
                  </ul>
                  <div>
                    <strong>Current defaults:</strong> San Francisco uses a $2,500 floor;
                    Chicago and other cities use a $5,000 floor. These reflect differences in
                    procurement patterns: SF has documented cases (e.g., Jones/Henriquez, HRC
                    payment splitting) where structuring schemes used amounts in the
                    $2,500&ndash;$5,000 range, making low-dollar individual findings actionable
                    in that city&rsquo;s context.
                  </div>
                  <div>
                    <strong>What is NOT affected:</strong> Aggregating detectors&mdash;such as
                    D8 (Split Purchase Orders), D1 (SSS Duplicates), D6 (Vendor Concentration),
                    and D2 (Pareto Concentration)&mdash;report the <em>combined</em> dollar
                    exposure across grouped transactions. If someone structures 100 payments of
                    $2,000 each to avoid oversight, the split-PO detector flags the combined
                    $200,000 total, which is well above any materiality floor. The floor filters
                    only the <em>individual finding&rsquo;s</em> reported amount, not the
                    underlying transactions that feed into aggregating detectors.
                  </div>
                  <div>
                    <strong>Trade-off:</strong> Raising the floor reduces noise and review
                    burden but may suppress low-dollar findings that are individually actionable
                    or that represent the early stages of a larger scheme. Lowering it increases
                    coverage at the cost of more findings to review.
                  </div>
                </div>
              </SectionBox>

              <SectionBox label="Confidence floor" tone="indigo">
                <div className="space-y-2 text-xs text-indigo-900">
                  <p>
                    The confidence floor sets the minimum confidence score (0.0&ndash;1.0) for a
                    finding to appear. This primarily filters out single-signal statistical
                    anomalies that lack corroboration from other detectors.
                  </p>
                  <div>
                    <strong>How it works:</strong> After confidence scoring assigns each finding
                    a composite score (based on statistical strength, cross-detector
                    corroboration, and data completeness), findings below the floor are
                    suppressed. Confirmed historical cases are exempt.
                  </div>
                  <div>
                    <strong>Default: 0.35.</strong> At this level, findings typically need either
                    moderate statistical strength <em>or</em> corroboration from at least one
                    other detector to survive. Pure statistical anomalies (e.g., a Benford
                    deviation with no other supporting signal) score around 0.25&ndash;0.30 and
                    are suppressed.
                  </div>
                  <div>
                    <strong>Trade-off:</strong> Raising the floor aggressively filters
                    single-signal findings, which reduces noise but may suppress early-stage
                    detection of patterns that have not yet developed corroborating signals.
                    Lowering it allows more exploratory findings through.
                  </div>
                </div>
              </SectionBox>

              <SectionBox label="Effect-size gates (Benford and round-number detectors)" tone="emerald">
                <div className="space-y-2 text-xs text-emerald-900">
                  <p>
                    Statistical tests like Benford&rsquo;s Law and round-number analysis use
                    chi-square goodness-of-fit statistics. A fundamental property of chi-square
                    tests is that <em>any</em> deviation becomes statistically significant with
                    a large enough sample&mdash;even deviations too small to indicate real
                    manipulation.
                  </p>
                  <div>
                    <strong>The problem:</strong> A city with 500,000 vendor payments will
                    produce Benford &ldquo;hits&rdquo; on almost every department simply because
                    the sample size makes even 0.5% deviations from expected proportions
                    statistically significant. These are mathematically correct but not
                    actionable.
                  </div>
                  <div>
                    <strong>The solution:</strong> Effect-size gates require that the
                    <em> magnitude</em> of deviation exceeds a minimum threshold, not just the
                    <em> statistical significance</em>. The system computes the Mean Absolute
                    Deviation (MAD) between observed and expected Benford digit proportions. Only
                    departments where MAD exceeds the threshold (default 1.5 percentage points)
                    are flagged.
                  </div>
                  <div>
                    <strong>For round numbers:</strong> The detector already computes the excess
                    proportion of round-number payments above the expected 10% baseline. The
                    effect-size gate (default 10 percentage points) requires that at least 20% of
                    a vendor&rsquo;s payments be round numbers before a finding is emitted.
                  </div>
                  <div>
                    <strong>Trade-off:</strong> These gates do not change the detection
                    <em> standard</em>&mdash;the same forensic test is applied everywhere. They
                    change the <em>sensitivity floor</em> so that the standard scales correctly
                    with dataset size. A 15% deviation from Benford proportions in a
                    50-transaction department is meaningful; a 0.8% deviation in a 100,000-transaction
                    department is noise, even though both pass a p&lt;0.001 significance test.
                  </div>
                </div>
              </SectionBox>

              <SectionBox label="Entity consolidation" tone="purple">
                <div className="space-y-2 text-xs text-purple-900">
                  <p>
                    When three or more independent detectors flag the same entity (vendor,
                    employee, or department), the system generates a consolidated &ldquo;Multi-Signal
                    Investigation Target&rdquo; finding that groups them together.
                  </p>
                  <div>
                    <strong>How it works:</strong> After all detectors and the convergence
                    meta-detector have run, the system builds a map of each entity to the distinct
                    detector families that flagged it. Entities meeting or exceeding the minimum
                    signal count (default: 3) produce a consolidated meta-finding. The original
                    component findings are preserved and linked to the consolidated parent.
                  </div>
                  <div>
                    <strong>Why this matters for auditors:</strong> An auditor reviewing a queue
                    of 300 findings does not want to see &ldquo;ACME Corp: Duplicate Payments,&rdquo;
                    &ldquo;ACME Corp: Round Numbers,&rdquo; &ldquo;ACME Corp: Ghost Vendor,&rdquo;
                    and &ldquo;ACME Corp: Concentration&rdquo; as four separate items. They want
                    to see <em>&ldquo;ACME Corp: 4 independent risk signals&rdquo;</em> with the
                    details available on expansion. Consolidation reduces cognitive load without
                    losing any information.
                  </div>
                  <div>
                    <strong>Trade-off:</strong> Setting the minimum too low (e.g., 2) may
                    consolidate findings that happen to share an entity name but represent
                    unrelated patterns. Setting it too high (e.g., 5) means only the most extreme
                    cases get consolidated, reducing the decluttering benefit.
                  </div>
                </div>
              </SectionBox>

              <SectionBox label="Novelty weighting (recurring vs. new findings)" tone="orange">
                <div className="space-y-2 text-xs text-orange-900">
                  <p>
                    Not all findings are equally urgent. A vendor flagged for the same pattern
                    in every analysis run for two years is a different priority than a vendor
                    flagged for the first time this month.
                  </p>
                  <div>
                    <strong>How it works:</strong> After analysis, the system checks each
                    finding&rsquo;s entity + detector combination against prior runs stored in
                    the database. Findings that match a prior run are tagged as
                    &ldquo;recurring&rdquo; and their severity is capped at a configurable
                    maximum (default: Medium). New findings&mdash;those appearing for the first
                    time&mdash;retain their original severity unmodified.
                  </div>
                  <div>
                    <strong>Rationale:</strong> Recurring findings often represent structural
                    patterns: a police department will always have high overtime, a utility
                    provider will always dominate its department&rsquo;s vendor concentration.
                    These are worth knowing but should not crowd out new anomalies that may
                    represent active fraud. Capping recurring severity ensures new signals
                    surface at the top of the review queue.
                  </div>
                  <div>
                    <strong>Confirmed historical cases are exempt:</strong> Findings in the
                    Confirmed Cases category are never subject to novelty discounting&mdash;they
                    represent validated fraud regardless of how many times the system has seen them.
                  </div>
                  <div>
                    <strong>Trade-off:</strong> Setting the severity cap to Low aggressively
                    demotes recurring findings, which is appropriate when review capacity is
                    limited and the goal is to focus on new leads. Setting it to High
                    preserves more of the original severity, which is better when the recurring
                    pattern may represent ongoing rather than historical behavior.
                  </div>
                </div>
              </SectionBox>

              <SectionBox label="How these controls interact" tone="gray">
                <div className="space-y-2 text-xs text-gray-700">
                  <p>
                    The signal quality controls run in a specific pipeline order:
                  </p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>
                      <strong>Effect-size gates</strong> (inside detectors) &mdash; prevent
                      trivial statistical deviations from becoming findings at all.
                    </li>
                    <li>
                      <strong>Materiality floor</strong> (post-detection) &mdash; removes
                      findings below the dollar threshold.
                    </li>
                    <li>
                      <strong>Confidence scoring</strong> (post-detection) &mdash; assigns each
                      finding a composite confidence score.
                    </li>
                    <li>
                      <strong>Confidence floor</strong> (post-scoring) &mdash; removes findings
                      below the confidence threshold.
                    </li>
                    <li>
                      <strong>Novelty weighting</strong> (post-scoring) &mdash; tags recurring
                      findings and caps their severity.
                    </li>
                    <li>
                      <strong>Convergence analysis</strong> (post-scoring) &mdash; adds
                      cross-domain meta-findings.
                    </li>
                    <li>
                      <strong>Entity consolidation</strong> (post-convergence) &mdash; groups
                      multi-signal entities.
                    </li>
                  </ol>
                  <p>
                    This ordering means a finding must survive all earlier filters to reach later
                    stages. A $3,000 Benford anomaly with low confidence is removed by the
                    materiality floor and never reaches confidence scoring. A high-confidence,
                    high-dollar finding that recurs every run has its severity capped but
                    is still visible.
                  </p>
                </div>
              </SectionBox>

              <SectionBox label="Per-city customization" tone="amber">
                <div className="space-y-2 text-xs text-amber-900">
                  <p>
                    Every signal quality control can be customized independently for each city.
                    The system stores a default value and an optional per-city override. The
                    effective value is always <code>COALESCE(city_override, system_default)</code>.
                  </p>
                  <p>
                    This design reflects the reality that different cities have different contexts:
                  </p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>
                      A city with documented split-PO structuring at the $2,500&ndash;$5,000 level
                      (e.g., San Francisco) should have a lower materiality floor than a city where
                      procurement oversight starts at $10,000.
                    </li>
                    <li>
                      A city with a small audit team may want a higher confidence floor to
                      reduce queue volume, while a city with a dedicated forensic unit may prefer
                      a lower floor to maximize coverage.
                    </li>
                    <li>
                      A city experiencing rapid turnover of vendors may want novelty weighting
                      set to Low (more aggressive demotion of recurring findings) to surface
                      new actors quickly.
                    </li>
                  </ul>
                  <p>
                    The detection standards themselves&mdash;what constitutes a 50% overtime ratio
                    or a ghost vendor or a Benford deviation&mdash;are the same across all cities.
                    The signal quality controls adjust <em>how those detections are prioritized
                    and presented</em>, not what is detected.
                  </p>
                </div>
              </SectionBox>
            </MethodologySection>

            {/* ── 9. Guardrails and Limitations ───────────────────────── */}

            <MethodologySection
              id="methodology-guardrails"
              icon={Shield}
              title="Guardrails, Limitations, and Responsible Use"
              subtitle="What the system can and cannot do, and the safeguards in place"
              accentClass="border-rose-200"
            >
              <SectionBox label="What the system does" tone="emerald">
                <ul className="space-y-1 text-xs text-emerald-900">
                  <li>Identifies statistical anomalies and known fraud patterns in public financial data.</li>
                  <li>Prioritizes findings by composite risk score to help analysts focus limited review capacity.</li>
                  <li>Tracks which detectors are performing well and which are producing noise.</li>
                  <li>Recommends threshold adjustments based on accumulated evidence.</li>
                  <li>Provides an audit trail for every threshold change and its justification.</li>
                </ul>
              </SectionBox>

              <SectionBox label="What the system does NOT do" tone="rose">
                <ul className="space-y-1 text-xs text-rose-900">
                  <li>
                    <strong>It does not prove fraud.</strong> Every finding is a statistical
                    flag that merits human investigation, not a conclusion. Many flags will
                    have innocent explanations.
                  </li>
                  <li>
                    <strong>It does not replace professional auditors.</strong> The system is a
                    prioritization and screening tool. Findings that warrant action should be
                    investigated by qualified professionals following applicable audit standards.
                  </li>
                  <li>
                    <strong>It does not auto-apply changes.</strong> No threshold adjustment,
                    no detector weight change, and no finding disposition occurs without human
                    review and approval.
                  </li>
                  <li>
                    <strong>It does not have access to non-public data.</strong> All analysis
                    runs on publicly available datasets. Findings based on public data may
                    differ from conclusions drawn with access to internal records.
                  </li>
                  <li>
                    <strong>It does not assign guilt.</strong> The language of findings uses
                    &ldquo;anomaly,&rdquo; &ldquo;flag,&rdquo; &ldquo;indicator,&rdquo; and
                    &ldquo;concern&rdquo;&mdash;never &ldquo;fraud&rdquo; or
                    &ldquo;guilty.&rdquo;
                  </li>
                </ul>
              </SectionBox>

              <SectionBox label="Recommendation guardrails" tone="amber">
                <ul className="space-y-1 text-xs text-amber-900">
                  <li>
                    <strong>Review-only:</strong> All recalibration recommendations are
                    presented for administrator review. Nothing is auto-applied.
                  </li>
                  <li>
                    <strong>Minimum support:</strong> Threshold recommendations require a
                    minimum number of labeled outcomes before any detector&rsquo;s threshold
                    can be moved.
                  </li>
                  <li>
                    <strong>Capped movement:</strong> Per-update movement is capped to prevent
                    over-correction from a single recalibration cycle.
                  </li>
                  <li>
                    <strong>Materiality filter:</strong> Small delta adjustments (below 1%)
                    are suppressed as non-material to avoid administrative noise.
                  </li>
                  <li>
                    <strong>Confidence tiers:</strong> High, medium, and low confidence labels
                    help administrators prioritize which changes to apply first, starting with
                    the strongest evidence.
                  </li>
                  <li>
                    <strong>Incremental application:</strong> Best practice is to apply a
                    limited batch of high-confidence changes, observe results, then iterate&mdash;never
                    to apply all recommendations simultaneously.
                  </li>
                </ul>
              </SectionBox>

              <SectionBox label="Known limitations" tone="gray">
                <ul className="space-y-1.5 text-xs text-gray-700">
                  <li>
                    <strong>Data quality dependency:</strong> Detectors are only as good as
                    the underlying data. Delayed dataset updates, missing fields, or data
                    entry errors in source systems will affect detection accuracy.
                  </li>
                  <li>
                    <strong>Novel fraud schemes:</strong> The detector library is built from
                    known patterns. Truly novel fraud techniques that do not resemble any
                    historical case may evade detection until the pattern is identified and
                    a new detector is built.
                  </li>
                  <li>
                    <strong>Small-sample instability:</strong> Cities with small budgets,
                    few vendors, or limited transaction volumes will have noisier detector
                    outputs due to smaller sample sizes. Consortium smoothing mitigates but
                    does not eliminate this issue.
                  </li>
                  <li>
                    <strong>Statistical vs. deterministic:</strong> Some detectors
                    (Benford&rsquo;s Law, round numbers) are inherently probabilistic and will
                    always produce some false positives. These are designed as supporting
                    evidence, not standalone indicators, and are weighted accordingly.
                  </li>
                </ul>
              </SectionBox>
            </MethodologySection>

            {/* ── 10. Operational Guidance ─────────────────────────────── */}

            <MethodologySection
              id="methodology-operational"
              icon={Users}
              title="Operational Guidance for This Page"
              subtitle="How administrators should approach threshold tuning in practice"
              accentClass="border-gray-200"
            >
              <SectionBox label="Recommended workflow" tone="gray">
                <ol className="list-decimal pl-4 space-y-1.5 text-xs text-gray-700">
                  <li>
                    <strong>Start with recalibration:</strong> Run the recalibration process
                    to generate data-driven recommendations based on actual confirmed and
                    false-positive outcomes.
                  </li>
                  <li>
                    <strong>Review high-confidence first:</strong> Begin with the
                    high-confidence, material recommendations. These have the strongest
                    evidence base and the lowest risk of adverse effects.
                  </li>
                  <li>
                    <strong>Apply in batches:</strong> Apply a small batch (5&ndash;10
                    changes), save, and run a new analysis to observe the effect on queue
                    volume, precision, and false-positive rate before making additional changes.
                  </li>
                  <li>
                    <strong>Monitor impact:</strong> After each batch, use the Impact Preview
                    panels to verify that queue volume and precision are moving in the
                    expected direction.
                  </li>
                  <li>
                    <strong>Proceed to medium confidence:</strong> Only after observing the
                    impact of high-confidence changes should you move to medium-confidence
                    recommendations.
                  </li>
                  <li>
                    <strong>Avoid simultaneous multi-family changes:</strong> Changing
                    thresholds in multiple detector families at once makes it difficult to
                    attribute improvements or regressions to specific changes. Adjust one
                    family at a time when possible.
                  </li>
                  <li>
                    <strong>Document rationale:</strong> When overriding a recommendation or
                    manually adjusting a threshold, note the reasoning. Future recalibrations
                    will account for the change, but the institutional knowledge of
                    <em> why</em> matters for audit purposes.
                  </li>
                </ol>
              </SectionBox>

              <SectionBox label="Interpreting the sensitivity slider" tone="indigo">
                <p className="text-xs text-indigo-900 mb-2">
                  Each detector category has an &ldquo;Overall Sensitivity&rdquo; slider that
                  provides a quick way to adjust all thresholds in a family proportionally.
                  Moving the slider right increases sensitivity (more alerts, more findings,
                  potentially more false positives). Moving it left decreases sensitivity
                  (fewer alerts, possibly missing true positives).
                </p>
                <p className="text-xs text-indigo-900">
                  The slider adjusts thresholds as a normalized proportion of each
                  detector&rsquo;s configured range, preserving the relative relationships
                  between individual thresholds within the family. For fine-grained control,
                  use the individual detector sliders below each category.
                </p>
              </SectionBox>

              <SectionBox label="Reason code glossary" tone="gray">
                <ul className="space-y-1.5 text-xs text-gray-700">
                  <li>
                    <strong>low_precision_high_fp:</strong> Tighten threshold due to very low
                    precision or high false-positive rate. The detector is generating more
                    noise than signal at its current setting.
                  </li>
                  <li>
                    <strong>precision_below_target:</strong> Tighten threshold due to
                    below-target quality. The detector is functional but not meeting its
                    expected precision benchmark.
                  </li>
                  <li>
                    <strong>high_confirmed_support:</strong> Allow more sensitivity. Strong
                    confirmed-case support suggests the detector is accurately identifying
                    real issues and could capture more at a lower threshold.
                  </li>
                  <li>
                    <strong>confirmed_support_present:</strong> Moderate sensitivity increase.
                    Some confirmed-case evidence exists but support is not yet overwhelming.
                  </li>
                  <li>
                    <strong>insufficient_support_no_change:</strong> Hold current threshold.
                    Not enough labeled outcomes exist to justify a change in either direction.
                  </li>
                  <li>
                    <strong>no_material_change:</strong> Calculated adjustment is too small to
                    matter. The current threshold is close enough to optimal that adjustment
                    would produce negligible impact.
                  </li>
                </ul>
              </SectionBox>
            </MethodologySection>

            {/* ── 11. Further Reading ─────────────────────────────────── */}

            <MethodologySection
              id="methodology-references"
              icon={BookOpen}
              title="Standards and References"
              subtitle="Professional standards, regulatory frameworks, and academic foundations"
              accentClass="border-gray-200"
            >
              <SectionBox label="Professional standards" tone="gray">
                <ul className="space-y-1.5 text-xs text-gray-700">
                  <li>
                    <strong>ACFE Fraud Examiners Manual</strong> &mdash; The detector library
                    draws on the Association of Certified Fraud Examiners&rsquo; taxonomy of
                    occupational fraud and abuse, including the Fraud Tree classification
                    system and the Fraud Triangle framework.
                  </li>
                  <li>
                    <strong>GAGAS / Yellow Book</strong> &mdash; Government Auditing Standards
                    issued by the U.S. Government Accountability Office provide the
                    evidentiary standards and reporting frameworks that inform how findings
                    are classified and presented.
                  </li>
                  <li>
                    <strong>OMB Uniform Guidance (2 CFR 200)</strong> &mdash; Federal cost
                    principles for grants to state and local governments define which expenses
                    are allowable, allocable, and reasonable. The ineligible-expense detector
                    (NP2) directly encodes these prohibitions.
                  </li>
                  <li>
                    <strong>California Business &amp; Professions Code &sect;12580+</strong>
                    &mdash; State charity registration requirements enforced by the Attorney
                    General. The NP4 detector cross-references this registry.
                  </li>
                </ul>
              </SectionBox>

              <SectionBox label="Statistical foundations" tone="indigo">
                <ul className="space-y-1.5 text-xs text-indigo-900">
                  <li>
                    <strong>Benford, F. (1938). &ldquo;The Law of Anomalous Numbers.&rdquo;</strong>
                    &mdash; Proceedings of the American Philosophical Society, 78(4), 551&ndash;572.
                    The original paper describing the digit-frequency distribution used in
                    detectors D3 and D5.
                  </li>
                  <li>
                    <strong>Nigrini, M. (2012). <em>Benford&rsquo;s Law: Applications for
                    Forensic Accounting, Auditing, and Fraud Detection.</em></strong> &mdash;
                    Wiley. The definitive practitioner reference for applying digit analysis
                    in fraud detection, including chi-square testing methodology.
                  </li>
                  <li>
                    <strong>Cressey, D. (1953). <em>Other People&rsquo;s Money.</em></strong>
                    &mdash; The foundational work defining the Fraud Triangle (opportunity,
                    pressure, rationalization) used in the convergence meta-detector.
                  </li>
                  <li>
                    <strong>Relative Size Factor</strong> &mdash; Documented in Nigrini&rsquo;s
                    work and in ACFE forensic data analytics guidance as a standard test for
                    identifying outlier transactions.
                  </li>
                </ul>
              </SectionBox>

              <SectionBox label="Key investigative reports" tone="slate">
                <ul className="space-y-1.5 text-xs text-slate-800">
                  <li>
                    SF Controller&rsquo;s Office &mdash; SFPD Overtime Audit (documenting $108M
                    in structural overtime issues)
                  </li>
                  <li>
                    SF Controller&rsquo;s Office &mdash; Work Order Fund Audit, April 2025
                    ($332M in idle work-order funds)
                  </li>
                  <li>
                    SF Ethics Commission &mdash; Behested Payment Disclosure Reports (Form 3620)
                  </li>
                  <li>
                    California Attorney General &mdash; Charity Registration Database
                    (may_operate / may_not_operate classifications)
                  </li>
                  <li>
                    U.S. GAO &mdash; Framework for Managing Fraud Risks in Federal Programs
                    (GAO-15-593SP)
                  </li>
                </ul>
              </SectionBox>
            </MethodologySection>

          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
