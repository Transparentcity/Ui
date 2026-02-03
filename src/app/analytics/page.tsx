import { createClient } from "@/lib/db"
import { DashboardShell } from "@/components/dashboard-shell"
import { AnalyticsDashboard } from "@/components/analytics-dashboard"

async function getAnalyticsData() {
  const db = await createClient()
  
  const [
    contactsResult,
    messagesResult,
    responsesResult,
    followupsResult,
    campaignsResult,
    keywordsResult
  ] = await Promise.all([
    db.from('prospects').select('id, status, priority, created_at'),
    db.from('messages').select('id, status, channel, sent_at, created_at'),
    db.from('responses').select('id, sentiment, priority, status, channel, responded_at, created_at'),
    db.from('followups').select('id, status, priority, due_date, completed_at, created_at'),
    db.from('campaigns').select('id, status, started_at, completed_at, created_at'),
    db.from('prospect_keywords').select(`
      keyword:keywords(id, name)
    `)
  ])

  // Cast all results to arrays for type safety
  const contacts = Array.isArray(contactsResult.data) ? contactsResult.data : []
  const messages = Array.isArray(messagesResult.data) ? messagesResult.data : []
  const responses = Array.isArray(responsesResult.data) ? responsesResult.data : []
  const followups = Array.isArray(followupsResult.data) ? followupsResult.data : []
  const campaigns = Array.isArray(campaignsResult.data) ? campaignsResult.data : []
  const keywords = Array.isArray(keywordsResult.data) ? keywordsResult.data : []

  // Calculate response rate
  const totalSent = messages.filter((m: any) => m.status === 'sent' || m.status === 'delivered').length
  const totalResponses = responses.length
  const responseRate = totalSent > 0 ? Math.round((totalResponses / totalSent) * 100) : 0

  // Sentiment breakdown
  const sentimentCounts = {
    positive: responses.filter((r: any) => r.sentiment === 'positive').length,
    neutral: responses.filter((r: any) => r.sentiment === 'neutral').length,
    negative: responses.filter((r: any) => r.sentiment === 'negative').length,
    needs_followup: responses.filter((r: any) => r.sentiment === 'needs_followup').length
  }

  // Channel breakdown
  const channelCounts = {
    email: messages.filter((m: any) => m.channel === 'email').length,
    sms: messages.filter((m: any) => m.channel === 'sms').length
  }

  // Response channel breakdown
  const responseChannelCounts = {
    email: responses.filter((r: any) => r.channel === 'email').length,
    sms: responses.filter((r: any) => r.channel === 'sms').length,
    phone: responses.filter((r: any) => r.channel === 'phone').length,
    other: responses.filter((r: any) => r.channel === 'other').length
  }

  // Priority distribution of contacts
  const priorityDistribution = [1, 2, 3, 4, 5].map(p => ({
    priority: p,
    count: contacts.filter((c: any) => c.priority === p).length
  }))

  // Keyword usage
  const keywordUsage: Record<string, number> = {}
  keywords.forEach((ck: any) => {
    if (ck.keyword) {
      keywordUsage[ck.keyword.name] = (keywordUsage[ck.keyword.name] || 0) + 1
    }
  })
  const topKeywords = Object.entries(keywordUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))

  // Campaign performance
  const campaignStats = {
    total: campaigns.length,
    completed: campaigns.filter((c: any) => c.status === 'completed').length,
    active: campaigns.filter((c: any) => c.status === 'active').length,
    draft: campaigns.filter((c: any) => c.status === 'draft').length
  }

  // Followup completion rate
  const completedFollowups = followups.filter((f: any) => f.status === 'completed').length
  const totalFollowups = followups.length
  const followupCompletionRate = totalFollowups > 0 ? Math.round((completedFollowups / totalFollowups) * 100) : 0

  // Response priority breakdown
  const responsePriorityDistribution = [1, 2, 3, 4, 5].map(p => ({
    priority: p,
    count: responses.filter((r: any) => r.priority === p).length
  }))

  return {
    overview: {
      totalContacts: contacts.length,
      activeContacts: contacts.filter((c: any) => c.status === 'active').length,
      totalMessages: messages.length,
      messagesSent: totalSent,
      totalResponses,
      responseRate,
      followupCompletionRate
    },
    sentimentCounts,
    channelCounts,
    responseChannelCounts,
    priorityDistribution,
    topKeywords,
    campaignStats,
    responsePriorityDistribution
  }
}

export default async function AnalyticsPage() {
  const analyticsData = await getAnalyticsData()

  return (
    <DashboardShell
      title="Analytics"
      description="Insights into your outreach performance and content strategy"
    >
      <AnalyticsDashboard data={analyticsData} />
    </DashboardShell>
  )
}
