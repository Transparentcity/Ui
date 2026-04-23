"use client"

import { useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ComposePageContent } from "@/components/compose-page-content"
import { CampaignsManager } from "@/components/campaigns-manager"
import { CampaignDialog } from "@/components/campaign-dialog"
import { ManualComposeContent } from "@/components/manual-compose-content"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Plus, Sparkles, Megaphone, PenLine, Copy, Check, Loader2, Mail, X } from "lucide-react"
import { getPublicFeedStory, type FeedStory } from "@/lib/api/feed"
import { toast } from "sonner"
import type { ContactWithKeywords, Keyword, Campaign, Template } from "@/lib/types"

interface CampaignContact {
  id: string
  name: string
  email: string | null
  phone: string | null
  status: string
}

type Tab = "compose" | "manual" | "campaigns"

interface CreateEmailsTabsProps {
  initialTab: Tab
  initialContactId: string | null
  initialStoryIds: number[]
  contacts: ContactWithKeywords[]
  keywords: Keyword[]
  campaigns: (Campaign & {
    template?: { id: string; name: string; channel: string } | null
    messageCount: number
    prospect_ids?: string[]
    queueStats?: { pending_review: number; queued: number; sent: number; failed: number }
  })[]
  templates: Template[]
  campaignContacts: CampaignContact[]
}

export function CreateEmailsTabs({
  initialTab,
  initialContactId,
  initialStoryIds,
  contacts,
  keywords,
  campaigns,
  templates,
  campaignContacts,
}: CreateEmailsTabsProps) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [storyIds, setStoryIds] = useState<number[]>(initialStoryIds)

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <TabsList>
          <TabsTrigger value="compose" className="gap-2">
            <Sparkles className="w-3.5 h-3.5" />
            AI Compose
          </TabsTrigger>
          <TabsTrigger value="manual" className="gap-2">
            <PenLine className="w-3.5 h-3.5" />
            Manual
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-2">
            <Megaphone className="w-3.5 h-3.5" />
            Campaigns
          </TabsTrigger>
        </TabsList>

        {tab === "campaigns" && (
          <CampaignDialog templates={templates} contacts={campaignContacts}>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              New Campaign
            </Button>
          </CampaignDialog>
        )}
      </div>

      <TabsContent value="compose">
        {storyIds.length > 0 && (
          <StoryDraftPreview
            storyIds={storyIds}
            onDismiss={() => setStoryIds([])}
          />
        )}
        <ComposePageContent
          contacts={contacts}
          keywords={keywords}
          initialContactId={initialContactId}
        />
      </TabsContent>

      <TabsContent value="manual">
        <ManualComposeContent
          contacts={contacts}
          keywords={keywords}
          templates={templates}
        />
      </TabsContent>

      <TabsContent value="campaigns">
        <CampaignsManager
          campaigns={campaigns}
          templates={templates}
          contacts={campaignContacts}
        />
      </TabsContent>
    </Tabs>
  )
}

function StoryDraftPreview({
  storyIds,
  onDismiss,
}: {
  storyIds: number[]
  onDismiss: () => void
}) {
  const [stories, setStories] = useState<FeedStory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const results = await Promise.all(
          storyIds.map((id) => getPublicFeedStory(id).catch(() => null))
        )
        if (cancelled) return
        const fetched = results
          .map((r) => (r && r.story ? r.story : null))
          .filter((s): s is FeedStory => s != null)
        setStories(fetched)
        if (fetched.length > 0) {
          const cityName = fetched[0].city_name
          const subjectBase = fetched.length === 1
            ? fetched[0].headline
            : `${fetched.length} updates${cityName ? ` from ${cityName}` : ""}`
          setSubject(subjectBase)
          setBody(buildDraftBody(fetched))
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load stories")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [storyIds])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
      setCopied(true)
      toast.success("Copied")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Failed to copy")
    }
  }

  if (loading) {
    return (
      <Card className="mb-4 border-purple-200">
        <CardContent className="p-4 flex items-center gap-2 text-sm text-gray-700">
          <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
          Loading {storyIds.length} {storyIds.length === 1 ? "story" : "stories"}...
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="mb-4 border-red-200 bg-red-50">
        <CardContent className="p-4 text-sm text-red-700">
          Failed to load stories: {error}
        </CardContent>
      </Card>
    )
  }

  if (stories.length === 0) {
    return null
  }

  return (
    <Card className="mb-4 border-purple-200 bg-purple-50/40">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-purple-900">
            <Mail className="w-3.5 h-3.5" />
            Draft from {stories.length} selected {stories.length === 1 ? "story" : "stories"}
          </div>
          <button
            onClick={onDismiss}
            className="text-purple-700/60 hover:text-purple-900 shrink-0"
            aria-label="Dismiss story draft"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <Label className="text-xs text-gray-500 uppercase tracking-wide">Subject</Label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full bg-white rounded border border-gray-200 px-3 py-2 text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div>
          <Label className="text-xs text-gray-500 uppercase tracking-wide">Body</Label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="mt-1 w-full bg-white rounded border border-gray-200 px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            className="gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy draft"}
          </Button>
          <p className="text-xs text-gray-500">
            Paste into your own email, or pick a contact below for an AI-generated alternative.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function buildDraftBody(stories: FeedStory[]): string {
  const baseUrl =
    (typeof window !== "undefined" && window.location.origin) ||
    "https://transparent.city"

  const lines: string[] = []
  lines.push("Hi,")
  lines.push("")
  lines.push(
    stories.length === 1
      ? "Wanted to share a recent Transparent.city story that might be useful:"
      : "Wanted to share a few recent Transparent.city stories that might be useful:"
  )
  lines.push("")

  for (const story of stories) {
    lines.push(`• ${story.headline}`)
    if (story.description) {
      lines.push(`  ${story.description}`)
    }
    if (story.canonical_path) {
      const href = story.canonical_path.startsWith("http")
        ? story.canonical_path
        : `${baseUrl}${story.canonical_path}`
      lines.push(`  ${href}`)
    } else if (story.public_url) {
      lines.push(`  ${story.public_url}`)
    }
    lines.push("")
  }

  lines.push("Happy to talk through any of this.")
  lines.push("")
  return lines.join("\n")
}
