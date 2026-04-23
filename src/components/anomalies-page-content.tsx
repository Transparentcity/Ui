"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAnomalies } from "@/lib/hooks/useAnomalies"
import { useFeedStories, type FeedStory } from "@/lib/hooks/useFeed"
import { mapApiAnomaliesToCrm } from "@/lib/anomalyMapper"
import type { Anomaly, Keyword } from "@/lib/types"
import { AnomaliesManager } from "@/components/anomalies-manager"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getCrmMetadataForAnomalies } from "@/app/actions/crm-anomaly-metadata"
import { useCrmCity } from "@/components/crm-city-context"
import { ExternalLink, Sparkles, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface AnomaliesPageContentProps {
  keywords: Keyword[]
}

type StoryFilter = "all" | "featured" | "week"

export function AnomaliesPageContent({ keywords }: AnomaliesPageContentProps) {
  const { selectedCity } = useCrmCity()
  const cityId = selectedCity?.id

  const [activeTab, setActiveTab] = useState<"stories" | "anomalies">("stories")
  // Lifted so tab switches don't wipe selection
  const [selectedStoryIds, setSelectedStoryIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    setSelectedStoryIds(new Set())
  }, [cityId])

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "stories" | "anomalies")}>
      <TabsList>
        <TabsTrigger value="stories">Feed Stories</TabsTrigger>
        <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
      </TabsList>

      <TabsContent value="stories" className="mt-4">
        <FeedStoriesPanel
          cityId={cityId}
          selectedIds={selectedStoryIds}
          setSelectedIds={setSelectedStoryIds}
        />
      </TabsContent>

      <TabsContent value="anomalies" className="mt-4">
        <AnomaliesPanel cityId={cityId} keywords={keywords} />
      </TabsContent>
    </Tabs>
  )
}

