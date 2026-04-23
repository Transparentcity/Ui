import { DashboardShell } from "@/components/dashboard-shell"
import { AnomaliesPageContent } from "@/components/anomalies-page-content"

export default function AnomaliesPage() {
  return (
    <DashboardShell
      title="Content"
      description="Feed stories and anomalies for the selected city"
      cityAware
    >
      <AnomaliesPageContent keywords={[]} />
    </DashboardShell>
  )
}
