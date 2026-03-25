/**
 * Fetches research report HTML and extracts narrative paragraphs for feed stories.
 *
 * Many feed stories have thin metadata-only descriptions but their parent
 * research report contains rich narrative text. This module fetches the report
 * once per unique report hash and extracts the relevant paragraph for each story.
 */

import type { FeedStory } from "@/lib/hooks/useFeed";
import { API_BASE } from "@/lib/api/request";

// ── Strip HTML to plain text ────────────────────────────────────────────────

function htmlToText(html: string): string {
  let text = html.replace(/<[^>]+>/g, "\n");
  text = text.replace(/\[(?:anomaly|chart|map):\d+\]/g, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text;
}

// ── Extract SHORT narrative for card display ────────────────────────────────

/**
 * Given the HTML of a research report and a headline, find the first
 * substantial paragraph after that headline. Returns ~1-2 sentences for cards.
 */
function extractNarrative(html: string, headline: string): string | null {
  const text = htmlToText(html);

  const idx = text.indexOf(headline);
  if (idx < 0) return null;

  const after = text.slice(idx + headline.length, idx + headline.length + 1500).trim();
  const paras = after.split("\n\n").map((p) => p.trim()).filter((p) => p.length > 80);
  if (paras.length === 0) return null;

  let para = paras[0].replace(/\s+/g, " ").trim();

  // Trim at a sentence boundary (last period before 300 chars)
  if (para.length > 200) {
    const cut = para.lastIndexOf(".", 300);
    if (cut > 60) para = para.slice(0, cut + 1);
  }

  if (!para.endsWith(".") && para.length > 100) {
    const lastDot = para.lastIndexOf(".");
    if (lastDot > 60) para = para.slice(0, lastDot + 1);
  }

  return para;
}

// ── Extract FULL narrative for detail page ──────────────────────────────────

/**
 * Extracts the full narrative from a research report for the detail page.
 * Returns all substantial paragraphs — enough for ~3 phone scrolls.
 * The result is split into { above, below } sections for rendering around a chart.
 */
export interface DetailNarrative {
  /** Paragraphs to show above the chart (the opening/context) */
  above: string[];
  /** Paragraphs to show below the chart (deeper analysis, methodology) */
  below: string[];
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

function filterParagraphs(body: string): string[] {
  return body
    .split("\n\n")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => {
      if (p.length < 40) return false;
      if (p.length < 60 && /^[A-Z\s:]+$/.test(p)) return false;
      if (/^\[(?:anomaly|chart|map):\d+\]$/.test(p)) return false;
      return true;
    });
}

/**
 * Detect if a line is a metadata breadcrumb that separates stories in reports.
 * Examples:
 *   "San Francisco · City-wide · Week of Feb 23, 2026"
 *   "San Francisco · March 2026 · Data fresh as of Mar 6"
 *   "San Francisco · District 2 (Marina/Pacific Heights) · Week of Feb 23, 2026"
 */
function isMetadataBreadcrumb(line: string): boolean {
  // Must contain the · separator
  if (!line.includes("·")) return false;
  // Must contain a city name or date pattern
  if (!/(?:San Francisco|Chicago|New York|Los Angeles|Seattle)/i.test(line)) return false;
  // Must contain a date or data freshness reference
  if (!/(?:Week of|Data fresh|January|February|March|April|May|June|July|August|September|October|November|December|\d{4})/i.test(line)) return false;
  // Must be relatively short (metadata lines aren't long paragraphs)
  if (line.length > 200) return false;
  return true;
}

/**
 * Detect if a line looks like a feed story headline (section boundary).
 * Feed headlines typically: contain an em dash + a number/percent, don't end with period.
 */
function looksLikeHeadline(line: string): boolean {
  if (line.length < 20 || line.length > 200) return false;
  if (line.endsWith(".")) return false;
  if (!/^[A-Z]/.test(line)) return false;
  // Must contain em dash pattern typical of feed headlines
  if (!/ — /.test(line)) return false;
  // Must have numeric data (percent, dollar amount, count)
  if (!/\d/.test(line)) return false;
  return true;
}

export function extractDetailNarrative(html: string, headline: string): DetailNarrative | null {
  const MIN_WORDS = 300;
  const MAX_WORDS = 700;

  const text = htmlToText(html);

  // Find our headline in the text
  const idx = text.indexOf(headline);
  if (idx < 0) return null;

  const searchStart = idx + headline.length;
  const afterText = text.slice(searchStart).trim();

  // Split into paragraphs and find where the next story begins.
  // We detect story boundaries by: metadata breadcrumb lines, or
  // lines that look like feed headlines (em dash + number, no period).
  const allParas = afterText.split("\n\n").map((p) => p.replace(/\s+/g, " ").trim());

  const storyParas: string[] = [];
  let wordCount = 0;

  for (const p of allParas) {
    if (!p || p.length < 10) continue;

    // Breadcrumbs at the START of a section belong to this story — skip them.
    // But breadcrumbs AFTER we've collected content signal the next story.
    if (isMetadataBreadcrumb(p)) {
      if (storyParas.length > 0) break; // next story boundary
      continue; // skip this story's own breadcrumb
    }

    // Stop at what looks like the next story's headline
    // (but only after we've collected some content)
    if (storyParas.length > 0 && looksLikeHeadline(p)) break;

    // Skip lines that are just chart/map references
    if (/^\[(?:anomaly|chart|map):\d+\]$/.test(p)) continue;

    // Skip very short non-sentence fragments (sub-headings)
    if (p.length < 40) continue;
    if (p.length < 60 && /^[A-Z\s:]+$/.test(p)) continue;

    storyParas.push(p);
    wordCount += countWords(p);

    // Hard cap at 700 words
    if (wordCount >= MAX_WORDS) break;
    // Cap at 10 paragraphs
    if (storyParas.length >= 10) break;
  }

  if (storyParas.length === 0) return null;

  // Split: ~150 words above the chart, rest below
  // If total is under 200 words, put everything above (don't split short text)
  if (wordCount < 200) {
    return { above: storyParas, below: [] };
  }

  let aboveWords = 0;
  let splitPoint = 0;
  for (let i = 0; i < storyParas.length; i++) {
    aboveWords += countWords(storyParas[i]);
    splitPoint = i + 1;
    if (aboveWords >= 150 || splitPoint >= 3) break;
  }

  return {
    above: storyParas.slice(0, splitPoint),
    below: storyParas.slice(splitPoint),
  };
}

// ── Extract report hash from detail_url ─────────────────────────────────────

function getReportHash(story: FeedStory): string | null {
  // detail_url is like "/r/0ea3VsaC#story-36fWSFei"
  const url = story.detail_url;
  if (!url) return null;
  const match = url.match(/\/r\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

// ── Main: fetch narratives for a batch of stories ───────────────────────────

/**
 * For each story with a thin description, fetch the parent research report
 * and extract the narrative paragraph. Returns a map of story ID -> narrative.
 *
 * Groups stories by report hash to avoid duplicate fetches.
 */
export async function fetchNarratives(
  stories: FeedStory[],
): Promise<Map<number, string>> {
  const result = new Map<number, string>();

  // Group stories by report hash
  const byHash = new Map<string, FeedStory[]>();
  for (const story of stories) {
    // Only fetch narratives for stories with thin descriptions
    const desc = (story.description ?? "").trim();
    const isThin = !desc || desc.split(" ").length < 15;
    if (!isThin) continue;

    const hash = getReportHash(story);
    if (!hash) continue;

    const group = byHash.get(hash) ?? [];
    group.push(story);
    byHash.set(hash, group);
  }

  // Fetch each unique report
  const fetches = Array.from(byHash.entries()).map(async ([hash, groupStories]) => {
    try {
      const res = await fetch(`${API_BASE}/api/research/by-hash/${hash}`);
      if (!res.ok) return;
      const data = await res.json();
      const html = data.final_report_html;
      if (!html) return;

      for (const story of groupStories) {
        const narrative = extractNarrative(html, story.headline);
        if (narrative) {
          result.set(story.id, narrative);
        }
      }
    } catch {
      // Silently skip — stories will keep their existing descriptions
    }
  });

  await Promise.all(fetches);
  return result;
}

// ── Fetch full detail narrative for a single story ──────────────────────────

/**
 * Fetches the full research report for a single story and returns a rich
 * narrative split into above/below sections for the detail page.
 * Falls back to the story's own description if no report is available.
 */
export async function fetchDetailNarrative(
  story: FeedStory,
): Promise<DetailNarrative | null> {
  const hash = getReportHash(story);
  if (!hash) return null;

  try {
    const res = await fetch(`${API_BASE}/api/research/by-hash/${hash}`);
    if (!res.ok) return null;
    const data = await res.json();
    const html = data.final_report_html;
    if (!html) return null;

    return extractDetailNarrative(html, story.headline);
  } catch {
    return null;
  }
}
