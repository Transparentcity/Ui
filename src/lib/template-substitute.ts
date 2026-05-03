import type { FeedStory } from "@/lib/api/feed"
import type { Contact } from "@/lib/types"

const TC_BASE_URL = "https://transparent.city"

export function citySlugFromName(name: string | null | undefined): string | null {
  if (!name) return null
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || null
}

export function storyUrl(story: FeedStory | null | undefined, fallback: string): string {
  if (!story) return fallback
  const path = story.canonical_path
  if (path) return path.startsWith("http") ? path : `${TC_BASE_URL}${path}`
  return story.public_url ?? fallback
}

export function storySnippet(story: FeedStory | null | undefined, cityUrl: string): string {
  if (!story) return cityUrl
  return [story.headline, story.description, storyUrl(story, cityUrl)]
    .filter(Boolean)
    .join("\n")
}

// Replace placeholder tokens like [FIRST NAME], [ANOMALY 1], [STORY], etc.
// with story content for the contact's district (or citywide fallback).
export function substitutePlaceholders(
  text: string | null | undefined,
  contact: Contact | null | undefined,
  stories: FeedStory[],
  options?: { cityName?: string | null },
): string {
  if (!text) return text ?? ""
  const cityName = contact?.city_name ?? options?.cityName ?? null
  const slug = citySlugFromName(cityName)
  const cityUrl = slug ? `${TC_BASE_URL}/c/${slug}` : TC_BASE_URL
  const firstName = contact?.name?.split(/\s+/)[0] ?? ""

  const districtNum = parseInt((contact?.jurisdiction || "").replace(/\D/g, ""))
  const districtStory = !isNaN(districtNum) && districtNum > 0
    ? stories.find((s) => s.district === districtNum)
    : undefined
  const citywideStory = stories.find((s) => s.district === 0 || s.district == null)
  const primary = districtStory ?? citywideStory ?? stories[0]
  const secondary =
    citywideStory && citywideStory !== primary
      ? citywideStory
      : stories.find((s) => s !== primary)

  return text
    .replace(/\[FIRST\s*NAME\]/gi, firstName || "[FIRST NAME]")
    .replace(/\[(?:anomaly|anomoly|story)\s*2[^\]]*citywide[^\]]*\]/gi, storySnippet(secondary, cityUrl))
    .replace(/\[(?:anomaly|anomoly|story)\s*2\b[^\]]*\]/gi, storySnippet(secondary, cityUrl))
    .replace(/\[(?:anomaly|anomoly|story)(?:\s*1)?\b[^\]]*\]/gi, storySnippet(primary, cityUrl))
}
