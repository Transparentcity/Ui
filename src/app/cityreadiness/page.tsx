import { CityReadinessShell } from "@/components/cityreadiness-shell"
import { ReadinessContent } from "@/components/foia/readiness-content"

export const metadata = {
  title: "City Readiness | Transparent.city",
  description: "Rank cities by open-data coverage and identify FOIA gaps",
}

export default function CityReadinessPage() {
  return (
    <CityReadinessShell
      title="City Readiness"
      description="Rank cities by open-data coverage (Core 7 vs Expanded Dashboard) and click through missing items to guide portal search and FOIA."
    >
      <ReadinessContent backHref="/dashboard" backLabel="Back to Main App" />
    </CityReadinessShell>
  )
}

