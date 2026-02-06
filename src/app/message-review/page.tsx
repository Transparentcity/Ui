import { createClient } from "@/lib/db"
import { DashboardShell } from "@/components/dashboard-shell"
import { MessageReview } from "@/components/message-review"

export const metadata = {
  title: "Message Review | Transparent City CRM",
  description: "Review, edit, and approve outgoing messages before sending",
}

export const dynamic = 'force-dynamic'
export default async function MessageReviewPage() {
  const db = createClient()
  
  // Fetch pending review items
  const { data: pendingReviewItems } = await db
    .from("send_queue")
    .select(`
      *,
      prospect:prospects(id, name, email, phone, organization, department, jurisdiction)
    `)
    .eq("status", "pending_review")
    .order("created_at", { ascending: true })
  
  // Get count of queued items for reference
  const { count: queuedCount } = await db
    .from("send_queue")
    .select("*", { count: "exact" })
    .eq("status", "queued")
  
  const items = Array.isArray(pendingReviewItems) ? pendingReviewItems : []
  
  return (
    <DashboardShell 
      title="Message Review" 
      description={`Review and approve messages before they're sent • ${queuedCount || 0} messages in send queue`}
    >
      <MessageReview 
        items={items as any} 
      />
    </DashboardShell>
  )
}
