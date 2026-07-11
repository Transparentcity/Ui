"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWasteCity } from "@/components/waste/WasteCityContext";
import {
  runPensionDepartures,
  getPensionCityDataset,
  citySlugFromId,
  DEFAULT_PENSION_PARAMS,
  PensionReportError,
  type PensionDeparturesResult,
  type PensionDeparture,
} from "@/lib/waste/pensionDepartures";

const CACHE_PREFIX = "waste:pension-departures:v1:";
const FIRST_SPIKE_YEAR = 2019;
const LAST_SPIKE_YEAR = 2024; // most recent year confirmable against the next year

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function loadLastRun(citySlug: string): PensionDeparturesResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + citySlug);
    return raw ? (JSON.parse(raw) as PensionDeparturesResult) : null;
  } catch {
    return null;
  }
}

function saveLastRun(citySlug: string, result: PensionDeparturesResult): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + citySlug, JSON.stringify(result));
  } catch {
    /* quota or serialization failure — non-fatal, the run still displays */
  }
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(result: PensionDeparturesResult): string {
  const header = [
    "name", "department", "job", "driver", "spike_year", "baseline_avg",
    "final_salary", "spike_pct", "excess", "fy_overtime", "fy_other",
    "annual_pension_boost", "projected_future_cost",
  ];
  const rows = result.people.map((p) =>
    [
      p.name, p.department, p.job, p.driver, p.spikeYear,
      Math.round(p.baselineAvg), Math.round(p.finalSalary), Math.round(p.spikePct),
      Math.round(p.excess), Math.round(p.fyOt), Math.round(p.fyOther),
      Math.round(p.annualPensionBoost), Math.round(p.projectedFutureCost),
    ].map(csvEscape).join(","),
  );
  return [header.join(","), ...rows].join("\r\n");
}

