// Pension-spiking departures report (client-side, queries Socrata directly).
//
// Identifies public employees who had an out-of-norm, overtime/other-pay-driven
// pay spike in a "spike year" and then LEFT payroll (absent every following
// year) — the confirmed pension-spiking pattern. It mirrors the backend D3b
// detector (detect_pension_departures) but emits one row per named person and
// projects the future pension cost.
//
// Runs entirely in the browser against the city's open-data payroll dataset, so
// it needs no new backend endpoint.

export type PensionDriver = "overtime" | "other";

export interface PensionDeparture {
  name: string;
  department: string;
  job: string;
  driver: PensionDriver;
  spikeYear: number;
  baselineAvg: number;
  finalSalary: number;
  spikePct: number;
  excess: number; // one-time overpayment in the spike year vs baseline
  fyOt: number; // overtime in the spike year
  fyOther: number; // other pay in the spike year
  annualPensionBoost: number; // permanent annual pension increase from the spike
  projectedFutureCost: number; // annualPensionBoost x retirementYears
}

export interface PensionParams {
  spikePctThreshold: number; // > this % over baseline (default 20)
  minFinalSalary: number; // spike-year total salary floor (default 100k)
  minBaselineSalary: number; // baseline floor, cuts part-time noise (default 50k)
  pensionAccrualRate: number; // fraction of final salary paid as annual pension (default 0.40)
  retirementYears: number; // years the inflated pension is drawn (default 20)
}

export const DEFAULT_PENSION_PARAMS: PensionParams = {
  spikePctThreshold: 20,
  minFinalSalary: 100_000,
  minBaselineSalary: 50_000,
  pensionAccrualRate: 0.4,
  retirementYears: 20,
};

export interface PensionDeparturesResult {
  citySlug: string;
  yearType: "Fiscal";
  mode: "single" | "range";
  spikeYears: number[];
  confirmThroughYear: number;
  dataAsOf: string | null;
  params: PensionParams;
  people: PensionDeparture[];
  totals: {
    count: number;
    otDrivenCount: number;
    otherDrivenCount: number;
    totalExcess: number;
    totalAnnualPensionBoost: number;
    totalProjectedFutureCost: number;
  };
  // Cumulative projected pension cost N years out (1..retirementYears).
  projection: { yearsOut: number; cumulativeCost: number }[];
  ranAt: string; // ISO timestamp
}

export interface PensionCityDataset {
  slug: string;
  label: string;
  supported: boolean;
  domain?: string;
  dataset?: string;
  reason?: string; // why unsupported
}

// Per-city open-data payroll config. Only datasets with multi-year, per-person,
// overtime-carrying rows can support this analysis.
export const PENSION_CITY_DATASETS: Record<string, PensionCityDataset> = {
  "san-francisco": {
    slug: "san-francisco",
    label: "San Francisco",
    supported: true,
    domain: "data.sfgov.org",
    dataset: "88g8-5mnd",
  },
  "new-york-city": {
    slug: "new-york-city",
    label: "New York City",
    supported: false,
    reason:
      "NYC Citywide Payroll uses a different schema (separate name and pay fields) — not yet wired for this report.",
  },
  chicago: {
    slug: "chicago",
    label: "Chicago",
    supported: false,
    reason:
      "Chicago's payroll open data is a current-year snapshot with no overtime history, so year-over-year departures can't be detected.",
  },
};

export function getPensionCityDataset(citySlug: string): PensionCityDataset {
  return (
    PENSION_CITY_DATASETS[citySlug] ?? {
      slug: citySlug,
      label: citySlug,
      supported: false,
      reason: "No payroll open-data source configured for this city.",
    }
  );
}

// The waste UI identifies cities by numeric id (WasteCityContext). Map those to
// the pension-report slugs. Mirrors the id sets in waste-finding-card.tsx.
const SF_CITY_IDS = new Set([1, 2, 56837]);
const CHICAGO_CITY_IDS = new Set([3, 56838]);

export function citySlugFromId(cityId: number | null | undefined): string {
  if (cityId != null && CHICAGO_CITY_IDS.has(cityId)) return "chicago";
  if (cityId != null && SF_CITY_IDS.has(cityId)) return "san-francisco";
  if (cityId == null) return "san-francisco";
  return `city-${cityId}`; // unknown → resolves to an unsupported dataset
}

export class PensionReportError extends Error {}

interface RawRow {
  year?: string;
  employee_identifier?: string;
  salaries?: string;
  overtime?: string;
  other_salaries?: string;
  department?: string;
  job?: string;
  data_as_of?: string;
}

