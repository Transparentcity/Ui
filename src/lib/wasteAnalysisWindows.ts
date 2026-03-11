import type {
  WasteAnalyzeResponse,
  WasteCategorySummary,
  WasteFinding,
  WasteSummaryResponse,
} from "@/lib/apiClient"

export const FORENSICS_FISCAL_YEAR_FLOOR = 2016

export function getOperationsFiscalYearFloor(now: Date = new Date()): number {
  return now.getFullYear() - 1
}

export function isFullWasteRunCategory(category?: string | null): boolean {
  const normalized = String(category ?? "").trim().toLowerCase()
  return (
    normalized.length === 0 ||
    normalized === "all" ||
    normalized === "all categories"
  )
}

export function filterWasteFindingsByFiscalYear(
  findings: WasteFinding[],
  minFiscalYear?: number
): WasteFinding[] {
  if (!minFiscalYear) return findings
  return findings.filter(
    (finding) =>
      finding.fiscal_year == null || finding.fiscal_year >= minFiscalYear
  )
}

function getPositiveAmount(
  finding: Pick<WasteFinding, "estimated_dollar_impact" | "amount">
): number | null {
  const value = finding.estimated_dollar_impact ?? finding.amount ?? null
  return value != null && value > 0 ? value : null
}

export function buildWasteSummaryFromFindings(
  findings: WasteFinding[]
): WasteSummaryResponse {
  if (findings.length === 0) {
    return {
      total_findings: 0,
      critical_count: 0,
      estimated_exposure: null,
      gross_exposure: null,
      net_exposure: null,
      departments_affected: 0,
      categories: [],
    }
  }

  const departments = new Set<string>()
  const entityFiscalYearMax = new Map<string, number>()
  const categoryMap = new Map<
    string,
    {
      finding_count: number
      critical_count: number
      high_count: number
      medium_count: number
      total_amount: number | null
    }
  >()

  let criticalCount = 0
  let grossExposure = 0
  let hasAmounts = false

  for (const finding of findings) {
    if (finding.department) {
      departments.add(finding.department)
    }

    const category = String(finding.category || "Uncategorized")
    const summary = categoryMap.get(category) ?? {
      finding_count: 0,
      critical_count: 0,
      high_count: 0,
      medium_count: 0,
      total_amount: null,
    }

    summary.finding_count += 1

    const severity = String(finding.severity || "").toLowerCase()
    if (severity === "critical") {
      summary.critical_count += 1
      criticalCount += 1
    } else if (severity === "high") {
      summary.high_count += 1
    } else if (severity === "medium") {
      summary.medium_count += 1
    }

    const amount = getPositiveAmount(finding)
    if (amount != null) {
      summary.total_amount = (summary.total_amount ?? 0) + amount
      grossExposure += amount
      hasAmounts = true

      const entity = String(finding.entity || "Unknown").trim()
      const key = `${entity}::${finding.fiscal_year ?? "unknown"}`
      entityFiscalYearMax.set(key, Math.max(entityFiscalYearMax.get(key) ?? 0, amount))
    }

    categoryMap.set(category, summary)
  }

  const categories: WasteCategorySummary[] = [...categoryMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, summary]) => ({
      category,
      finding_count: summary.finding_count,
      critical_count: summary.critical_count,
      high_count: summary.high_count,
      medium_count: summary.medium_count,
      total_amount: summary.total_amount,
      records_analyzed: summary.finding_count,
    }))

  const netExposure = hasAmounts
    ? [...entityFiscalYearMax.values()].reduce((sum, amount) => sum + amount, 0)
    : null

  return {
    total_findings: findings.length,
    critical_count: criticalCount,
    estimated_exposure: netExposure,
    gross_exposure: hasAmounts ? grossExposure : null,
    net_exposure: netExposure,
    departments_affected: departments.size,
    categories,
  }
}

export function applyFiscalYearWindow(
  data: WasteAnalyzeResponse | null | undefined,
  minFiscalYear?: number
): WasteAnalyzeResponse | null {
  if (!data) return null
  if (!minFiscalYear) return data

  const findings = filterWasteFindingsByFiscalYear(data.findings ?? [], minFiscalYear)
  return {
    ...data,
    findings,
    summary: buildWasteSummaryFromFindings(findings),
  }
}