function FeedStoriesPanel({
  cityId,
  selectedIds,
  setSelectedIds,
}: {
  cityId: number | undefined
  selectedIds: Set<number>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<number>>>
}) {
  const router = useRouter()
  const { data, isLoading, error } = useFeedStories({
    city_id: cityId,
    limit: 100,
    order_by: "published_at",
    enabled: Boolean(cityId),
  })

  const stories = data?.stories ?? []
  const [filter, setFilter] = useState<StoryFilter>("all")
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  const visibleStories = useMemo(() => {
    if (filter === "featured") return stories.filter((s) => s.is_featured)
    if (filter === "week") {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
      return stories.filter((s) => {
        const when = s.published_at
          ? new Date(s.published_at).getTime()
          : s.story_date
            ? new Date(s.story_date).getTime()
            : 0
        return when >= cutoff
      })
    }
    return stories
  }, [stories, filter])

  if (!cityId) {
    return <p className="text-sm text-gray-500">Pick a city in the sidebar to load feed stories.</p>
  }

  if (error) {
    return (
      <p className="text-sm text-red-600">
        Failed to load feed stories: {error instanceof Error ? error.message : String(error)}
      </p>
    )
  }

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading feed stories…</p>
  }

  if (stories.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center">
        <p className="text-sm text-gray-600">No feed stories for this city yet.</p>
        <p className="mt-1 text-xs text-gray-500">
          Generate stories from the research or admin tools to populate this list.
        </p>
      </div>
    )
  }

  const allSelected = selectedIds.size > 0 && visibleStories.every((s) => selectedIds.has(s.id))

  function toggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const s of visibleStories) next.delete(s.id)
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const s of visibleStories) next.add(s.id)
        return next
      })
    }
  }

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function draftEmail() {
    const ids = Array.from(selectedIds).join(",")
    router.push(`/create-emails?storyIds=${ids}`)
  }

  const featuredCount = stories.filter((s) => s.is_featured).length
  const weekCount = stories.filter((s) => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    const when = s.published_at
      ? new Date(s.published_at).getTime()
      : s.story_date
        ? new Date(s.story_date).getTime()
        : 0
    return when >= cutoff
  }).length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All <span className="text-gray-400 ml-1">{stories.length}</span>
        </FilterChip>
        <FilterChip active={filter === "featured"} onClick={() => setFilter("featured")}>
          Featured <span className="text-gray-400 ml-1">{featuredCount}</span>
        </FilterChip>
        <FilterChip active={filter === "week"} onClick={() => setFilter("week")}>
          This week <span className="text-gray-400 ml-1">{weekCount}</span>
        </FilterChip>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            aria-label="Select all visible stories"
          />
          <span className="text-sm text-gray-700">
            {selectedIds.size > 0
              ? `${selectedIds.size} selected`
              : `${visibleStories.length} of ${stories.length} shown`}
          </span>
        </div>
        <Button
          size="sm"
          disabled={selectedIds.size === 0}
          onClick={draftEmail}
        >
          <Sparkles className="w-3.5 h-3.5 mr-2" />
          Draft email with selected
        </Button>
      </div>

      {visibleStories.length === 0 ? (
        <p className="text-sm text-gray-500 p-4 text-center">
          No stories match this filter.
        </p>
      ) : (
        <ul className="space-y-2">
          {visibleStories.map((story) => (
            <FeedStoryRow
              key={story.id}
              story={story}
              checked={selectedIds.has(story.id)}
              expanded={expandedIds.has(story.id)}
              onToggle={() => toggle(story.id)}
              onToggleExpand={() => toggleExpand(story.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center px-3 py-1 rounded-full border text-xs font-medium transition-colors",
        active
          ? "bg-purple-50 border-purple-300 text-purple-700"
          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
      )}
    >
      {children}
    </button>
  )
}

function FeedStoryRow({
  story,
  checked,
  expanded,
  onToggle,
  onToggleExpand,
}: {
  story: FeedStory
  checked: boolean
  expanded: boolean
  onToggle: () => void
  onToggleExpand: () => void
}) {
  const publishedLabel = story.published_at
    ? new Date(story.published_at).toLocaleDateString()
    : story.story_date
      ? new Date(story.story_date).toLocaleDateString()
      : null

  return (
    <li
      className={cn(
        "rounded-lg border transition-colors",
        checked ? "border-purple-300 bg-purple-50/40" : "border-gray-200 bg-white hover:bg-gray-50"
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <Checkbox
          checked={checked}
          onCheckedChange={onToggle}
          aria-label={`Select story ${story.headline}`}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <button
              onClick={onToggleExpand}
              className="text-left text-sm font-semibold text-gray-900 leading-snug hover:text-purple-700 focus:outline-none focus:underline"
            >
              {story.headline}
            </button>
            <div className="flex items-center gap-2 shrink-0">
              {story.canonical_path && (
                <a
                  href={story.canonical_path}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-gray-500 hover:text-purple-600 inline-flex items-center gap-1"
                >
                  Preview <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button
                onClick={onToggleExpand}
                className="text-gray-500 hover:text-gray-900"
                aria-label={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
          {story.description && !expanded && (
            <p className="mt-1 text-sm text-gray-600 line-clamp-2">{story.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              {story.story_type.replace(/_/g, " ")}
            </Badge>
            {story.district > 0 && (
              <Badge variant="outline" className="text-[10px]">
                District {story.district}
              </Badge>
            )}
            {story.is_featured && (
              <Badge className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100">
                Featured
              </Badge>
            )}
            {publishedLabel && (
              <span className="text-xs text-gray-500">{publishedLabel}</span>
            )}
          </div>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/60 text-sm text-gray-700 space-y-2">
          {story.description && <p>{story.description}</p>}
          {story.summary && (
            <div className="text-gray-600 whitespace-pre-wrap">{story.summary}</div>
          )}
        </div>
      )}
    </li>
  )
}

function AnomaliesPanel({
  cityId,
  keywords,
}: {
  cityId: number | undefined
  keywords: Keyword[]
}) {
  const { data, isLoading, error } = useAnomalies({
    is_anomaly: true,
    limit: 200,
    city_id: cityId,
    enabled: Boolean(cityId),
  })

  const mappedAnomalies = useMemo(
    () =>
      mapApiAnomaliesToCrm(data?.results ?? []).map((a) => ({
        ...a,
        keywords: [] as Keyword[],
      })),
    [data?.results]
  )
  const [anomaliesWithKeywords, setAnomaliesWithKeywords] = useState<
    (Anomaly & { keywords: Keyword[] })[]
  >(mappedAnomalies)

  useEffect(() => {
    let cancelled = false

    async function enrichWithCrmMetadata() {
      setAnomaliesWithKeywords(mappedAnomalies)
      const anomalyIds = mappedAnomalies
        .map((a) => a.anomaly_id ?? null)
        .filter((id): id is number => typeof id === "number" && id > 0)

      if (anomalyIds.length === 0) return

      try {
        const metadataByAnomalyId = await getCrmMetadataForAnomalies(anomalyIds)
        if (cancelled) return

        setAnomaliesWithKeywords(
          mappedAnomalies.map((anomaly) => {
            const anomalyId = anomaly.anomaly_id ?? -1
            const metadata = metadataByAnomalyId[anomalyId]
            if (!metadata) return anomaly
            return {
              ...anomaly,
              crm_metadata: metadata,
              district_label: metadata.district_label ?? anomaly.district_label,
              is_citywide: metadata.is_citywide,
              severity: metadata.severity,
              crm_status: metadata.crm_status,
            }
          })
        )
      } catch {
        if (!cancelled) {
          setAnomaliesWithKeywords(mappedAnomalies)
        }
      }
    }

    void enrichWithCrmMetadata()
    return () => {
      cancelled = true
    }
  }, [mappedAnomalies])

  if (!cityId) {
    return <p className="text-sm text-gray-500">Pick a city in the sidebar to load anomalies.</p>
  }

  if (error) {
    return (
      <p className="text-sm text-red-600">
        Failed to load anomalies: {error instanceof Error ? error.message : String(error)}
      </p>
    )
  }

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading anomalies…</p>
  }

  return <AnomaliesManager anomalies={anomaliesWithKeywords} keywords={keywords} />
}
