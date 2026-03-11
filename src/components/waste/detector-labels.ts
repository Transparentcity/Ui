export const DETECTOR_LABEL_OVERRIDES: Record<string, string> = {
  vendor_d10_contract_drift: "Contract drift",
  vendor_d9_ghost: "Ghost vendor",
  vendor_d8_split_pos: "Split purchase orders",
  vendor_d11_short_bids: "Short bid window",
  vendor_d19_sole_source: "Sole-source concentration",
  payroll_d1_ot_ratio: "Overtime ratio",
  payroll_d2_pareto: "Pay concentration",
  payroll_d6_hours: "Hours feasibility",
  integrity_rd1_revolving_door: "Revolving door",
  influence_d18_pay_to_play: "Pay-to-play overlap",
}

export const HARD_TRIGGER_PREFIXES = [
  "payroll_d6_",
  "vendor_d20_",
  "integrity_rd2_",
  "integrity_rd1_",
  "influence_d18_",
]

export function toTitleCase(text: string): string {
  return text
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function formatDetectorLabel(detectorKey?: string | null): string {
  const normalized = String(detectorKey || "").trim().toLowerCase()
  if (!normalized) return "Unknown detector"
  if (DETECTOR_LABEL_OVERRIDES[normalized]) {
    return DETECTOR_LABEL_OVERRIDES[normalized]
  }

  const withoutDomain = normalized.replace(
    /^(vendor|payroll|infrastructure|integrity|influence|nonprofit)_/,
    ""
  )
  const withoutIndex = withoutDomain
    .replace(/^(rd\d+|np\d+|d\d+[a-z]?|i\d+)_/, "")
    .replace(/_/g, " ")

  return toTitleCase(withoutIndex || normalized.replace(/_/g, " "))
}

export function detectorPolicy(detectorKey: string): "hard-trigger" | "corroborative" {
  const key = detectorKey.trim().toLowerCase()
  return HARD_TRIGGER_PREFIXES.some((prefix) => key.startsWith(prefix))
    ? "hard-trigger"
    : "corroborative"
}
