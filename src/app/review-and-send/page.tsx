import { createClient } from "@/lib/db"
import { DashboardShell } from "@/components/dashboard-shell"
import { ReviewAndSend } from "@/components/review-and-send"
import { ReviewAndSendTabs } from "@/components/review-and-send-tabs"
import { reporterFeedsEnabled } from "@/lib/reporterFeedLeads"

export const metadata = {
  title: "Review & Send | Transparent City CRM",
  description: "Review, edit, and send outgoing anomaly alert emails",
}

export const dynamic = 'force-dynamic'

export default async function ReviewAndSendPage() {
  const db = createClient()

  // Fetch all send_queue items with prospect info
  const { data: allItems } = await db
    .from("send_queue")
    .select(`
      *,
      prospect:prospects(id, name, first_name, last_name, email, phone, organization, department, jurisdiction, city_id, city_name)
    `)
    .order("created_at", { ascending: false })

  const items = Array.isArray(allItems) ? allItems : []

  const pendingCount = items.filter((i: any) => i.status === "pending_review").length
  const sentCount = items.filter((i: any) => i.status === "sent").length

  const queueItems = items as React.ComponentProps<typeof ReviewAndSend>["items"]

  return (
    <DashboardShell
      title="Review & Send"
      description={`${pendingCount} pending review, ${sentCount} sent`}
      cityAware
    >
      {reporterFeedsEnabled() ? (
        <ReviewAndSendTabs>
          <ReviewAndSend items={queueItems} />
        </ReviewAndSendTabs>
      ) : (
        <ReviewAndSend items={queueItems} />
      )}
    </DashboardShell>
  )
}