interface EmpYear {
  sal: number;
  ot: number;
  oth: number;
  department: string;
  job: string;
}

const SF_SELECT =
  "year,employee_identifier,salaries,overtime,other_salaries,department,job,data_as_of";
const PAGE = 50_000;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

async function fetchYear(
  cfg: PensionCityDataset,
  year: number,
  doFetch: FetchLike,
): Promise<RawRow[]> {
  const rows: RawRow[] = [];
  let offset = 0;
  // Guard against runaway paging.
  for (let page = 0; page < 20; page++) {
    const where = `year='${year}' AND year_type='Fiscal'`;
    const url =
      `https://${cfg.domain}/resource/${cfg.dataset}.json` +
      `?$select=${encodeURIComponent(SF_SELECT)}` +
      `&$where=${encodeURIComponent(where)}` +
      `&$limit=${PAGE}&$offset=${offset}`;
    const res = await doFetch(url);
    if (!res.ok) {
      throw new PensionReportError(
        `Socrata request failed for FY${year} (HTTP ${res.status}).`,
      );
    }
    const batch = (await res.json()) as RawRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

// Aggregate one row per (employee, year): SF has one row per JOB, so a person
// with concurrent positions has several rows that must be summed.
function aggregate(rows: RawRow[]): Map<string, EmpYear> {
  const byEmp = new Map<string, EmpYear>();
  // sort desc by total salary so the top-paying row's dept/job wins as the label
  const sorted = [...rows].sort(
    (a, b) =>
      num(b.salaries) + num(b.overtime) + num(b.other_salaries) -
      (num(a.salaries) + num(a.overtime) + num(a.other_salaries)),
  );
  for (const r of sorted) {
    const name = (r.employee_identifier ?? "").trim();
    if (!name) continue;
    const cur = byEmp.get(name);
    if (cur) {
      cur.sal += num(r.salaries);
      cur.ot += num(r.overtime);
      cur.oth += num(r.other_salaries);
    } else {
      byEmp.set(name, {
        sal: num(r.salaries),
        ot: num(r.overtime),
        oth: num(r.other_salaries),
        department: r.department ?? "",
        job: r.job ?? "",
      });
    }
  }
  return byEmp;
}

const totalSalary = (e: EmpYear): number => e.sal + e.ot + e.oth;

export interface RunOptions {
  mode: "single" | "range";
  spikeYear?: number; // for single
  rangeStart?: number; // for range
  rangeEnd?: number; // for range
  params?: Partial<PensionParams>;
  fetchImpl?: FetchLike; // injectable for tests
  nowIso?: string; // injectable for tests
}

/**
 * Run the pension-spiking departures analysis for a city. Fetches the needed
 * fiscal years from the city's open-data portal and returns named departures
 * plus projected future pension cost.
 */
export async function runPensionDepartures(
  citySlug: string,
  opts: RunOptions,
): Promise<PensionDeparturesResult> {
  const cfg = getPensionCityDataset(citySlug);
  if (!cfg.supported) {
    throw new PensionReportError(cfg.reason ?? "City not supported.");
  }
  const params: PensionParams = { ...DEFAULT_PENSION_PARAMS, ...(opts.params ?? {}) };
  // A Response is structurally compatible with FetchLike's return (ok/status/json).
  const doFetch: FetchLike = opts.fetchImpl ?? ((url) => fetch(url));

  const spikeYears: number[] =
    opts.mode === "single"
      ? [requireYear(opts.spikeYear, "spikeYear")]
      : rangeInclusive(
          requireYear(opts.rangeStart, "rangeStart"),
          requireYear(opts.rangeEnd, "rangeEnd"),
        );
  if (spikeYears.length === 0) {
    throw new PensionReportError("No spike years selected.");
  }

  const minSpike = Math.min(...spikeYears);
  const maxSpike = Math.max(...spikeYears);
  // Need baselines (spike - 2) and at least one confirmation year (spike + 1).
  const firstYear = minSpike - 2;
  const confirmThroughYear = maxSpike + 1;

  // Fetch every needed fiscal year once.
  const yearData = new Map<number, Map<string, EmpYear>>();
  let dataAsOf: string | null = null;
  const rawByYear = new Map<number, RawRow[]>();
  for (let y = firstYear; y <= confirmThroughYear; y++) {
    const rows = await fetchYear(cfg, y, doFetch);
    rawByYear.set(y, rows);
    yearData.set(y, aggregate(rows));
    if (dataAsOf == null) {
      const withStamp = rows.find((r) => r.data_as_of);
      if (withStamp?.data_as_of) dataAsOf = withStamp.data_as_of;
    }
  }
  const yearsWithData = [...yearData.keys()].filter(
    (y) => (yearData.get(y)?.size ?? 0) > 0,
  );
  const latestYearWithData =
    yearsWithData.length > 0 ? Math.max(...yearsWithData) : confirmThroughYear;

  // Presence set per year (names present that year).
  const presence = new Map<number, Set<string>>();
  for (const [y, emp] of yearData) presence.set(y, new Set(emp.keys()));

  const seen = new Set<string>();
  const people: PensionDeparture[] = [];

  for (const Y of spikeYears) {
    const spikeEmp = yearData.get(Y);
    if (!spikeEmp) continue;
    const baseYears = [Y - 2, Y - 1];
    if (!baseYears.every((by) => yearData.has(by))) continue;
    // Years after the spike year that we actually have data for.
    const laterYears: number[] = [];
    for (let y = Y + 1; y <= latestYearWithData; y++) {
      if (presence.has(y)) laterYears.push(y);
    }
    if (laterYears.length === 0) continue; // cannot confirm departure

    for (const [name, s] of spikeEmp) {
      if (seen.has(name)) continue;
      // Must have a stable baseline in every baseline year.
      const baseRows = baseYears.map((by) => yearData.get(by)!.get(name));
      if (baseRows.some((r) => r === undefined)) continue;
      // Must be absent in EVERY later year we have — a true, permanent departure.
      if (laterYears.some((y) => presence.get(y)!.has(name))) continue;

      const final = totalSalary(s);
      const baseTotals = (baseRows as EmpYear[]).map(totalSalary);
      const baselineAvg = baseTotals.reduce((a, b) => a + b, 0) / baseTotals.length;
      if (final < params.minFinalSalary || baselineAvg < params.minBaselineSalary) {
        continue;
      }
      const spikePct = ((final - baselineAvg) / baselineAvg) * 100;
      if (spikePct <= params.spikePctThreshold) continue;

      const base = (getter: (e: EmpYear) => number) =>
        (baseRows as EmpYear[]).reduce((a, e) => a + getter(e), 0) / baseRows.length;
      const otChange = s.ot - base((e) => e.ot);
      const othChange = s.oth - base((e) => e.oth);
      const salChange = s.sal - base((e) => e.sal);
      if (!(otChange + othChange > salChange)) continue; // base-salary raise, not spiking

      const excess = final - baselineAvg;
      const annualPensionBoost = excess * params.pensionAccrualRate;
      seen.add(name);
      people.push({
        name,
        department: s.department,
        job: s.job,
        driver: otChange >= othChange ? "overtime" : "other",
        spikeYear: Y,
        baselineAvg,
        finalSalary: final,
        spikePct,
        excess,
        fyOt: s.ot,
        fyOther: s.oth,
        annualPensionBoost,
        projectedFutureCost: annualPensionBoost * params.retirementYears,
      });
    }
  }

  people.sort((a, b) => b.excess - a.excess);

  const totalExcess = people.reduce((a, p) => a + p.excess, 0);
  const totalAnnualPensionBoost = people.reduce((a, p) => a + p.annualPensionBoost, 0);
  const totalProjectedFutureCost = people.reduce((a, p) => a + p.projectedFutureCost, 0);
  const projection = Array.from({ length: params.retirementYears }, (_, i) => ({
    yearsOut: i + 1,
    cumulativeCost: totalAnnualPensionBoost * (i + 1),
  }));

  return {
    citySlug,
    yearType: "Fiscal",
    mode: opts.mode,
    spikeYears,
    confirmThroughYear: Math.min(confirmThroughYear, latestYearWithData),
    dataAsOf,
    params,
    people,
    totals: {
      count: people.length,
      otDrivenCount: people.filter((p) => p.driver === "overtime").length,
      otherDrivenCount: people.filter((p) => p.driver === "other").length,
      totalExcess,
      totalAnnualPensionBoost,
      totalProjectedFutureCost,
    },
    projection,
    ranAt: opts.nowIso ?? new Date().toISOString(),
  };
}

function requireYear(y: number | undefined, field: string): number {
  if (typeof y !== "number" || !Number.isInteger(y)) {
    throw new PensionReportError(`Missing or invalid ${field}.`);
  }
  return y;
}

function rangeInclusive(start: number, end: number): number[] {
  if (end < start) return [];
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
