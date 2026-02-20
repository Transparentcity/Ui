import { CityReadinessShell } from "@/components/cityreadiness-shell"
import { SchemaMatchContent } from "@/components/cityreadiness/schema-match-content"

export const metadata = {
  title: "City Readiness | Transparent.city",
  description: "Rank cities by open-data coverage, inspect schemas, and identify FOIA gaps",
}

export default function CityReadinessPage() {
  return (
    <CityReadinessShell
      title="City Readiness Dashboard"
      description="Rank cities by open-data completeness, verify schema matches, and identify gaps for refinement or FOIA."
    >
      <SchemaMatchContent />
    </CityReadinessShell>
  )
}