function download(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function DeparturesTable({ rows }: { rows: PensionDeparture[] }) {
  if (rows.length === 0) return <p className="text-sm text-gray-500">None.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Department</th>
            <th className="px-3 py-2 font-medium">Job</th>
            <th className="px-3 py-2 font-medium">FY</th>
            <th className="px-3 py-2 font-medium text-right">Baseline avg</th>
            <th className="px-3 py-2 font-medium text-right">Final salary</th>
            <th className="px-3 py-2 font-medium text-right">Spike</th>
            <th className="px-3 py-2 font-medium text-right">Excess</th>
            <th className="px-3 py-2 font-medium text-right">FY OT</th>
            <th className="px-3 py-2 font-medium text-right">FY other</th>
            <th className="px-3 py-2 font-medium text-right">Proj. pension cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((p, i) => (
            <tr key={`${p.name}-${p.spikeYear}-${i}`} className="text-gray-800">
              <td className="px-3 py-2 font-medium">{p.name}</td>
              <td className="px-3 py-2 text-gray-600">{p.department}</td>
              <td className="px-3 py-2 text-gray-600">{p.job}</td>
              <td className="px-3 py-2 text-gray-600">{p.spikeYear}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(p.baselineAvg)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(p.finalSalary)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-amber-700">
                +{Math.round(p.spikePct)}%
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{money(p.excess)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(p.fyOt)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(p.fyOther)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(p.projectedFutureCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({
  label, value, sub, emphasize,
}: { label: string; value: string; sub?: string; emphasize?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${emphasize ? "border-purple-200 bg-purple-50" : "border-gray-200 bg-gray-50"}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${emphasize ? "text-purple-800" : "text-gray-900"}`}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-gray-500">{sub}</div> : null}
    </div>
  );
}

export function PensionDeparturesPage() {
  const { selectedCityId, selectedCityName } = useWasteCity();
  const citySlug = citySlugFromId(selectedCityId);
  const dataset = getPensionCityDataset(citySlug);

  const [mode, setMode] = useState<"single" | "range">("single");
  const [spikeYear, setSpikeYear] = useState(LAST_SPIKE_YEAR);
  const [rangeStart, setRangeStart] = useState(FIRST_SPIKE_YEAR);
  const [rangeEnd, setRangeEnd] = useState(LAST_SPIKE_YEAR);
  const [accrualRate, setAccrualRate] = useState(DEFAULT_PENSION_PARAMS.pensionAccrualRate);
  const [retirementYears, setRetirementYears] = useState(DEFAULT_PENSION_PARAMS.retirementYears);

  const [result, setResult] = useState<PensionDeparturesResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the last run per city.
  useEffect(() => {
    setResult(loadLastRun(citySlug));
    setError(null);
  }, [citySlug]);

  const spikeYearOptions = useMemo(() => {
    const out: number[] = [];
    for (let y = LAST_SPIKE_YEAR; y >= FIRST_SPIKE_YEAR; y--) out.push(y);
    return out;
  }, []);

  async function onRun() {
    setRunning(true);
    setError(null);
    try {
      const res = await runPensionDepartures(citySlug, {
        mode,
        spikeYear,
        rangeStart,
        rangeEnd,
        params: { pensionAccrualRate: accrualRate, retirementYears },
      });
      setResult(res);
      saveLastRun(citySlug, res);
    } catch (e) {
      setError(e instanceof PensionReportError || e instanceof Error ? e.message : "Report failed.");
    } finally {
      setRunning(false);
    }
  }

  const t = result?.totals;
  const otRows = result?.people.filter((p) => p.driver === "overtime") ?? [];
  const otherRows = result?.people.filter((p) => p.driver === "other") ?? [];
  const projMilestones = result
    ? [5, 10, 15, retirementYears].filter((y, i, a) => a.indexOf(y) === i && y <= retirementYears)
    : [];

  return (
    <div className="px-8 py-6 space-y-6" data-testid="pension-departures-report">
      <Card className="p-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Pension-spiking departures
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Employees who had an out-of-norm, overtime/other-pay-driven pay spike and then
          left payroll — the confirmed pension-spiking pattern — for{" "}
          <span className="font-medium">{selectedCityName}</span>. Runs live against the
          city&apos;s payroll open data; the last run is kept per city.
        </p>

        {!dataset.supported ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Not available for {selectedCityName}: {dataset.reason} Switch the city (top bar) to
            one with multi-year payroll open data, e.g. San Francisco.
          </div>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Scope</label>
                <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setMode("single")}
                    className={`px-3 py-1.5 text-sm ${mode === "single" ? "bg-purple-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
                  >
                    Single year
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("range")}
                    className={`px-3 py-1.5 text-sm ${mode === "range" ? "bg-purple-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
                  >
                    Cumulative range
                  </button>
                </div>
              </div>

              {mode === "single" ? (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Spike year (FY)</label>
                  <select
                    value={spikeYear}
                    onChange={(e) => setSpikeYear(Number(e.target.value))}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  >
                    {spikeYearOptions.map((y) => (
                      <option key={y} value={y}>FY{y} → FY{y + 1}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">From FY</label>
                    <select
                      value={rangeStart}
                      onChange={(e) => setRangeStart(Number(e.target.value))}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                    >
                      {spikeYearOptions.slice().reverse().map((y) => (
                        <option key={y} value={y}>FY{y}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">To FY</label>
                    <select
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(Number(e.target.value))}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                    >
                      {spikeYearOptions.map((y) => (
                        <option key={y} value={y}>FY{y}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Accrual rate</label>
                <input
                  type="number" step="0.05" min="0.1" max="0.9"
                  value={accrualRate}
                  onChange={(e) => setAccrualRate(Number(e.target.value))}
                  className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  title="Fraction of final salary paid as annual pension (benefit factor × years of service)"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Retirement yrs</label>
                <input
                  type="number" step="1" min="1" max="40"
                  value={retirementYears}
                  onChange={(e) => setRetirementYears(Number(e.target.value))}
                  className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  title="Years the inflated pension is drawn"
                />
              </div>

              <Button size="sm" onClick={onRun} disabled={running}>
                {running ? "Running…" : "Run report"}
              </Button>
            </div>

            {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
          </>
        )}
      </Card>

      {result ? (
        <>
          <Card className="p-6">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-gray-900">
                {result.mode === "single"
                  ? `FY${result.spikeYears[0]} → FY${result.spikeYears[0] + 1}`
                  : `FY${result.spikeYears[0]}–FY${result.spikeYears.at(-1)}`}{" "}
                results
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">
                  Last run {new Date(result.ranAt).toLocaleString()}
                  {result.dataAsOf ? ` · data as of ${result.dataAsOf.slice(0, 10)}` : ""}
                </span>
                <Button
                  variant="outline" size="sm"
                  onClick={() =>
                    download(
                      `pension-departures-${result.citySlug}-${result.spikeYears[0]}${result.mode === "range" ? "-" + result.spikeYears.at(-1) : ""}.csv`,
                      "text/csv;charset=utf-8",
                      toCsv(result),
                    )
                  }
                >
                  Export CSV
                </Button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <Kpi label="People" value={String(t!.count)}
                sub={`${t!.otDrivenCount} overtime · ${t!.otherDrivenCount} other-pay`} />
              <Kpi label="One-time excess pay" value={money(t!.totalExcess)} />
              <Kpi label="Added annual pension" value={money(t!.totalAnnualPensionBoost)} />
              <Kpi label="Projected future cost"
                value={money(t!.totalProjectedFutureCost)}
                sub={`over ${result.params.retirementYears} yrs @ ${Math.round(result.params.pensionAccrualRate * 100)}% accrual`}
                emphasize />
            </div>

            <div className="mt-4 rounded-md bg-gray-50 border border-gray-200 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                Cumulative projected pension cost
              </div>
              <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-gray-700">
                {projMilestones.map((y) => (
                  <span key={y} className="tabular-nums">
                    <span className="text-gray-400">{y} yr:</span>{" "}
                    {money(t!.totalAnnualPensionBoost * y)}
                  </span>
                ))}
              </div>
            </div>
          </Card>

          <section>
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Overtime-driven — the core pattern ({otRows.length})
            </h3>
            <DeparturesTable rows={otRows} />
          </section>

          <section>
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Other-pay / likely terminal payout ({otherRows.length})
            </h3>
            <p className="text-sm text-gray-500 mb-2">
              Final-year jumps driven by other pay (usually a leave / comp-time cash-out at
              separation), which CalPERS/SFERS generally exclude from pensionable pay — weaker signals.
            </p>
            <DeparturesTable rows={otherRows} />
          </section>

          <p className="text-xs text-gray-400 leading-relaxed">
            Method: present every year FY{result.spikeYears[0] - 2}–FY{result.spikeYears.at(-1)} and
            absent every following year through FY{result.confirmThroughYear}; total salary
            (base + overtime + other) ≥ {money(result.params.minFinalSalary)} and &gt;
            {result.params.spikePctThreshold}% over the prior 2-year average, driven by
            overtime/other pay not a base raise. Departure = the name stops appearing on
            payroll (retirement, resignation, move, or death read the same); the identifier is
            a name, not a unique key. Projected cost is an illustration, not an actuarial estimate.
          </p>
        </>
      ) : dataset.supported && !running ? (
        <p className="px-1 text-sm text-gray-500">
          No saved run yet — choose a scope and press <span className="font-medium">Run report</span>.
        </p>
      ) : null}
    </div>
  );
}
