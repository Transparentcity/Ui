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
  let prospectsByCampaign: Record<string, string[]> = {}
  if (campaignIds.length > 0) {
    const prospectsResult = await new Promise<{ data: { campaign_id: string; prospect_id: string }[] | null; error: Error | null }>((res) => {
      db.from('campaign_prospects').select('campaign_id, prospect_id').then(res)
    })
    if (!prospectsResult.error && prospectsResult.data) {
      const rows = prospectsResult.data
      for (const row of rows) {
        if (!prospectsByCampaign[row.campaign_id]) prospectsByCampaign[row.campaign_id] = []
        prospectsByCampaign[row.campaign_id].push(row.prospect_id)
      }
    }
  }
  const campaignsWithStats = campaigns.map((campaign: any) => ({
    ...campaign,
    messageCount: campaign.messages?.[0]?.count || 0,
    prospect_ids: prospectsByCampaign[campaign.id] ?? []
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
