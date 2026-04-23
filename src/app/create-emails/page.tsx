import { createClient } from "@/lib/db"
import { DashboardShell } from "@/components/dashboard-shell"
import { CreateEmailsTabs } from "@/components/create-emails-tabs"

export const dynamic = "force-dynamic"

interface CreateEmailsPageProps {
  searchParams?: Promise<{
    tab?: string
    contactId?: string
    storyIds?: string
  }>
}

export default async function CreateEmailsPage({ searchParams }: CreateEmailsPageProps) {
  const params = searchParams ? await searchParams : {}
  const initialTab = params?.tab === "campaigns" ? "campaigns" : "compose"
  const initialContactId = params?.contactId ?? null
  const initialStoryIds = params?.storyIds
    ? params.storyIds
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
    : []

  const db = await createClient()

  const [contactsResult, keywordsResult, campaignsResult, templatesResult, campaignContactsResult] =
    await Promise.all([
      db
        .from("prospects")
        .select(
          `
          *,
          prospect_keywords (
            keyword_id,
            keywords:keyword_id (id, name)
          )
        `
        )
        .eq("status", "active")
        .order("name"),
      db.from("keywords").select("*").order("name"),
      db
        .from("campaigns")
        .select(
          `
          *,
          template:templates(id, name, channel),
          messages(count)
        `
        )
        .order("created_at", { ascending: false }),
      db.from("templates").select("id, name, channel").order("name"),
      db.from("prospects").select("id, name, email, phone, status").eq("status", "active").order("name"),
    ])

  const contacts = Array.isArray(contactsResult.data) ? contactsResult.data : []
  const keywords = Array.isArray(keywordsResult.data) ? keywordsResult.data : []
  const campaigns = Array.isArray(campaignsResult.data) ? campaignsResult.data : []
  const templates = Array.isArray(templatesResult.data) ? templatesResult.data : []
  const campaignContacts = Array.isArray(campaignContactsResult.data)
    ? campaignContactsResult.data
    : []

  const campaignIds = campaigns.map((c: any) => c.id)
  const prospectsByCampaign: Record<string, string[]> = {}
  if (campaignIds.length > 0) {
    try {
      const result = await db.from("campaign_prospects").select("campaign_id, prospect_id")
      if (!result.error && Array.isArray(result.data)) {
        for (const row of result.data as { campaign_id: string; prospect_id: string }[]) {
          if (!prospectsByCampaign[row.campaign_id]) prospectsByCampaign[row.campaign_id] = []
          prospectsByCampaign[row.campaign_id].push(row.prospect_id)
        }
      }
    } catch {
      // Table may not exist; continue
    }
  }

  const queueStatsByCampaign: Record<
    string,
    { pending_review: number; queued: number; sent: number; failed: number }
  > = {}
  if (campaignIds.length > 0) {
    try {
      const queueResult = await db.from("send_queue").select("campaign_id, status")
      if (!queueResult.error && Array.isArray(queueResult.data)) {
        for (const row of queueResult.data as { campaign_id: string; status: string }[]) {
          if (!queueStatsByCampaign[row.campaign_id]) {
            queueStatsByCampaign[row.campaign_id] = {
              pending_review: 0,
              queued: 0,
              sent: 0,
              failed: 0,
            }
          }
          const stats = queueStatsByCampaign[row.campaign_id]
          if (row.status === "pending_review") stats.pending_review++
          else if (row.status === "queued") stats.queued++
          else if (row.status === "sent") stats.sent++
          else if (row.status === "failed") stats.failed++
        }
      }
    } catch {
      // Queue table may not exist
    }
  }

  const campaignsWithStats = campaigns.map((campaign: any) => ({
    ...campaign,
    messageCount: campaign.messages?.[0]?.count || 0,
    prospect_ids: prospectsByCampaign[campaign.id] ?? [],
    queueStats: queueStatsByCampaign[campaign.id] || {
      pending_review: 0,
      queued: 0,
      sent: 0,
      failed: 0,
    },
  }))

  return (
    <DashboardShell
      title="Create Emails"
      description="Compose AI-drafted emails or run bulk campaigns for the selected city"
      cityAware
    >
      <CreateEmailsTabs
        initialTab={initialTab}
        initialContactId={initialContactId}
        initialStoryIds={initialStoryIds}
        contacts={contacts as any}
        keywords={keywords as any}
        campaigns={campaignsWithStats as any}
        templates={templates as any}
        campaignContacts={campaignContacts as any}
      />
    </DashboardShell>
  )
}
