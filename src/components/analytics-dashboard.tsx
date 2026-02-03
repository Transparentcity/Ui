"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatCard } from "@/components/stat-card"
import { 
  Users, 
  Send, 
  MessageSquare, 
  TrendingUp, 
  CheckCircle2,
  BarChart3,
  PieChart,
  Target
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend
} from "recharts"

interface AnalyticsData {
  overview: {
    totalContacts: number
    activeContacts: number
    totalMessages: number
    messagesSent: number
    totalResponses: number
    responseRate: number
    followupCompletionRate: number
  }
  sentimentCounts: {
    positive: number
    neutral: number
    negative: number
    needs_followup: number
  }
  channelCounts: {
    email: number
    sms: number
  }
  responseChannelCounts: {
    email: number
    sms: number
    phone: number
    other: number
  }
  priorityDistribution: { priority: number; count: number }[]
  topKeywords: { name: string; count: number }[]
  campaignStats: {
    total: number
    completed: number
    active: number
    draft: number
  }
  responsePriorityDistribution: { priority: number; count: number }[]
}

interface AnalyticsDashboardProps {
  data: AnalyticsData
}

const SENTIMENT_COLORS = {
  positive: 'oklch(0.6 0.15 145)',
  neutral: 'oklch(0.7 0.02 240)',
  negative: 'oklch(0.55 0.2 25)',
  needs_followup: 'oklch(0.7 0.15 60)'
}

const CHANNEL_COLORS = ['oklch(0.55 0.15 185)', 'oklch(0.65 0.12 160)', 'oklch(0.6 0.15 280)', 'oklch(0.7 0.15 60)']

export function AnalyticsDashboard({ data }: AnalyticsDashboardProps) {
  const sentimentData = [
    { name: 'Positive', value: data.sentimentCounts.positive, fill: SENTIMENT_COLORS.positive },
    { name: 'Neutral', value: data.sentimentCounts.neutral, fill: SENTIMENT_COLORS.neutral },
    { name: 'Negative', value: data.sentimentCounts.negative, fill: SENTIMENT_COLORS.negative },
    { name: 'Needs Follow-up', value: data.sentimentCounts.needs_followup, fill: SENTIMENT_COLORS.needs_followup }
  ].filter(d => d.value > 0)

  const channelData = [
    { name: 'Email', sent: data.channelCounts.email, responses: data.responseChannelCounts.email },
    { name: 'SMS', sent: data.channelCounts.sms, responses: data.responseChannelCounts.sms },
    { name: 'Phone', sent: 0, responses: data.responseChannelCounts.phone },
    { name: 'Other', sent: 0, responses: data.responseChannelCounts.other }
  ].filter(d => d.sent > 0 || d.responses > 0)

  const priorityData = data.priorityDistribution
    .filter(d => d.count > 0)
    .map(d => ({
      name: `P${d.priority}`,
      contacts: d.count
    }))

  const campaignData = [
    { name: 'Draft', value: data.campaignStats.draft },
    { name: 'Active', value: data.campaignStats.active },
    { name: 'Completed', value: data.campaignStats.completed }
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Contacts"
          value={data.overview.totalContacts}
          description={`${data.overview.activeContacts} active`}
          icon={Users}
          variant="primary"
        />
        <StatCard
          title="Messages Sent"
          value={data.overview.messagesSent}
          description={`${data.overview.totalMessages} total`}
          icon={Send}
          variant="default"
        />
        <StatCard
          title="Response Rate"
          value={`${data.overview.responseRate}%`}
          description={`${data.overview.totalResponses} responses`}
          icon={TrendingUp}
          variant={data.overview.responseRate >= 30 ? "success" : data.overview.responseRate >= 15 ? "warning" : "destructive"}
        />
        <StatCard
          title="Follow-up Completion"
          value={`${data.overview.followupCompletionRate}%`}
          icon={CheckCircle2}
          variant={data.overview.followupCompletionRate >= 80 ? "success" : data.overview.followupCompletionRate >= 50 ? "warning" : "destructive"}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sentiment Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <PieChart className="w-5 h-5 text-muted-foreground" />
              Response Sentiment
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sentimentData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No responses to analyze yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={256}>
                <RechartsPieChart>
                  <Pie
                    data={sentimentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {sentimentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </RechartsPieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Channel Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-muted-foreground" />
              Channel Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {channelData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No message data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={256}>
                <BarChart data={channelData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'oklch(var(--card))', 
                      border: '1px solid oklch(var(--border))',
                      borderRadius: '0.5rem'
                    }} 
                  />
                  <Legend />
                  <Bar dataKey="sent" fill="oklch(0.55 0.15 185)" name="Sent" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="responses" fill="oklch(0.65 0.12 160)" name="Responses" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Priority Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Target className="w-5 h-5 text-muted-foreground" />
              Contact Priority Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {priorityData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No contacts yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={256}>
                <BarChart data={priorityData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis dataKey="name" type="category" className="text-xs" width={40} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'oklch(var(--card))', 
                      border: '1px solid oklch(var(--border))',
                      borderRadius: '0.5rem'
                    }} 
                  />
                  <Bar dataKey="contacts" fill="oklch(0.55 0.15 185)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top Keywords */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-muted-foreground" />
              Top Keywords by Contact Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.topKeywords.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                No keywords assigned yet
              </div>
            ) : (
              <div className="space-y-3">
                {data.topKeywords.map((keyword, index) => (
                  <div key={keyword.name} className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground w-6">
                      {index + 1}.
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{keyword.name}</span>
                        <span className="text-sm text-muted-foreground">{keyword.count} contacts</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full"
                          style={{ 
                            width: `${Math.min(100, (keyword.count / Math.max(...data.topKeywords.map(k => k.count))) * 100)}%` 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Content Strategy Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium">Content Strategy Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Response Patterns</h4>
              <p className="text-sm text-muted-foreground">
                {data.overview.responseRate >= 30 
                  ? "Strong response rate! Your messaging is resonating with officials."
                  : data.overview.responseRate >= 15
                    ? "Moderate response rate. Consider A/B testing subject lines and message timing."
                    : "Low response rate. Try personalizing messages more and ensuring relevance to each official's jurisdiction."}
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Sentiment Analysis</h4>
              <p className="text-sm text-muted-foreground">
                {data.sentimentCounts.positive > data.sentimentCounts.negative
                  ? "Positive sentiment dominates. Your approach is building good relationships."
                  : data.sentimentCounts.negative > data.sentimentCounts.positive
                    ? "More negative than positive responses. Review your messaging tone and data presentation."
                    : "Mixed sentiment. Focus on providing more actionable insights in your communications."}
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Follow-up Effectiveness</h4>
              <p className="text-sm text-muted-foreground">
                {data.overview.followupCompletionRate >= 80
                  ? "Excellent follow-up discipline! This consistency helps build trust with officials."
                  : data.overview.followupCompletionRate >= 50
                    ? "Room for improvement on follow-ups. Consider setting reminders and prioritizing high-value contacts."
                    : "Many follow-ups are being missed. This may be hurting relationship building. Consider reducing volume or automating reminders."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
