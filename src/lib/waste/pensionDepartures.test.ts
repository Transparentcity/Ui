import { describe, it, expect } from "vitest";
import {
  runPensionDepartures,
  PensionReportError,
  getPensionCityDataset,
  type RunOptions,
} from "./pensionDepartures";

type Row = {
  year: string;
  employee_identifier: string;
  salaries: number;
  overtime: number;
  other_salaries: number;
  department?: string;
  job?: string;
};

function row(
  year: number,
  name: string,
  sal: number,
  ot: number,
  oth: number,
  department = "Public Health",
  job = "Nurse",
): Row {
  return {
    year: String(year),
    employee_identifier: name,
    salaries: sal,
    overtime: ot,
    other_salaries: oth,
    department,
    job,
  };
}

// Fake Socrata: parse the fiscal year out of the $where clause and return the
// matching rows. encodeURIComponent leaves the apostrophe intact, so the URL
// contains `year%3D'YYYY'`.
function fakeFetch(rowsByYear: Record<number, Row[]>) {
  return async (url: string) => {
    const m = url.match(/year%3D'(\d+)'/);
    const year = m ? Number(m[1]) : NaN;
    const data = rowsByYear[year] ?? [];
    return {
      ok: true,
      status: 200,
      json: async () => data.map((r) => ({ ...r, data_as_of: "2026-07-05T00:00:00.000" })),
    };
  };
}

function run(rowsByYear: Record<number, Row[]>, opts: Partial<RunOptions> = {}) {
  return runPensionDepartures("san-francisco", {
    mode: "single",
    spikeYear: 2024,
    fetchImpl: fakeFetch(rowsByYear),
    nowIso: "2026-07-11T00:00:00.000Z",
    ...opts,
  });
}

// A stable 2-yr baseline of ~120k total salary.
const baseline = (year: number, name: string) => row(year, name, 100_000, 15_000, 5_000);
// An OT-driven spike to 260k total.
const otSpike = (year: number, name: string) => row(year, name, 105_000, 120_000, 35_000);

describe("runPensionDepartures", () => {
  it("confirms and names an overtime-driven departed spiker", async () => {
    const res = await run({
      2022: [baseline(2022, "Jane Doe")],
      2023: [baseline(2023, "Jane Doe")],
      2024: [otSpike(2024, "Jane Doe")],
      2025: [row(2025, "Al Roe", 95_000, 0, 0)], // Jane gone; year populated
    });
    expect(res.people).toHaveLength(1);
    const p = res.people[0];
    expect(p.name).toBe("Jane Doe");
    expect(p.driver).toBe("overtime");
    expect(p.spikeYear).toBe(2024);
    expect(Math.round(p.excess)).toBe(140_000);
    // 140k excess * 0.40 accrual * 20 yrs = 1.12M projected future cost
    expect(Math.round(p.projectedFutureCost)).toBe(1_120_000);
    expect(res.totals.otDrivenCount).toBe(1);
    expect(Math.round(res.totals.totalProjectedFutureCost)).toBe(1_120_000);
    // projection curve ends at the same cumulative total
    expect(Math.round(res.projection.at(-1)!.cumulativeCost)).toBe(1_120_000);
    expect(res.projection).toHaveLength(20);
  });

  it("does not confirm when the employee is still on payroll", async () => {
    const res = await run({
      2022: [baseline(2022, "Jane Doe")],
      2023: [baseline(2023, "Jane Doe")],
      2024: [otSpike(2024, "Jane Doe")],
      2025: [row(2025, "Jane Doe", 100_000, 5_000, 0)], // still present
    });
    expect(res.people).toHaveLength(0);
  });

  it("ignores a base-salary raise (not OT/other driven)", async () => {
    const res = await run({
      2022: [baseline(2022, "Jane Doe")],
      2023: [baseline(2023, "Jane Doe")],
      2024: [row(2024, "Jane Doe", 245_000, 10_000, 5_000)], // driven by base
      2025: [row(2025, "Al Roe", 95_000, 0, 0)],
    });
    expect(res.people).toHaveLength(0);
  });

  it("drops low-paid noise below the final-salary floor", async () => {
    const res = await run({
      2022: [row(2022, "Jane Doe", 50_000, 8_000, 2_000)], // 60k baseline
      2023: [row(2023, "Jane Doe", 50_000, 8_000, 2_000)],
      2024: [row(2024, "Jane Doe", 55_000, 35_000, 5_000)], // 95k final < 100k floor
      2025: [row(2025, "Al Roe", 95_000, 0, 0)],
    });
    expect(res.people).toHaveLength(0);
  });

  it("classifies a terminal-payout spike as other-pay driven", async () => {
    const res = await run({
      2022: [row(2022, "Wendi Boselli", 240_000, 0, 0)],
      2023: [row(2023, "Wendi Boselli", 240_000, 0, 0)],
      2024: [row(2024, "Wendi Boselli", 240_000, 0, 130_000)], // lump-sum other pay
      2025: [row(2025, "Al Roe", 95_000, 0, 0)],
    });
    expect(res.people).toHaveLength(1);
    expect(res.people[0].driver).toBe("other");
    expect(res.totals.otherDrivenCount).toBe(1);
  });

  it("range mode sweeps multiple transitions", async () => {
    const res = await run(
      {
        2021: [baseline(2021, "John Roe")],
        2022: [baseline(2022, "John Roe"), baseline(2022, "Jane Doe")],
        2023: [otSpike(2023, "John Roe"), baseline(2023, "Jane Doe")],
        2024: [otSpike(2024, "Jane Doe")], // John gone after 2023
        2025: [row(2025, "Al Roe", 95_000, 0, 0)], // Jane gone after 2024
      },
      { mode: "range", rangeStart: 2023, rangeEnd: 2024, spikeYear: undefined },
    );
    const names = res.people.map((p) => p.name).sort();
    expect(names).toEqual(["Jane Doe", "John Roe"]);
    expect(res.spikeYears).toEqual([2023, 2024]);
  });

  it("throws for an unsupported city", async () => {
    await expect(
      runPensionDepartures("chicago", { mode: "single", spikeYear: 2024, fetchImpl: fakeFetch({}) }),
    ).rejects.toBeInstanceOf(PensionReportError);
  });
});

describe("getPensionCityDataset", () => {
  it("marks SF supported and Chicago unsupported with a reason", () => {
    expect(getPensionCityDataset("san-francisco").supported).toBe(true);
    const chi = getPensionCityDataset("chicago");
    expect(chi.supported).toBe(false);
    expect(chi.reason).toMatch(/snapshot/i);
  });
});
