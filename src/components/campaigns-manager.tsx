"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, MoreHorizontal, Send, Play, Pause, Trash2, Mail, MessageSquare, ListPlus, Settings2, ArrowRight, RefreshCw, Loader2, Plus } from "lucide-react"
import { Campaign, Template } from "@/lib/types"
import { CampaignDialog } from "./campaign-dialog"
import { ThrottleSettings } from "./throttle-settings"
import { deleteCampaign, updateCampaignStatus } from "@/app/actions/campaigns"
import { queueCampaignMessages, regenerateCampaign } from "@/app/actions/send-queue"
import { useAnomaliesPublic } from "@/lib/hooks/useAnomaliesPublic"
import { mapApiAnomaliesToCrm } from "@/lib/anomalyMapper"
import { isAnomalyIgnored } from "./anomalies-manager"

// San Francisco city_id - TODO: make this configurable
const SF_CITY_ID = 57260

interface CampaignWithStats extends Campaign {
  template?: { id: string; name: string; channel: string } | null
  messageCount: number
  prospect_ids?: string[]
}

interface Contact {
  id: string
  name: string
  email: string | null
  phone: string | null
  status: string
}

interface CampaignsManagerProps {
  campaigns: CampaignWithStats[]
  templates: Pick<Template, 'id' | 'name' | 'channel'>[]
  contacts: Contact[]
}

function getStatusVariant(status: string): "success" | "default" | "warning" | "secondary" | "outline" {
  switch (status) {
    case 'active': return 'success'
    case 'completed': return 'default'
    case 'paused': return 'warning'
    case 'scheduled': return 'secondary'
    default: return 'outline'
  }
}

