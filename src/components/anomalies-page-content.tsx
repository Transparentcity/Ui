"use client"

import { useAnomalies } from "@/lib/hooks/useAnomalies"
import { mapApiAnomaliesToCrm } from "@/lib/anomalyMapper"
import type { Keyword } from "@/lib/types"
import { DashboardShell } from "@/components/dashboard-shell"
import { AnomaliesManager } from "@/components/anomalies-manager"
import { AnomalyDialog } from "@/components/anomaly-dialog"
import { AnomalyBulkPaste } from "@/components/anomaly-bulk-paste"
import { Button } from "@/components/ui/button"
import { Plus, ClipboardPaste } from "lucide-react"

interface AnomaliesPageContentProps {
  keywords: Keyword[]
}

// San Francisco city_id - TODO: make this configurable
const SF_CITY_ID = 57260;

export function AnomaliesPageContent({ keywords }: AnomaliesPageContentProps) {
  // Backend enforces max limit of 200
  const { data, isLoading, error } = useAnomalies({
    is_anomaly: true,
    limit: 200,
    city_id: SF_CITY_ID,
  })

  const apiResults = data?.results ?? []
  const anomaliesWithKeywords = mapApiAnomaliesToCrm(apiResults).map((a) => ({
    ...a,
    keywords: [] as Keyword[],
  }))

  return (
    <DashboardShell
      title="Anomalies"
      description="Track data anomalies and send relevant updates to government officials"
      actions={
        <div className="flex items-center gap-2">
          <AnomalyBulkPaste>
            <Button variant="outline">
              <ClipboardPaste className="w-4 h-4 mr-2" />
              Bulk Paste
            </Button>
          </AnomalyBulkPaste>
          <AnomalyDialog keywords={keywords}>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Anomaly
            </Button>
          </AnomalyDialog>
        </div>
      }
    >
      {error && (
        <p className="text-destructive text-sm mb-4">
          Failed to load anomalies: {error instanceof Error ? error.message : String(error)}
        </p>
      )}
      {isLoading ? (
        <p className="text-muted-foreground">Loading anomalies…</p>
      ) : (
        <AnomaliesManager anomalies={anomaliesWithKeywords} keywords={keywords} />
      )}
    </DashboardShell>
  )
}
