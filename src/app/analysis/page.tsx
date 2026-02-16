import { DashboardShell } from "@/components/dashboard-shell"
import { AuditorAnalysisReport } from "@/components/analysis/auditor-analysis-report"

export default function AnalysisPage() {
  return (
    <DashboardShell
      title="Analysis"
      description="Auditor-ready sub-area investigations, findings rationale, and exportable reports."
    >
      <AuditorAnalysisReport />
    </DashboardShell>
  )
}
