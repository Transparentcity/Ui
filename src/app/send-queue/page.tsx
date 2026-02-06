import { createClient } from "@/lib/db"
import { DashboardShell } from "@/components/dashboard-shell"
import { SendQueueView } from "@/components/send-queue-view"

export const metadata = {
  title: "Send Queue | Transparent City CRM",
  description: "View and manage scheduled outgoing messages",
}

export const dynamic = 'force-dynamic'
export default async function SendQueuePage() {
  const db = createClient()
  
  // Fetch queue items (excluding pending_review - those are in Message Review)
  const { data: queueItems } = await db
    .from("send_queue")
    .select(`
      *,
      prospect:prospects(id, name, email, phone, organization, department, jurisdiction)
    `)
    .neq("status", "pending_review")
    .order("scheduled_for", { ascending: true })
  
  // Fetch campaigns for filtering
  const { data: campaigns } = await db
    .from("campaigns")
    .select("id, name, status")
    .order("created_at", { ascending: false })
  
  // Get count of pending review items for reference
  const { count: pendingReviewCount } = await db
    .from("send_queue")
    .select("*", { count: "exact" })
    .eq("status", "pending_review")
  
  // Calculate stats
  const now = new Date()
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const todayStart = new Date(now.setHours(0, 0, 0, 0))
  
  const items = Array.isArray(queueItems) ? queueItems : []
  const sentItems = items.filter((i: any) => i.status === "sent")
  const todaySent = sentItems.filter((i: any) => new Date(i.sent_at || "") >= todayStart).length
  const hourSent = sentItems.filter((i: any) => new Date(i.sent_at || "") >= hourAgo).length
  
  const campaignsArr = Array.isArray(campaigns) ? campaigns : []
  
  const stats = {
    total: items.length,
    pending_review: pendingReviewCount || 0,
    queued: items.filter((i: any) => i.status === "queued").length,
    processing: items.filter((i: any) => i.status === "processing").length,
    sent: sentItems.length,
    failed: items.filter((i: any) => i.status === "failed").length,
    cancelled: items.filter((i: any) => i.status === "cancelled").length,
    todaySent,
    hourSent,
  }
  
  return (
    <DashboardShell 
      title="Send Queue" 
      description={`Manage scheduled messages • ${pendingReviewCount || 0} messages pending review`}
    >
      <SendQueueView 
        queueItems={items as any} 
        campaigns={campaignsArr as any}
        stats={stats}
      />
    </DashboardShell>
  )
}
