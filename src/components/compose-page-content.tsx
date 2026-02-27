"use client"

import { useAnomalies } from "@/lib/hooks/useAnomalies"
import { mapApiAnomaliesToCrm } from "@/lib/anomalyMapper"
import { CRM_DEFAULT_CITY_ID } from "@/lib/apiBase"
import { DashboardShell } from "@/components/dashboard-shell"
import { AIEmailComposer } from "@/components/ai-email-composer"
import type { ContactWithKeywords, Keyword } from "@/lib/types"
import type { Anomaly } from "@/lib/types"

interface AnomalyWithKeywords extends Anomaly {
  anomaly_keywords?: Array<{ keyword_id: string; keywords: { id: string; name: string } | null }>
}

interface ComposePageContentProps {
  contacts: ContactWithKeywords[]
  keywords: Keyword[]
}

export function ComposePageContent({ contacts, keywords }: ComposePageContentProps) {
  // High limit ensures 5+ anomalies per district plus citywide
  const { data, isLoading } = useAnomalies({
    is_anomaly: true,
    limit: 500,
    city_id: CRM_DEFAULT_CITY_ID,
  })

  const apiResults = data?.results ?? []
  const anomalies: AnomalyWithKeywords[] = mapApiAnomaliesToCrm(apiResults).map((a) => ({
    ...a,
    anomaly_keywords: [],
  }))

  return (
    <DashboardShell
      title="AI Email Composer"
      description="Write one sample email and let AI generate unique versions for each contact"
    >
      {isLoading ? (
        <p className="text-muted-foreground">Loading anomalies…</p>
      ) : null}
      <AIEmailComposer
        contacts={contacts as any}
        anomalies={anomalies}
        keywords={keywords}
      />
    </DashboardShell>
  )
}
