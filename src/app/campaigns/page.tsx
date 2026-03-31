import { createClient } from "@/lib/db"
import { DashboardShell } from "@/components/dashboard-shell"
import { CampaignsManager } from "@/components/campaigns-manager"
import { CampaignDialog } from "@/components/campaign-dialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  const db = await createClient()
  
  const [campaignsResult, templatesResult, contactsResult] = await Promise.all([
    db
      .from('campaigns')
      .select(`
        *,
        template:templates(id, name, channel),
        messages(count)
      `)
      .order('created_at', { ascending: false }),
    db.from('templates').select('id, name, channel').order('name'),
    db.from('prospects').select('id, name, email, phone, status').eq('status', 'active').order('name')
  ])

  const campaigns = Array.isArray(campaignsResult.data) ? campaignsResult.data : []
  const templates = Array.isArray(templatesResult.data) ? templatesResult.data : []
  const contacts = Array.isArray(contactsResult.data) ? contactsResult.data : []
  
  const campaignIds = campaigns.map((c: any) => c.id)
  const prospectsByCampaign: Record<string, string[]> = {}
  if (campaignIds.length > 0) {
    try {
      const prospectsResult = await new Promise<{ data: { campaign_id: string; prospect_id: string }[] | null; error: Error | null }>((resolve) => {
        db.from('campaign_prospects').select('campaign_id, prospect_id').then(resolve).catch((err: Error) => {
          resolve({ data: null, error: err })
        })
      })
      if (!prospectsResult.error && prospectsResult.data) {
        const rows = prospectsResult.data
        for (const row of rows) {
          if (!prospectsByCampaign[row.campaign_id]) prospectsByCampaign[row.campaign_id] = []
          prospectsByCampaign[row.campaign_id].push(row.prospect_id)
        }
      }
    } catch (error) {
      // Table may not exist yet - continue without prospect assignments
      console.error('[Campaigns] Error fetching campaign_prospects:', error)
    }
  }
  // Fetch queue stats per campaign
  const queueStatsByCampaign: Record<string, { pending_review: number; queued: number; sent: number; failed: number }> = {}
  if (campaignIds.length > 0) {
    try {
      const queueResult = await db
        .from('send_queue')
        .select('campaign_id, status')
      if (!queueResult.error && queueResult.data) {
        const rows = Array.isArray(queueResult.data) ? queueResult.data : []
        for (const row of rows as { campaign_id: string; status: string }[]) {
          if (!queueStatsByCampaign[row.campaign_id]) {
            queueStatsByCampaign[row.campaign_id] = { pending_review: 0, queued: 0, sent: 0, failed: 0 }
          }
          const stats = queueStatsByCampaign[row.campaign_id]
          if (row.status === 'pending_review') stats.pending_review++
          else if (row.status === 'queued') stats.queued++
          else if (row.status === 'sent') stats.sent++
          else if (row.status === 'failed') stats.failed++
        }
      }
    } catch {
      // Queue table may not exist yet
    }
  }

  const campaignsWithStats = campaigns.map((campaign: any) => ({
    ...campaign,
    messageCount: campaign.messages?.[0]?.count || 0,
    prospect_ids: prospectsByCampaign[campaign.id] ?? [],
    queueStats: queueStatsByCampaign[campaign.id] || { pending_review: 0, queued: 0, sent: 0, failed: 0 },
  }))

  return (
    <DashboardShell
      title="Campaigns"
      description="Create and manage outreach campaigns to government officials"
      actions={
        <CampaignDialog 
          templates={templates} 
          contacts={contacts}
        >
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Campaign
          </Button>
        </CampaignDialog>
      }
    >
      <CampaignsManager 
        campaigns={campaignsWithStats} 
        templates={templates}
        contacts={contacts}
      />
    </DashboardShell>
  )
}