export function CampaignsManager({ campaigns, templates, contacts }: CampaignsManagerProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [isPending, startTransition] = useTransition()
  const [generatingCampaignId, setGeneratingCampaignId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<{ type: 'loading' | 'success' | 'error', text: string } | null>(null)
  
  // Fetch anomalies from Platform API for email generation
  // API max limit is 200 - this should provide ~15+ anomalies per district plus citywide
  // Using public hook (no Auth0 required) for CRM pages
  const { data: anomalyData, isLoading: anomaliesLoading, error: anomaliesError } = useAnomaliesPublic({
    is_anomaly: true,
    limit: 200,
    city_id: SF_CITY_ID,
  })
  const anomaliesErrorMessage =
    (anomaliesError as unknown as { message?: string } | null)?.message || null
  const anomalies = anomalyData?.results ? mapApiAnomaliesToCrm(anomalyData.results) : []
  
  // Debug logging for anomalies
  console.log('[CampaignsManager] Anomalies status:', {
    loading: anomaliesLoading,
    error: anomaliesErrorMessage,
    count: anomalies.length,
    rawResultsCount: anomalyData?.results?.length ?? 0
  })

  const filteredCampaigns = campaigns.filter(campaign =>
    campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    campaign.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this campaign?')) {
      startTransition(async () => {
        await deleteCampaign(id)
        router.refresh()
      })
    }
  }

  const handleStatusChange = async (id: string, status: string) => {
    startTransition(async () => {
      await updateCampaignStatus(id, status)
    })
  }

  const getContactIdsForCampaign = (campaign: CampaignWithStats): string[] => {
    if (campaign.prospect_ids && campaign.prospect_ids.length > 0) {
      return campaign.prospect_ids
    }
    return contacts.filter(c => c.status === 'active').map(c => c.id)
  }

  const handleQueueMessages = async (campaignId: string, templateId: string | null, campaign: CampaignWithStats) => {
    if (!templateId) {
      alert('Please select a template for this campaign first')
      return
    }

    const contactIds = getContactIdsForCampaign(campaign)
    if (contactIds.length === 0) {
      alert('No contacts to send messages to. Add contacts to the campaign or ensure you have active contacts.')
      return
    }

    if (confirm(`Generate ${contactIds.length} AI-personalized messages with anomaly data for this campaign? This may take 30-60 seconds.`)) {
      console.log('[CampaignsManager] Starting email generation with', anomalies.length, 'anomalies')
      if (anomalies.length === 0) {
        console.warn('[CampaignsManager] WARNING: No anomalies available! Check auth and API connection.')
      }
      // Serialize anomalies to plain objects for server action (Next.js requirement)
      const serializedAnomalies = JSON.parse(JSON.stringify(anomalies))
      console.log('[CampaignsManager] Serialized anomalies count:', serializedAnomalies.length)
      setGeneratingCampaignId(campaignId)
      setStatusMessage({ type: 'loading', text: `Generating ${contactIds.length} personalized emails with AI...` })
      startTransition(async () => {
        try {
          await queueCampaignMessages(campaignId, templateId, contactIds, serializedAnomalies)
          await updateCampaignStatus(campaignId, 'active')
          setStatusMessage({ type: 'success', text: `Successfully generated ${contactIds.length} emails! Check Message Review to approve them.` })
          setTimeout(() => setStatusMessage(null), 5000)
        } catch (error) {
          setStatusMessage({ type: 'error', text: `Error: ${error instanceof Error ? error.message : 'Failed to generate emails'}` })
          setTimeout(() => setStatusMessage(null), 8000)
        } finally {
          setGeneratingCampaignId(null)
        }
      })
    }
  }

  const handleRegenerateCampaign = async (campaignId: string, templateId: string | null, campaign: CampaignWithStats) => {
    if (!templateId) {
      alert('Please select a template for this campaign first')
      return
    }

    const contactIds = getContactIdsForCampaign(campaign)
    if (contactIds.length === 0) {
      alert('No contacts to send messages to. Add contacts to the campaign or ensure you have active contacts.')
      return
    }

    // Check if anomalies are still loading
    if (anomaliesLoading) {
      alert('Anomaly data is still loading. Please wait a moment and try again.')
      return
    }
    
    // Check if there was an error loading anomalies
    if (anomaliesError) {
      alert(
        `Error loading anomaly data: ${anomaliesErrorMessage || "Unknown error"}. ` +
          "Please refresh the page and try again."
      )
      return
    }
    
    // Warn if no anomalies available
    if (anomalies.length === 0) {
      const proceed = confirm(
        'Warning: No anomaly data is available. This could mean:\n\n' +
        '• You may not be logged in\n' +
        '• The anomaly API may be unavailable\n' +
        '• There may be no anomalies detected for San Francisco\n\n' +
        'Emails will be generated without specific anomaly data. Continue anyway?'
      )
      if (!proceed) return
    }

    if (confirm(`This will clear any pending/queued messages and generate ${contactIds.length} new AI-personalized messages. This may take 30-60 seconds. Continue?`)) {
      console.log('[CampaignsManager] Starting regeneration with', anomalies.length, 'anomalies')
      console.log('[CampaignsManager] Anomaly loading state:', { loading: anomaliesLoading, error: anomaliesErrorMessage })
      
      // Filter out ignored anomalies before creating slim versions
      const activeAnomalies = anomalies.filter(a => !isAnomalyIgnored(a.id))
      const ignoredCount = anomalies.length - activeAnomalies.length
      if (ignoredCount > 0) {
        console.log(`[CampaignsManager] Excluded ${ignoredCount} ignored anomalies`)
      }
      
      // Create slim anomaly objects with only fields needed for email generation
      // This avoids Next.js server action payload size limits (chart_payload can be huge)
      const slimAnomalies = activeAnomalies.map(a => ({
        id: a.id,
        title: a.title,
        description: a.description,
        district: a.district,
        district_label: a.district_label,
        is_citywide: a.is_citywide,
        metric_id: a.metric_id,
        metric_name: (a as any).metric_name,
        pct_change: a.pct_change,
        severity: a.severity,
        period_type: a.period_type,
        period_date: (a as any).period_date,
        group_field: a.group_field,
        group_value: a.group_value,
        recent_mean: (a as any).recent_mean,
        comparison_mean: (a as any).comparison_mean,
        comparison_window: (a as any).comparison_window,
        metric_category: (a as any).metric_category,
        is_anomaly: a.is_anomaly,
        created_at: a.created_at,
      }))
      console.log('[CampaignsManager] Slim anomalies count:', slimAnomalies.length)
      if (slimAnomalies.length > 0) {
        console.log('[CampaignsManager] First slim anomaly:', slimAnomalies[0])
      }
      setGeneratingCampaignId(campaignId)
      setStatusMessage({ type: 'loading', text: `Generating ${contactIds.length} personalized emails with AI...` })

      // Capture anomalies in closure before startTransition
      const anomaliesToSend = slimAnomalies
      console.log('[CampaignsManager] About to call regenerateCampaign with', anomaliesToSend.length, 'anomalies')
      
      startTransition(async () => {
        try {
          await regenerateCampaign(
            campaignId,
            templateId,
            contactIds,
            true, // clear existing queued/pending messages
            anomaliesToSend // pass serialized anomalies from Platform API
          )
          setStatusMessage({ type: 'success', text: `Successfully generated ${contactIds.length} emails! Check Message Review to approve them.` })
          setTimeout(() => setStatusMessage(null), 5000)
        } catch (error) {
          setStatusMessage({ type: 'error', text: `Error: ${error instanceof Error ? error.message : 'Failed to generate emails'}` })
          setTimeout(() => setStatusMessage(null), 8000)
        } finally {
          setGeneratingCampaignId(null)
        }
      })
    }
  }

  return (
    <div className="space-y-4">
      {/* Status Banner */}
      {statusMessage && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          statusMessage.type === 'loading' ? 'bg-blue-50 border border-blue-200 text-blue-800' :
          statusMessage.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
          'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {statusMessage.type === 'loading' && (
            <Loader2 className="w-5 h-5 animate-spin" />
          )}
          {statusMessage.type === 'success' && (
            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
          {statusMessage.type === 'error' && (
            <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}
          <span className="font-medium">{statusMessage.text}</span>
          {statusMessage.type !== 'loading' && (
            <button 
              onClick={() => setStatusMessage(null)}
              className="ml-auto text-current opacity-60 hover:opacity-100"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {filteredCampaigns.length} campaign{filteredCampaigns.length !== 1 ? 's' : ''}
        </p>
        <CampaignDialog templates={templates} contacts={contacts}>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Campaign
          </Button>
        </CampaignDialog>
      </div>

      {filteredCampaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {searchQuery 
              ? 'No campaigns found matching your search' 
              : 'No campaigns yet. Create your first campaign to start reaching out to officials.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCampaigns.map((campaign) => (
            <Card key={campaign.id} className={`relative ${generatingCampaignId === campaign.id ? 'ring-2 ring-blue-400' : ''}`}>
              {/* Generating overlay */}
              {generatingCampaignId === campaign.id && (
                <div className="absolute inset-0 bg-blue-50/80 backdrop-blur-[1px] rounded-lg z-10 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2 text-blue-700">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="text-sm font-medium">Generating emails...</span>
                  </div>
                </div>
              )}
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <CardTitle className="text-base truncate">{campaign.name}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getStatusVariant(campaign.status)}>
                        {campaign.status}
                      </Badge>
                      {campaign.template && (
                        <Badge variant="outline" className="text-xs">
                          {campaign.template.channel === 'email' ? (
                            <Mail className="w-3 h-3 mr-1" />
                          ) : (
                            <MessageSquare className="w-3 h-3 mr-1" />
                          )}
                          {campaign.template.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {campaign.status === 'draft' && (
                        <>
                          <DropdownMenuItem 
                            onClick={() => handleQueueMessages(campaign.id, campaign.template_id, campaign)}
                            disabled={isPending || !campaign.template_id}
                          >
                            <ListPlus className="w-4 h-4 mr-2" />
                            Queue Messages with Variations
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleStatusChange(campaign.id, 'active')}
                            disabled={isPending}
                          >
                            <Play className="w-4 h-4 mr-2" />
                            Start Campaign (No Queue)
                          </DropdownMenuItem>
                        </>
                      )}
                      {campaign.status === 'active' && (
                        <>
                          <DropdownMenuItem 
                            onClick={() => handleRegenerateCampaign(campaign.id, campaign.template_id, campaign)}
                            disabled={isPending || !campaign.template_id || generatingCampaignId === campaign.id}
                          >
                            {generatingCampaignId === campaign.id ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4 mr-2" />
                            )}
                            {generatingCampaignId === campaign.id ? 'Generating...' : 'Regenerate Campaign'}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleStatusChange(campaign.id, 'paused')}
                            disabled={isPending}
                          >
                            <Pause className="w-4 h-4 mr-2" />
                            Pause
                          </DropdownMenuItem>
                        </>
                      )}
                      {campaign.status === 'paused' && (
                        <>
                          <DropdownMenuItem 
                            onClick={() => handleRegenerateCampaign(campaign.id, campaign.template_id, campaign)}
                            disabled={isPending || !campaign.template_id || generatingCampaignId === campaign.id}
                          >
                            {generatingCampaignId === campaign.id ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4 mr-2" />
                            )}
                            {generatingCampaignId === campaign.id ? 'Generating...' : 'Regenerate Campaign'}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleStatusChange(campaign.id, 'active')}
                            disabled={isPending}
                          >
                            <Play className="w-4 h-4 mr-2" />
                            Resume
                          </DropdownMenuItem>
                        </>
                      )}
                      <ThrottleSettings campaignId={campaign.id}>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                          <Settings2 className="w-4 h-4 mr-2" />
                          Throttle Settings
                        </DropdownMenuItem>
                      </ThrottleSettings>
                      <CampaignDialog campaign={campaign} templates={templates} contacts={contacts}>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                          <Send className="w-4 h-4 mr-2" />
                          Edit Campaign
                        </DropdownMenuItem>
                      </CampaignDialog>
                      <DropdownMenuSeparator />
                      <Link href="/send-queue">
                        <DropdownMenuItem>
                          <ArrowRight className="w-4 h-4 mr-2" />
                          View Send Queue
                        </DropdownMenuItem>
                      </Link>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => handleDelete(campaign.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                {campaign.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {campaign.description}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{campaign.messageCount} messages sent</span>
                  <span>Created {new Date(campaign.created_at).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
