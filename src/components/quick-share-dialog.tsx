"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Mail, FileText, Copy, Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Template } from "@/lib/types"
import type { FeedStory } from "@/lib/api/feed"
import { listPublicFeedStories } from "@/lib/apiClient"
import { substitutePlaceholders } from "@/lib/template-substitute"
import { useCrmCitySafe } from "@/components/crm-city-context"
import { toast } from "sonner"

interface QuickShareDialogProps {
  templates: Template[]
  initialTemplateId?: string
  children: React.ReactNode
}

export function QuickShareDialog({ templates, initialTemplateId, children }: QuickShareDialogProps) {
  const [open, setOpen] = useState(false)
  const [templateSearch, setTemplateSearch] = useState("")
  const [storySearch, setStorySearch] = useState("")
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialTemplateId ?? null)
  const [selectedStoryId, setSelectedStoryId] = useState<number | null>(null)
  const [stories, setStories] = useState<FeedStory[]>([])
  const [storiesLoading, setStoriesLoading] = useState(false)
  const [storiesError, setStoriesError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const cityCtx = useCrmCitySafe()
  const selectedCity = cityCtx?.selectedCity ?? null

  const cityId = selectedCity?.id ?? null

  useEffect(() => {
    if (!open) return
    if (cityId == null) return
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setStories([])
      setSelectedStoryId(null)
      setStoriesLoading(true)
      setStoriesError(null)
      return listPublicFeedStories({
        city_id: cityId,
        limit: 30,
        order_by: "published_at",
      })
        .then((resp) => {
          if (cancelled) return
          setStories(resp.stories ?? [])
        })
        .catch((e) => {
          if (cancelled) return
          setStoriesError(e instanceof Error ? e.message : "Failed to load stories")
        })
        .finally(() => {
          if (!cancelled) setStoriesLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [open, cityId])

  const emailTemplates = useMemo(
    () => templates.filter((t) => t.channel === "email"),
    [templates],
  )

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase()
    if (!q) return emailTemplates
    return emailTemplates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.subject ?? "").toLowerCase().includes(q) ||
        (t.category ?? "").toLowerCase().includes(q),
    )
  }, [emailTemplates, templateSearch])

  const filteredStories = useMemo(() => {
    const q = storySearch.trim().toLowerCase()
    if (!q) return stories
    return stories.filter(
      (s) =>
        s.headline.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q),
    )
  }, [stories, storySearch])

  const selectedTemplate = useMemo(
    () => emailTemplates.find((t) => t.id === selectedTemplateId) ?? null,
    [emailTemplates, selectedTemplateId],
  )
  const selectedStory = useMemo(
    () => stories.find((s) => s.id === selectedStoryId) ?? null,
    [stories, selectedStoryId],
  )

  const previewSubject = useMemo(() => {
    if (!selectedTemplate) return ""
    return substitutePlaceholders(
      selectedTemplate.subject,
      null,
      selectedStory ? [selectedStory] : [],
      { cityName: selectedCity?.name ?? null },
    )
  }, [selectedTemplate, selectedStory, selectedCity])

  const previewBody = useMemo(() => {
    if (!selectedTemplate) return ""
    return substitutePlaceholders(
      selectedTemplate.body,
      null,
      selectedStory ? [selectedStory] : [],
      { cityName: selectedCity?.name ?? null },
    )
  }, [selectedTemplate, selectedStory, selectedCity])

  const combined = previewSubject ? `${previewSubject}\n\n${previewBody}` : previewBody

  async function handleCopy() {
    if (!combined) return
    try {
      await navigator.clipboard.writeText(combined)
      setCopied(true)
      toast.success("Copied. Paste into your email.")
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Copy failed. Select and copy manually.")
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      if (initialTemplateId) setSelectedTemplateId(initialTemplateId)
      if (!selectedCity) setStories([])
    } else {
      setTemplateSearch("")
      setStorySearch("")
      setCopied(false)
      if (!initialTemplateId) setSelectedTemplateId(null)
      setSelectedStoryId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Quick Share</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Pick a template, attach a story, copy. Paste into your email client to send.
            {selectedCity && (
              <> Stories shown for <span className="font-medium">{selectedCity.name}</span>.</>
            )}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Template picker */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Template
            </h3>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
              {filteredTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3">No email templates.</p>
              ) : (
                filteredTemplates.map((t) => {
                  const isSelected = t.id === selectedTemplateId
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(t.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm transition-colors",
                        isSelected ? "bg-purple-50 text-purple-900" : "hover:bg-gray-50",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate">{t.name}</span>
                        {t.category && (
                          <Badge variant="outline" className="text-[10px] ml-auto">
                            {t.category}
                          </Badge>
                        )}
                      </div>
                      {t.subject && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5 ml-5">
                          {t.subject}
                        </p>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </section>

          {/* Story picker */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Story
            </h3>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={selectedCity ? "Search stories..." : "Pick a city in the sidebar first"}
                value={storySearch}
                onChange={(e) => setStorySearch(e.target.value)}
                disabled={!selectedCity}
                className="pl-9"
              />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
              {!selectedCity ? (
                <p className="text-sm text-muted-foreground p-3">
                  Select a city in the sidebar to load stories.
                </p>
              ) : storiesLoading ? (
                <p className="text-sm text-muted-foreground p-3 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading stories...
                </p>
              ) : storiesError ? (
                <p className="text-sm text-red-600 p-3">{storiesError}</p>
              ) : filteredStories.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3">No stories match.</p>
              ) : (
                filteredStories.map((s) => {
                  const isSelected = s.id === selectedStoryId
                  const date = s.published_at ? new Date(s.published_at).toLocaleDateString() : null
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedStoryId(s.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm transition-colors",
                        isSelected ? "bg-purple-50 text-purple-900" : "hover:bg-gray-50",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className="font-medium flex-1">{s.headline}</span>
                        <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-muted-foreground">
                          {s.district && s.district > 0 && (
                            <Badge variant="outline" className="text-[10px]">D{s.district}</Badge>
                          )}
                          {date && <span>{date}</span>}
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </section>

          {/* Preview */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Preview
              </h3>
              <Button
                size="sm"
                onClick={handleCopy}
                disabled={!combined}
                className="gap-1.5"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </>
                )}
              </Button>
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 min-h-[160px] text-sm whitespace-pre-wrap font-mono text-gray-800">
              {selectedTemplate ? combined : (
                <span className="text-muted-foreground italic font-sans">
                  Pick a template to preview.
                </span>
              )}
            </div>
            {selectedTemplate && !selectedStory && (
              <p className="text-xs text-muted-foreground mt-2">
                No story attached. Story placeholders will fall back to your city URL.
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
