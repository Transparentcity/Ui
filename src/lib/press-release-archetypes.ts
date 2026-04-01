/**
 * Press Release Archetypes — story templates for the press release pipeline.
 *
 * Each archetype maps to a Tier 1 story type from the TransparentCITY playbook.
 * When selected in AI Compose (press release mode), the archetype's context
 * is appended to the generation prompt to guide tone, angle, and structure.
 *
 * Style rules (from 6 iterations of testing):
 * - Single topic per release, never a data roundup
 * - Write like a reporter, not a platform feature tour
 * - Lead with the most surprising number
 * - Make it entertaining where the data supports it
 */

export interface PressReleaseArchetype {
  id: string
  name: string
  category: "civic_data" | "quality_of_life" | "economy" | "waste" | "fun"
  description: string
  dataset: string
  exampleHeadline: string
}

export const PRESS_RELEASE_ARCHETYPES: PressReleaseArchetype[] = [
  // ── Civic Data & Metrics ──────────────────────────────────────────────
  {
    id: "T1-26",
    name: "Small Business Survival Rates",
    category: "economy",
    description:
      "Net business formation (openings minus closures). Lead with the net number and the YoY swing. The driver (fewer closures vs. more openings) matters.",
    dataset: "Registered Business Locations (g8m3-pdis)",
    exampleHeadline:
      "San Francisco Gained 1,869 Net New Businesses in 2025. The Year Before, the Number Was 42.",
  },
  {
    id: "T1-24",
    name: "Construction Boom or Bust",
    category: "economy",
    description:
      "Building permit trends by type. The topline total often hides dramatic shifts in new construction vs demolitions vs alterations. Lead with the surprising mix shift, not the topline.",
    dataset: "Building Permits (i98e-djp9)",
    exampleHeadline:
      "New Construction Permits Jumped 159%. Demolitions Tripled. What's Going On?",
  },
  {
    id: "T1-14",
    name: "311 Response Equity Gap",
    category: "civic_data",
    description:
      "Service response time disparities across neighborhoods. Lead with the ratio (e.g., 2.8x) and name the neighborhoods. Include completion rates alongside wait times.",
    dataset: "311 Cases (vw6y-z8j6), response time analysis",
    exampleHeadline:
      "Bayview Residents Wait Nearly 3x Longer for Street Cleaning Than the Rest of San Francisco",
  },
  {
    id: "T1-18",
    name: "Response Time Deterioration",
    category: "civic_data",
    description:
      "Service category where closure/resolution rate collapsed YoY. Lead with the before/after rate and the backlog count. Works best when the service has safety implications.",
    dataset: "311 Cases (vw6y-z8j6), closure rate analysis",
    exampleHeadline:
      "Tree Maintenance Closure Rate Dropped From 90% to 55%. There Are Now 450+ Unresolved Safety Hazards.",
  },
  {
    id: "T1-02",
    name: "Highest-Paid City Employee",
    category: "civic_data",
    description:
      "Compensation ranking. The interesting part is usually where overtime transforms the picture, not the top earner by base salary.",
    dataset: "Employee Compensation (88g8-5mnd)",
    exampleHeadline:
      "3,654 City Employees Earned More Than $300,000. The Top Earner Made $868,728.",
  },
  {
    id: "T1-10",
    name: "Gender Pay Gap in City Government",
    category: "civic_data",
    description:
      "Compensation analysis by gender across job classifications. Compare within same roles, not just aggregate.",
    dataset: "Employee Compensation (88g8-5mnd)",
    exampleHeadline: "",
  },
  {
    id: "T1-09",
    name: "Contract Concentration",
    category: "civic_data",
    description:
      "Top contractors by share of spend. Contract drift (amendment creep without rebid) is the sharpest angle.",
    dataset: "Supplier Contracts (cqi5-hm2d) + Vendor Payments (n9pm-xkyq)",
    exampleHeadline:
      "A $500,000 City Contract Quietly Ballooned to $1.2 Million Without a New Competitive Bid",
  },
  {
    id: "T1-27",
    name: "Cross-City Comparison",
    category: "civic_data",
    description:
      "The story only TC can tell. Compare a single metric across cities using the same methodology. Requires launch data from multiple cities.",
    dataset: "All normalized datasets across cities",
    exampleHeadline: "",
  },

  // ── Quality of Life / 311 ─────────────────────────────────────────────
  {
    id: "T1-19",
    name: "Graffiti Hot Spots",
    category: "quality_of_life",
    description:
      "Graffiti complaint concentration by neighborhood. The paradox angle (mural capital = graffiti capital) works well for SF. Geographic concentration is the hook.",
    dataset: "311 Cases (vw6y-z8j6), service_name filter",
    exampleHeadline:
      "138,317 Graffiti Reports. One Neighborhood Accounts for a Quarter. It's the Same One Famous for Its Murals.",
  },
  {
    id: "T1-16",
    name: "Quality of Life (Single Category)",
    category: "quality_of_life",
    description:
      "Single 311 category deep dive: encampments, noise, illegal dumping, etc. Geographic concentration, volume in context of full 311 ranking. Acknowledge data limitations.",
    dataset: "311 Cases (vw6y-z8j6), category filter",
    exampleHeadline:
      "53,408 Encampment Reports. Three Neighborhoods Account for the Vast Majority.",
  },
  {
    id: "T1-13",
    name: "311 Volume Spikes / Behavioral Patterns",
    category: "quality_of_life",
    description:
      "Temporal patterns in complaint data. Day-of-week effects, seasonal spikes, holiday patterns. The Monday effect (33% more complaints) is the model for this type.",
    dataset: "311 Cases (vw6y-z8j6), time series",
    exampleHeadline:
      "San Franciscans File 33% More Complaints on Mondays Than Sundays. Every Single Week.",
  },
  {
    id: "T1-15",
    name: "Neighborhood Service Request Rankings",
    category: "quality_of_life",
    description:
      "District-level ranking by total complaint volume with each area's top complaint. Use neighborhood names, never district numbers. Pick the single most interesting gap.",
    dataset: "311 Cases (vw6y-z8j6)",
    exampleHeadline: "",
  },

  // ── Fun / Viral ───────────────────────────────────────────────────────
  {
    id: "T1-17",
    name: "The Rat Report Card",
    category: "fun",
    description:
      "Rodent/pest complaints by neighborhood. Always viral. Lead with the gross-out number. Map the infestation geography.",
    dataset: "311 Cases (vw6y-z8j6), rodent category filter",
    exampleHeadline: "",
  },
  {
    id: "T1-FUN-01",
    name: "Weirdest 311 Calls",
    category: "fun",
    description:
      "Filter 311 for unusual service categories. Peacocks on roofs, menacing lawn gnomes, etc. Pure entertainment value.",
    dataset: "311 Cases (vw6y-z8j6), unusual category filter",
    exampleHeadline: "",
  },
  {
    id: "T1-FUN-03",
    name: "Fireworks Complaint Map",
    category: "fun",
    description:
      "311 fireworks complaints spike around July 4th. Map the geographic spread. Seasonal story, time it for late June/early July.",
    dataset: "311 Cases (vw6y-z8j6), fireworks category + date filter",
    exampleHeadline: "",
  },

  // ── WASTE (cap at ~1/3 of releases per cycle) ────────────────────────
  {
    id: "T1-01",
    name: "The Overtime Kings",
    category: "waste",
    description:
      "Overtime outliers identified by peer-group Z-scores. Lead with the human absurdity (hours per day, days per week). The math should be viscerally impossible.",
    dataset: "Employee Compensation (88g8-5mnd)",
    exampleHeadline:
      "One Custodian Averaged 82 Hours a Week, All Year. That's 11.7 Hours a Day With No Days Off.",
  },
  {
    id: "T1-29",
    name: "Suspicious Vendor Patterns",
    category: "waste",
    description:
      "Ghost vendors, duplicate payments, residential addresses. Works best when anchored to a confirmed case with a narrative (a person did a thing).",
    dataset: "Vendor Payments (n9pm-xkyq) + Registered Businesses (g8m3-pdis)",
    exampleHeadline:
      "A Fake Illinois Company Billed San Francisco $627,000 Over 4.5 Years.",
  },
  {
    id: "T1-32",
    name: "The WASTE Report (Department Focus)",
    category: "waste",
    description:
      "Single department with converging signals: WASTE detection flags + public record (convictions, audits, whistleblower data). The department is the story, not the detectors.",
    dataset: "Employee Compensation + court records + Controller reports",
    exampleHeadline:
      "Building Inspection Has a Whistleblower Rate 5.5x the City Average. The Federal Convictions Explain Why.",
  },
  {
    id: "T1-31",
    name: "Pension Spiking Alert",
    category: "waste",
    description:
      "Employees whose comp spiked >50% in their final year driven by 'Other Pay' rather than base salary. Compare to 3-year trailing average.",
    dataset: "Employee Compensation (88g8-5mnd)",
    exampleHeadline: "",
  },
  {
    id: "T1-30",
    name: "Check Under the Threshold",
    category: "waste",
    description:
      "Split purchases structured to stay just below approval limits. Lead with the total and the number of splits on the same day.",
    dataset: "Vendor Payments (n9pm-xkyq)",
    exampleHeadline: "",
  },
]

/** Group archetypes by category for the UI dropdown. */
export const ARCHETYPE_CATEGORIES = [
  { key: "civic_data", label: "Civic Data & Metrics" },
  { key: "quality_of_life", label: "Quality of Life / 311" },
  { key: "economy", label: "Economy & Development" },
  { key: "fun", label: "Fun / Viral" },
  { key: "waste", label: "WASTE Detection" },
] as const

export function getArchetypeById(id: string): PressReleaseArchetype | undefined {
  return PRESS_RELEASE_ARCHETYPES.find((a) => a.id === id)
}
