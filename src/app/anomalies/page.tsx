import { DashboardShell } from "@/components/dashboard-shell"
import { AnomaliesPageContent } from "@/components/anomalies-page-content"

/**
 * Anomalies page: data comes from TransparentCity Platform API (listAnomalies).
 * Keywords for tagging are not available from Platform; pass empty.
 */
export default function AnomaliesPage() {
  return (
    <AnomaliesPageContent keywords={[]} />
  )
}
