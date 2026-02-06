import { createClient } from "@/lib/db"
import { DashboardShell } from "@/components/dashboard-shell"
import { KeywordsManager } from "@/components/keywords-manager"

export const dynamic = 'force-dynamic'
export default async function KeywordsPage() {
  const db = await createClient()
  
  const { data: keywords } = await db
    .from('keywords')
    .select(`
      *,
      prospect_keywords(count),
      anomaly_keywords(count)
    `)
    .order('name')

  const keywordsArr = Array.isArray(keywords) ? keywords : []
  const keywordsWithCounts = keywordsArr.map((keyword: any) => ({
    ...keyword,
    contactCount: keyword.prospect_keywords?.[0]?.count || 0,
    anomalyCount: keyword.anomaly_keywords?.[0]?.count || 0
  }))

  return (
    <DashboardShell
      title="Keywords"
      description="Manage topics and areas of interest for matching contacts with anomalies"
    >
      <KeywordsManager keywords={keywordsWithCounts} />
    </DashboardShell>
  )
}
