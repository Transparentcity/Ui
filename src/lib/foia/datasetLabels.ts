const DATASET_LABELS: Record<string, string> = {
  police_incidents: "Police Incidents",
  use_of_force: "Use of Force",
  officer_complaints: "Officer Complaints",
  arrest_records: "Arrest Records",
  budget_expenditures: "Budget Expenditures",
  building_permits: "Building Permits",
  traffic_stops: "Traffic Stops",
  jail_bookings: "Jail Bookings",
  court_records: "Court Records",
  "911_calls": "911 Calls",
}

/** Return a human-readable label for a dataset type ID. */
export function datasetLabel(id: string | null | undefined): string {
  if (!id) return "Unknown"
  if (DATASET_LABELS[id]) return DATASET_LABELS[id]
  // Fallback: snake_case → Title Case
  return id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
