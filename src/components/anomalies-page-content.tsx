"use client"

import { useEffect, useMemo, useState } from "react"
import { useAnomaliesPublic } from "@/lib/hooks/useAnomaliesPublic"
import { mapApiAnomaliesToCrm } from "@/lib/anomalyMapper"
import type { Anomaly, Keyword } from "@/lib/types"
import { DashboardShell } from "@/components/dashboard-shell"
import { AnomaliesManager } from "@/components/anomalies-manager"
import { AnomalyDialog } from "@/components/anomaly-dialog"
import { AnomalyBulkPaste } from "@/components/anomaly-bulk-paste"
import { Button } from "@/components/ui/button"
import { CRM_DEFAULT_CITY_ID } from "@/lib/apiBase"
import { getCrmMetadataForAnomalies } from "@/app/actions/crm-anomaly-metadata"
import { Plus, ClipboardPaste } from "lucide-react"

interface AnomaliesPageContentProps {
  keywords: Keyword[]
}

export function AnomaliesPageContent({ keywords }: AnomaliesPageContentProps) {
  // Backend enforces max limit of 200
  // Using public hook (no Auth0 required) for CRM pages
  const { data, isLoading, error } = useAnomaliesPublic({
    is_anomaly: true,
    limit: 200,
    city_id: CRM_DEFAULT_CITY_ID,
  })

  const mappedAnomalies = useMemo(
    () =>
      mapApiAnomaliesToCrm(data?.results ?? []).map((a) => ({
        ...a,
        keywords: [] as Keyword[],
      })),
    [data?.results]
  )
  const [anomaliesWithKeywords, setAnomaliesWithKeywords] = useState<
    (Anomaly & { keywords: Keyword[] })[]
  >(mappedAnomalies)

  useEffect(() => {
    let cancelled = false

    async function enrichWithCrmMetadata() {
      setAnomaliesWithKeywords(mappedAnomalies)
      const anomalyIds = mappedAnomalies
        .map((a) => a.anomaly_id ?? null)
        .filter((id): id is number => typeof id === "number" && id > 0)

      if (anomalyIds.length === 0) return

      try {
        const metadataByAnomalyId = await getCrmMetadataForAnomalies(anomalyIds)
        if (cancelled) return

        setAnomaliesWithKeywords(
          mappedAnomalies.map((anomaly) => {
            const anomalyId = anomaly.anomaly_id ?? -1
            const metadata = metadataByAnomalyId[anomalyId]
            if (!metadata) return anomaly
            return {
              ...anomaly,
              crm_metadata: metadata,
              district_label: metadata.district_label ?? anomaly.district_label,
              is_citywide: metadata.is_citywide,
              severity: metadata.severity,
              crm_status: metadata.crm_status,
            }
          })
        )
      } catch {
        if (!cancelled) {
          setAnomaliesWithKeywords(mappedAnomalies)
        }
      }
    }

    void enrichWithCrmMetadata()
    return () => {
      cancelled = true
    }
  }, [mappedAnomalies])

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
