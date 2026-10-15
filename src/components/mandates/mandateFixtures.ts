import type {
  MandateCompliance,
  MandatePeriodStatus,
  MandateStandard,
  PublicCityMandate,
} from "@/lib/publicApiClient";

/** Test fixtures shaped like GET /api/public/cities/{id}/mandates. */

export const NOW = new Date("2026-08-15T00:00:00Z");

export function monthlyPeriods(
  statuses: MandatePeriodStatus["status"][],
  lastMonth = "2026-06"
): MandatePeriodStatus[] {
  const [y, m] = lastMonth.split("-").map(Number);
  return statuses.map((status, i) => {
    const offset = statuses.length - 1 - i;
    const d = new Date(Date.UTC(y, m - 1 - offset, 1));
    return {
      period: d.toISOString().slice(0, 10),
      value: status === "no_data" ? null : status === "met" ? 92 : 75,
      status,
    };
  });
}

export const standard911: MandateStandard = {
  operator: ">=",
  target: 90,
  unit: "%",
  grain: "month",
  text: "At least 90% of 911 calls answered within 15 seconds",
  citation: "Warren-911-Emergency Assistance Act, Gov. Code 53100–53121",
  mandate_id: "SF-26",
  title: "911 calls answered within 15 seconds",
  area: "Public safety and emergency response",
  owner_department: "Dept of Emergency Management",
  owner_official: "Robert Smuts, Deputy Director",
  owner_contact: "performance.con@sfgov.org",
  report_name: "911 Call Volume and Response",
  report_url: "https://www.sf.gov/data--911-call-volume-and-response",
  sanctions: "Cal OES can withhold state 911 funding.",
  sanction_severity: "Medium",
  past_enforcement: "No withholding of state 911 funds found.",
  method_note: "Monthly share of emergency calls answered within 15 seconds.",
};

export function compliance(
  statuses: MandatePeriodStatus["status"][],
  overrides: Partial<MandateCompliance> = {}
): MandateCompliance {
  const periods = monthlyPeriods(statuses);
  const latest = periods[periods.length - 1];
  let streak = 0;
  for (let i = periods.length - 1; i >= 0; i--) {
    if (periods[i].status !== latest?.status || periods[i].status === "no_data") break;
    streak++;
  }
  const recent = periods.slice(-12).filter((p) => p.status === "met" || p.status === "missed");
  return {
    latest_period: latest?.period ?? null,
    latest_value: latest?.value ?? null,
    latest_status: latest?.status ?? "no_data",
    streak_status: latest?.status ?? "no_data",
    streak_length: streak,
    met_count_recent: recent.filter((p) => p.status === "met").length,
    evaluated_count_recent: recent.length,
    last_met_period: null,
    last_missed_period: null,
    periods,
    ...overrides,
  };
}

export function mandate(
  c: MandateCompliance,
  overrides: Partial<PublicCityMandate> = {}
): PublicCityMandate {
  return {
    metric_id: 1,
    metric_key: "sf_mandate_911_answer_15s",
    metric_name: "911 answered within 15s",
    most_recent_data_date: c.latest_period,
    standard: standard911,
    compliance: c,
    ...overrides,
  };
}
