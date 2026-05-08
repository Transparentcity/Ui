"use client";

import { useAuth0 } from "@auth0/auth0-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import {
  adminGenerateSharedNewsletter,
  listCities,
  listNewsletterReports,
  generateSampleNewsletter,
  listNewsletterPending,
  listNewsletterSends,
  getNewsletterPendingDetail,
  sendNewsletterPendingBatch,
  deleteNewsletterPendingBatch,
  archiveNewsletterPendingBatch,
  runScheduleJob,
  getNewsletterGenerationPreview,
  getAvailableModels,
  putNewsletterWeeklySeymourModel,
  listNewsletterEditionsAdmin,
  type CityListItem,
  type NewsletterReport,
  type NewsletterPendingListItem,
  type NewsletterSendItem,
  type NewsletterGenerationPreview,
  type NewsletterEditionAdminItem,
} from "@/lib/apiClient";
import {
  listPublicCitiesForSitemap,
  type PublicCitySitemapItem,
} from "@/lib/publicApiClient";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import Loader from "@/components/Loader";
import JobSessionDebugLink from "@/components/JobSessionDebugLink";
import NewsletterAdminSubscribersTab from "@/components/NewsletterAdminSubscribersTab";
import NewsletterAdminPromptsTab from "@/components/NewsletterAdminPromptsTab";
import styles from "./NewsletterAdmin.module.css";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
type TabId = "dashboard" | "browse" | "prompts" | "subscribers";

const TABS: { id: TabId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "browse", label: "Browse" },
  { id: "prompts", label: "Prompts" },
  { id: "subscribers", label: "Subscribers" },
];

const PAGE_SIZE = 50;

const DEFAULT_WEEKLY_PROMPT = `**This newsletter is for:** {city_name} ({district_label}). All data and comparisons must be for this city only.

Your primary job is to **follow the subscriber's request and give them exactly what they are asking for**. If an "Additional focus from the user" (or similar) appears below, treat it as the top priority: address it directly and include the content, data, or visuals they asked for. Then use the steps and rules below to write a **personalized {frequency} email** for {city_name} **{district_label}** that will be sent directly to the subscriber. It should feel like an email they want to open, not a formal report.

**Rules about what to prefer showing**
- **Image URLs from existing data**: When tools or data return **image URLs** (e.g. from 311/service request tables, case records, or visualization APIs), **include them in the email** as concrete examples. Image URLs from 311 data are especially valuable — they show real cases such as sidewalk cracks, graffiti, potholes, street lighting, illegal dumping, and other service requests. Prefer showing these when available so subscribers see real examples of what's being reported in their area.
- Use the tools explicitly; do not skip steps. The content will be emailed to residents and officials: write in plain language (avoid jargon), include specific numbers and percentages, and balance positive and concerning trends. **Write as if to one person** — warm and direct, not like a memo or formal report.
- Do not invent numbers. If a metric or comparison is missing, say "Data not available for this period" and move on.

---

## STEP 1: Resolve city and discover metrics

1. **City**: Call search_city(query='{city_name}') to get city_id, then use it for all subsequent calls.
2. **List metrics by domain**: Call list_metrics(category='crime', is_active=True, limit=20), then do the same for categories: housing, economy (or permits), and any category that covers 311/service requests and budget if available. Note the **metric_id** values for key metrics in: crime, housing, permits, 311/service requests, and budget (if present).

---

## STEP 2: Get dashboard comparisons ({district_label} vs city-wide)

3. **Dashboard**: Call get_dashboard_comparisons(city_id=<city_id>, comparison_types=['ytd','mtd','mtd_prior_year']). For district editions, also call with the district parameter and compare both.

From these calls, extract current vs prior period values and **percent changes** for each metric. For district editions, note whether the district is improving or lagging relative to city-wide.

---

## STEP 3: Identify and surface anomalies

5. For each **key metric_id** you noted in Step 1 (crime, housing, permits, 311, budget), call:
   - get_anomalies(metric_id=<id>, only_anomalies=True, limit=10).
   Optionally filter by period_type='week' or 'month' for weekly report relevance.
6. For any anomaly result you plan to mention in the email, call **show_anomaly(result_id=<id>)** so the anomaly chart is embedded in the response. Do not just describe anomalies — show the chart.

Summarize which metrics had notable anomalies (spikes or drops), and whether any anomaly is specific to the district (if the anomaly result includes district).

---

## STEP 4: Deeper analysis for narrative and comparisons

7. For 2-3 metrics that are most important or had the biggest changes, call:
   - get_metric_analysis(metric_id=<id>, district=0, include_time_series=True, include_anomalies=True) for city-wide.
   - For district editions, also call with the district number for comparison.
8. From the analysis response, if you get a **chart_id** for a time series, call **show_time_series(chart_id=<id>)** for at least one trend per major domain. Show the chart, don't only describe it.

Use this to write **this period vs previous period** (e.g., "This month vs last month", "YTD vs same period last year").

---

## STEP 5: Add one geographic visualization

9. Call **generate_map** with a metric and time window relevant to the city, e.g.:
   - generate_map(title='Key incidents this month', metric_id=<crime_or_311_metric_id>, city_id=<city_id>, start_date=<first_day_of_month>, end_date=<last_day_of_month>).
   If the tool returns a map_id, call **show_map(map_id=<map_id>)** so the map is embedded.

---

## STEP 6: Write the email

10. **Write the email** so it feels like a message to the subscriber, not a formal report. Use short paragraphs and a conversational flow. Use subheads only where they help the reader scan; avoid long, formal section titles.

    **HEADLINE AND STRUCTURE:**
    - The headline is the single most important element. It should name ONE key fact with real depth and connect it to other factors. Think of it as the lead of a news story: specific, surprising, grounded in data.
    - Good: "Property crime fell 17% this week, but drug incidents in one sector spiked 488%"
    - Bad: "Austin by the Numbers — Weekly Citywide Snapshot" (too generic, restates the title)
    - Bad: "Crime, Permits, and 311: A Mixed Week" (too vague)
    - The headline goes in an <h2> tag (NOT <h1> — the page title is rendered separately by the UI).
    - After the headline, lead with the key fact in more depth (3-4 sentences exploring what it means, why it matters, what context it needs). This anchoring story should have more depth than other pieces.
    - Then cover 2-3 other notable findings more briefly, each with specific numbers.

    Include:

    - **Headline** (as <h2>)
      ONE key finding that anchors the whole dispatch. Specific, data-driven, names the situation.

    - **Lead section**
      3-4 sentences expanding on the headline finding. What happened, why it matters, what residents should know. This gets the most depth.

    - **Other findings**
      2-3 additional notable data points from crime, housing, permits, 311 calls, budget. 1-2 sentences each with **specific numbers and percentages**. Use phrases like "up 12% YTD" or "down 5% from last month."

    - **Notable anomalies**
      Describe any significant spikes or drops, and **reference the anomaly charts you embedded** (e.g., "As the chart above shows..."). Say whether they're district-specific or city-wide.

    - **City-wide highlights** (or District vs city-wide for district editions)
      Comparative summary: where the city/district is improving or where attention is needed, with numbers.

    - **What you can do**
      Brief, actionable note: what residents might do (e.g., where to report issues) and what officials might focus on. Keep it to 1-2 sentences.

    - **Sign-off**
      A short closing line (e.g. where to find more data or how to get updates), then a simple sign-off like "— The TransparentCity team" or similar so it reads as an email.

11. **Tone and style**
    - Write as if to **one person** (the subscriber). Warm, direct, scannable. Avoid the tone of a formal report or memo.
    - Accessible to the general public; avoid technical jargon.
    - Data-driven: every claim should tie to a number or percentage from your tool outputs.
    - Balance: mention both positive and concerning trends.
    - Suggest what the trends might mean; don't only list numbers.

12. **Visuals and images**
    - Include at least: (a) 1-2 anomaly charts (show_anomaly), (b) 1-2 time series charts (show_time_series), and (c) 1 map (show_map after generate_map). Reference each in the text (e.g., "The chart above shows...").
    - **Prefer including image URLs when your tools or data provide them**: e.g. 311 case photos from existing tables (sidewalk cracks, graffiti, potholes, street defects, illegal dumping, etc.).

Complete all steps in order before writing the final email. If "Additional focus from the user" was provided, ensure the email directly addresses that request.`;

const DEFAULT_MONTHLY_PROMPT = `**This newsletter is for:** {city_name} ({district_label}). All data and comparisons must be for this city only.

Your primary job is to write a **personalized monthly email** for {city_name} **{district_label}** that will be sent directly to the subscriber. It should feel like an email they want to open, not a formal report.

Follow the same steps and rules as the weekly prompt, but with these adjustments:

- Focus on **month-over-month trends** across all key metrics (crime, housing, permits, 311 calls, budget)
- Include **year-over-year comparisons** where relevant
- Provide broader context for trends (not just raw numbers)
- Summarize what changed, why it matters, and what to watch next
- Use comparison_types=['ytd','mtd','mtd_prior_year'] for dashboard calls

**HEADLINE AND STRUCTURE:**
- The headline should name ONE key monthly finding with depth and connect it to other factors.
- Good: "Permit applications collapsed 70% this month while commercial filings surged"
- Bad: "Monthly City Update" (too generic)
- The headline goes in an <h2> tag (NOT <h1>).
- Lead with the key finding in 3-4 sentences, then cover 2-3 other notable monthly data points more briefly.

**Tone**: Write as if to one person. Warm, direct, scannable. Data-driven with specific numbers. Balance positive and concerning trends.

**Visuals**: Include at least 1-2 anomaly charts, 1-2 time series charts, and 1 map. Reference each in the text.

Complete all steps in order before writing the final email.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(value?: string | null): string {
  if (!value) return "\u2014";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function emailUsername(email: string | null | undefined): string {
  if (!email) return "\u2014";
  const idx = email.indexOf("@");
  return idx > 0 ? email.slice(0, idx) : email;
}

function daysSince(dateStr?: string | null): number {
  if (!dateStr) return Infinity;
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return Infinity;
  return Math.floor((Date.now() - dt.getTime()) / (24 * 60 * 60 * 1000));
}

function freshnessBadge(dateStr?: string | null) {
  const days = daysSince(dateStr);
  if (days <= 7) return { cls: styles.badgeGreen, label: "Fresh" };
  if (days <= 30) return { cls: styles.badgeYellow, label: `${days}d ago` };
  if (days === Infinity) return { cls: styles.badgeGray, label: "Never" };
  return { cls: styles.badgeGray, label: `${days}d ago` };
}

function countWords(html?: string | null): number {
  if (!html) return 0;
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").length : 0;
}

function escapeCSV(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function getPromptFromStorage(frequency: string): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`newsletter-prompt-${frequency}`) || "";
}

function savePromptToStorage(frequency: string, prompt: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`newsletter-prompt-${frequency}`, prompt);
}

function resolvePrompt(template: string, cityName: string, districtLabel: string, frequency: string): string {
  return template
    .replace(/\{city_name\}/g, cityName)
    .replace(/\{district_label\}/g, districtLabel)
    .replace(/\{frequency\}/g, frequency);
}

// ---------------------------------------------------------------------------
// Small helper — LLM token usage pill
// ---------------------------------------------------------------------------
function LlmUsagePill({
  usage,
}: {
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost_usd?: number | null;
    model_key?: string | null;
  } | null | undefined;
}) {
  if (!usage) {
    return (
      <span className={styles.muted} style={{ fontSize: 11 }}>
        —
      </span>
    );
  }
  const total = usage.total_tokens ?? (usage.prompt_tokens + usage.completion_tokens);
  const actualUsd =
    typeof usage.cost_usd === "number" && !Number.isNaN(usage.cost_usd)
      ? usage.cost_usd
      : null;
  // Fallback: rough GPT-4o-style display when server did not attach cost_usd
  const roughUsd =
    (usage.prompt_tokens * 5 + usage.completion_tokens * 15) / 1_000_000;
  const costLabel =
    actualUsd !== null
      ? actualUsd < 0.0001
        ? `<$0.0001`
        : `$${actualUsd.toFixed(4)}`
      : roughUsd < 0.001
        ? `<$0.001`
        : `~$${roughUsd.toFixed(3)}`;
  const pricingHint =
    actualUsd !== null
      ? `Actual cost (platform pricing table${usage.model_key ? ` · ${usage.model_key}` : ""})`
      : "Rough $ (GPT-4o-style heuristic; run again to get server cost when available)";
  return (
    <span
      title={`${pricingHint} · prompt: ${usage.prompt_tokens.toLocaleString()} · completion: ${usage.completion_tokens.toLocaleString()} tokens`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 11,
        fontWeight: 500,
        background: "var(--brand-primary-faint, rgba(173,53,250,0.07))",
        color: "var(--brand-primary, #ad35fa)",
        border: "1px solid var(--brand-primary-light, #e9c6ff)",
        borderRadius: 4,
        padding: "1px 5px",
        whiteSpace: "nowrap",
        cursor: "default",
      }}
    >
      {total.toLocaleString()} tok · {costLabel}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Types for aggregated city newsletter data
// ---------------------------------------------------------------------------
interface CityNewsletterStatus {
  city: CityListItem;
  isLaunched: boolean;
  reports: NewsletterReport[];
  latestDate: string | null;
  totalCount: number;
  districts: Set<string>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function NewsletterAdmin() {
  const { getAccessTokenSilently } = useAuth0();

  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [cities, setCities] = useState<CityListItem[]>([]);
  const [publicCities, setPublicCities] = useState<PublicCitySitemapItem[]>([]);
  const [cityStatuses, setCityStatuses] = useState<CityNewsletterStatus[]>([]);
  /** Non-personalized (shared LLM) editions from ``newsletter_editions``, grouped by city_id. */
  const [editionsByCityId, setEditionsByCityId] = useState<
    Record<number, NewsletterEditionAdminItem[]>
  >({});

  // Browse tab
  const [browseCity, setBrowseCity] = useState<number | null>(null);
  const [browseDistrict, setBrowseDistrict] = useState<string>("");
  const [browseFrequency, setBrowseFrequency] = useState<string>("");
  const [browseSearch, setBrowseSearch] = useState("");
  const [browseReports, setBrowseReports] = useState<NewsletterReport[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browsePage, setBrowsePage] = useState(0);
  const [expandedReportId, setExpandedReportId] = useState<number | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [exportMode, setExportMode] = useState<"full" | "headlines">("full");

  // Prompts tab
  const [promptFrequency, setPromptFrequency] = useState<"weekly" | "monthly">("weekly");
  const [promptText, setPromptText] = useState("");
  const [promptDirty, setPromptDirty] = useState(false);
  const [testCityId, setTestCityId] = useState<number | null>(null);
  const [testDistrict, setTestDistrict] = useState("0");
  const [testGenerating, setTestGenerating] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Dashboard expanded city
  const [expandedCityId, setExpandedCityId] = useState<number | null>(null);

  // Generate modal
  const [genCityId, setGenCityId] = useState<number | null>(null);
  const [genDistrict, setGenDistrict] = useState("0");
  const [genFrequency, setGenFrequency] = useState<"weekly" | "monthly">("weekly");
  const [genModelKey, setGenModelKey] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  /** Weekly workload / save UI — shared with generate modal for defaults and options. */
  const [workloadEstimateModelKey, setWorkloadEstimateModelKey] = useState("");
  const [workloadModelOptions, setWorkloadModelOptions] = useState<
    Array<{ key: string; name: string }>
  >([]);

  // -----------------------------------------------------------------------
  // Load initial data
  // -----------------------------------------------------------------------
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();

      const [citiesList, publicList, editionsRes] = await Promise.all([
        listCities(token),
        listPublicCitiesForSitemap(),
        listNewsletterEditionsAdmin(token).catch(() => ({ items: [] as NewsletterEditionAdminItem[], count: 0 })),
      ]);

      setCities(citiesList);
      setPublicCities(publicList);

      const launchedIds = new Set(
        publicList.filter((c) => c.is_launched).map((c) => c.id)
      );

      const byCity: Record<number, NewsletterEditionAdminItem[]> = {};
      for (const e of editionsRes.items) {
        if (!launchedIds.has(e.city_id)) continue;
        if (!byCity[e.city_id]) byCity[e.city_id] = [];
        byCity[e.city_id].push(e);
      }
      for (const k of Object.keys(byCity)) {
        const id = Number(k);
        byCity[id].sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        });
      }
      setEditionsByCityId(byCity);

      // Fetch newsletter status for launched cities (parallel, capped)
      const launchedCities = citiesList.filter(
        (c) => launchedIds.has(c.city_id) && c.is_active !== false
      );

      const statusResults = await Promise.allSettled(
        launchedCities.map(async (city) => {
          const reports = await listNewsletterReports(city.city_id, { limit: 50 }, token);
          const districts = new Set<string>();
          let latestDate: string | null = null;

          for (const r of reports) {
            if (r.district) districts.add(r.district);
            if (r.created_at && (!latestDate || r.created_at > latestDate)) {
              latestDate = r.created_at;
            }
          }

          return {
            city,
            isLaunched: true,
            reports,
            latestDate,
            totalCount: reports.length,
            districts,
          } as CityNewsletterStatus;
        })
      );

      const statuses: CityNewsletterStatus[] = [];
      for (const result of statusResults) {
        if (result.status === "fulfilled") {
          statuses.push(result.value);
        }
      }
      // Sort by city name
      statuses.sort((a, b) => a.city.city_name.localeCompare(b.city.city_name));
      setCityStatuses(statuses);
    } catch (err: any) {
      setError(err?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // -----------------------------------------------------------------------
  // Load prompt from storage on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    const saved = getPromptFromStorage(promptFrequency);
    const defaultPrompt = promptFrequency === "weekly" ? DEFAULT_WEEKLY_PROMPT : DEFAULT_MONTHLY_PROMPT;
    setPromptText(saved || defaultPrompt);
    setPromptDirty(false);
  }, [promptFrequency]);

  // -----------------------------------------------------------------------
  // Browse: fetch reports when filters change
  // -----------------------------------------------------------------------
  const loadBrowseReports = useCallback(async () => {
    if (!browseCity) {
      setBrowseReports([]);
      return;
    }
    try {
      setBrowseLoading(true);
      const token = await getAccessTokenSilently();
      const opts: { district?: number | null; frequency?: string; limit?: number } = { limit: 200 };
      if (browseDistrict) opts.district = Number(browseDistrict);
      if (browseFrequency) opts.frequency = browseFrequency;
      const reports = await listNewsletterReports(browseCity, opts, token);
      setBrowseReports(reports);
      setBrowsePage(0);
    } catch (err: any) {
      setError(err?.message || "Failed to load reports");
    } finally {
      setBrowseLoading(false);
    }
  }, [browseCity, browseDistrict, browseFrequency, getAccessTokenSilently]);

  useEffect(() => {
    if (activeTab === "browse") {
      loadBrowseReports();
    }
  }, [activeTab, loadBrowseReports]);

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------
  const stats = useMemo(() => {
    let totalNewsletters = 0;
    let citiesWithNewsletters = 0;
    let totalWords = 0;
    let reportsWithHtml = 0;
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    let thisWeek = 0;

    for (const cs of cityStatuses) {
      totalNewsletters += cs.totalCount;
      if (cs.totalCount > 0) citiesWithNewsletters++;
      for (const r of cs.reports) {
        if (r.final_report_html) {
          const wc = countWords(r.final_report_html);
          totalWords += wc;
          reportsWithHtml++;
        }
        if (r.created_at) {
          const d = new Date(r.created_at).getTime();
          if (!Number.isNaN(d) && d >= weekAgo) thisWeek++;
        }
      }
    }
    const avgWords = reportsWithHtml > 0 ? Math.round(totalWords / reportsWithHtml) : 0;
    return { totalNewsletters, citiesWithNewsletters, thisWeek, avgWords, totalCities: cityStatuses.length };
  }, [cityStatuses]);

  // Browse filtered + paginated
  const filteredBrowse = useMemo(() => {
    let result = browseReports;
    if (browseSearch) {
      const q = browseSearch.toLowerCase();
      result = result.filter(
        (r) =>
          (r.title || "").toLowerCase().includes(q) ||
          (r.social_summary || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [browseReports, browseSearch]);

  const browseTotalPages = Math.max(1, Math.ceil(filteredBrowse.length / PAGE_SIZE));
  const pagedBrowse = useMemo(() => {
    const start = browsePage * PAGE_SIZE;
    return filteredBrowse.slice(start, start + PAGE_SIZE);
  }, [filteredBrowse, browsePage]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------
  const handleGenerate = useCallback(async () => {
    if (!genCityId) return;
    setGenerating(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const response = await adminGenerateSharedNewsletter(
        {
          city_id: genCityId,
          district: genDistrict === "0" ? null : Number(genDistrict),
          frequency: genFrequency,
          model_key: genModelKey.trim() ? genModelKey.trim() : null,
        },
        token
      );
      if (response.job_id) {
        notifyJobCreated(response.job_id);
        toast.success("Shared newsletter generation queued.");
      }
      setGenCityId(null);
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to generate shared newsletter");
    } finally {
      setGenerating(false);
    }
  }, [genCityId, genDistrict, genFrequency, genModelKey, getAccessTokenSilently, loadData]);

  const handleSavePrompt = () => {
    savePromptToStorage(promptFrequency, promptText);
    setPromptDirty(false);
  };

  const handleResetPrompt = () => {
    const defaultPrompt = promptFrequency === "weekly" ? DEFAULT_WEEKLY_PROMPT : DEFAULT_MONTHLY_PROMPT;
    setPromptText(defaultPrompt);
    setPromptDirty(true);
  };

  const handleTestGenerate = useCallback(async () => {
    if (!testCityId) return;
    setTestGenerating(true);
    setTestResult(null);
    try {
      const token = await getAccessTokenSilently();
      const result = await generateSampleNewsletter(
        {
          city_id: testCityId,
          district: testDistrict === "0" ? null : Number(testDistrict),
          frequency: promptFrequency,
          prompt_override: promptText,
        },
        token
      );
      setTestResult(result.html);
    } catch (err: any) {
      setTestResult(`<p style="color:red;">Error: ${err?.message || "Generation failed"}</p>`);
    } finally {
      setTestGenerating(false);
    }
  }, [testCityId, testDistrict, promptFrequency, promptText, getAccessTokenSilently]);

  const handleExport = useCallback(() => {
    const toExport = filteredBrowse;
    const city = cities.find((c) => c.city_id === browseCity);
    const cityLabel = city?.city_name || "all";

    if (exportMode === "headlines") {
      const header = "date,city,district,title,frequency";
      const rows = toExport.map((r) =>
        [
          escapeCSV(r.created_at || ""),
          escapeCSV(cityLabel),
          escapeCSV(r.district || "city-wide"),
          escapeCSV(r.title || ""),
          escapeCSV(r.frequency || ""),
        ].join(",")
      );
      downloadCSV([header, ...rows].join("\n"), `newsletter-headlines-${cityLabel}`);
    } else {
      const header = "date,city,district,title,frequency,word_count,summary,url";
      const rows = toExport.map((r) =>
        [
          escapeCSV(r.created_at || ""),
          escapeCSV(cityLabel),
          escapeCSV(r.district || "city-wide"),
          escapeCSV(r.title || ""),
          escapeCSV(r.frequency || ""),
          String(countWords(r.final_report_html)),
          escapeCSV(r.social_summary || ""),
          escapeCSV(r.public_url || ""),
        ].join(",")
      );
      downloadCSV([header, ...rows].join("\n"), `newsletters-${cityLabel}`);
    }
    setShowExport(false);
  }, [filteredBrowse, browseCity, cities, exportMode]);

  function downloadCSV(csv: string, prefix: string) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div className={styles.newsletterAdmin}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 12 }}>
          <Loader size="md" color="dark" />
          <span>Loading newsletter data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.newsletterAdmin}>
      {/* Tabs */}
      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className={styles.errorMessage}>{error}</div>
      )}

      {/* Dashboard Tab */}
      {activeTab === "dashboard" && (
        <DashboardTab
          stats={stats}
          cityStatuses={cityStatuses}
          editionsByCityId={editionsByCityId}
          expandedCityId={expandedCityId}
          workloadEstimateModelKey={workloadEstimateModelKey}
          setWorkloadEstimateModelKey={setWorkloadEstimateModelKey}
          workloadModelOptions={workloadModelOptions}
          setWorkloadModelOptions={setWorkloadModelOptions}
          onToggleExpand={(id) => setExpandedCityId(expandedCityId === id ? null : id)}
          onGenerate={(cityId) => {
            setGenCityId(cityId);
            setGenModelKey(workloadEstimateModelKey);
          }}
        />
      )}

      {/* Browse Tab */}
      {activeTab === "browse" && (
        <BrowseTab
          cities={cities}
          cityStatuses={cityStatuses}
          browseCity={browseCity}
          browseDistrict={browseDistrict}
          browseFrequency={browseFrequency}
          browseSearch={browseSearch}
          browseLoading={browseLoading}
          pagedReports={pagedBrowse}
          filteredCount={filteredBrowse.length}
          page={browsePage}
          totalPages={browseTotalPages}
          expandedReportId={expandedReportId}
          onCityChange={(id) => { setBrowseCity(id); setBrowsePage(0); }}
          onDistrictChange={setBrowseDistrict}
          onFrequencyChange={setBrowseFrequency}
          onSearchChange={setBrowseSearch}
          onPageChange={setBrowsePage}
          onToggleExpand={(id) => setExpandedReportId(expandedReportId === id ? null : id)}
          onExport={() => setShowExport(true)}
        />
      )}

      {activeTab === "prompts" && <NewsletterAdminPromptsTab />}

      {activeTab === "subscribers" && <NewsletterAdminSubscribersTab />}

      {/* Generate Modal */}
      {genCityId !== null && (
        <div className={styles.exportOverlay} onClick={() => !generating && setGenCityId(null)}>
          <div className={styles.exportPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.exportTitle}>Generate Shared Newsletter</div>
            <div className={styles.exportField}>
              <label className={styles.exportLabel}>City</label>
              <div style={{ fontSize: 14, color: "var(--text-primary)" }}>
                {cities.find((c) => c.city_id === genCityId)?.city_name || "Unknown"}
              </div>
            </div>
            <div className={styles.exportField}>
              <label className={styles.exportLabel}>District</label>
              <select
                className={styles.select}
                value={genDistrict}
                onChange={(e) => setGenDistrict(e.target.value)}
              >
                <option value="0">City-wide</option>
                {Array.from({ length: 15 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>District {d}</option>
                ))}
              </select>
            </div>
            <div className={styles.exportField}>
              <label className={styles.exportLabel}>Frequency</label>
              <select
                className={styles.select}
                value={genFrequency}
                onChange={(e) => setGenFrequency(e.target.value as "weekly" | "monthly")}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <div className={styles.muted} style={{ marginTop: 6, fontSize: 12 }}>
                This runs the saved shared prompt once for the selected launched city /
                district, then queues drafts for the no-place recipients currently routed
                to that shared group.
              </div>
            </div>
            <div className={styles.exportField}>
              <label className={styles.exportLabel}>Model</label>
              <select
                className={styles.select}
                value={genModelKey}
                onChange={(e) => setGenModelKey(e.target.value)}
                disabled={generating}
                title="Seymour model used to generate this shared newsletter. Defaults to the saved weekly-newsletter model."
              >
                <option value="">Default (saved weekly model / AGENT_MODEL)</option>
                {workloadModelOptions.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name}
                  </option>
                ))}
              </select>
              <div className={styles.muted} style={{ marginTop: 6, fontSize: 12 }}>
                Only affects this one generation. To change the default used by the
                scheduled weekly job, use the Model selector above.
              </div>
            </div>
            <div className={styles.exportActions}>
              <button className={styles.secondaryBtn} onClick={() => setGenCityId(null)} disabled={generating}>
                Cancel
              </button>
              <button className={styles.primaryBtn} onClick={handleGenerate} disabled={generating}>
                {generating ? "Generating..." : "Generate shared"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExport && (
        <div className={styles.exportOverlay} onClick={() => setShowExport(false)}>
          <div className={styles.exportPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.exportTitle}>Export Newsletters</div>
            <div className={styles.exportField}>
              <label className={styles.exportLabel}>Export Type</label>
              <select
                className={styles.select}
                value={exportMode}
                onChange={(e) => setExportMode(e.target.value as "full" | "headlines")}
                style={{ width: "100%" }}
              >
                <option value="full">Full Data (with word count, summary, URL)</option>
                <option value="headlines">Headlines Only</option>
              </select>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
              {filteredBrowse.length} newsletter{filteredBrowse.length !== 1 ? "s" : ""} will be exported
            </div>
            <div className={styles.exportActions}>
              <button className={styles.secondaryBtn} onClick={() => setShowExport(false)}>Cancel</button>
              <button className={styles.primaryBtn} onClick={handleExport}>Export CSV</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Dashboard: admin review queue (pending sends)
// ===========================================================================
function geographicNewsletterScopeLabel(district: string | null | undefined): string {
  const d = (district || "0").trim() || "0";
  return d === "0" ? "Citywide" : "District level";
}

/**
 * Subscription / routing geography vs saved-place cohort.
 * ``draft_type`` personalized_* encodes district routing for per-subscriber Seymour runs;
 * only treat as "Personal place level" when ``has_saved_place`` matches the weekly pipeline.
 */
function newsletterScopeLabel(item: NewsletterPendingListItem): string {
  const dt = item.draft_type || "";
  const gm = (item.generation_mode || "").toLowerCase();

  if (dt === "shared_city_district" || gm === "shared_seymour") {
    return geographicNewsletterScopeLabel(item.district);
  }

  const isPerSubscriberSeymour =
    dt === "personalized_place" ||
    dt === "personalized_district" ||
    dt === "personalized_citywide" ||
    gm === "seymour" ||
    gm === "feed_stories";

  if (isPerSubscriberSeymour) {
    if (item.has_saved_place === true) {
      return "Personal place level";
    }
    return geographicNewsletterScopeLabel(item.district);
  }

  return dt || geographicNewsletterScopeLabel(item.district);
}

function NewsletterCustomInstructionsCell({ row }: { row: NewsletterPendingListItem }) {
  const has = Boolean(row.has_custom_instructions);
  return (
    <td
      className={styles.td}
      style={{ textAlign: "center", verticalAlign: "middle" }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={has}
        disabled
        title={
          has
            ? "Subscriber has custom newsletter instructions (profile)"
            : "No custom instructions on file for this email"
        }
        aria-label={has ? "Has custom instructions" : "No custom instructions"}
      />
    </td>
  );
}

function formatWorkloadMoneyUsd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "\u2014";
  if (n < 0.005) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

function WorkloadCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? "var(--brand-primary-faint, rgba(173,53,250,0.06))" : "var(--bg-subtle, #f9fafb)",
        border: `1px solid ${accent ? "var(--brand-primary-light, #e9c6ff)" : "var(--border-color, #e5e7eb)"}`,
        borderRadius: 6,
        padding: "8px 12px",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ? "var(--brand-primary, #ad35fa)" : "var(--text-primary)" }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{sub}</div>
    </div>
  );
}

function WaterfallRow({
  indent = 0,
  connector,
  label,
  count,
  badge,
  badgeColor,
  muted,
  children,
}: {
  indent?: number;
  connector?: "branch" | "last";
  label: ReactNode;
  count?: number | null;
  badge?: string;
  badgeColor?: string;
  muted?: boolean;
  children?: ReactNode;
}) {
  const INDENT_PX = 20;
  return (
    <div style={{ marginLeft: indent * INDENT_PX }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          fontSize: 12,
          lineHeight: 1.5,
          color: muted ? "var(--text-tertiary, #9ca3af)" : "var(--text-primary)",
        }}
      >
        {connector && (
          <span style={{ color: "var(--text-tertiary, #9ca3af)", fontFamily: "monospace", flexShrink: 0, fontSize: 11 }}>
            {connector === "branch" ? "├─" : "└─"}
          </span>
        )}
        <span style={{ fontWeight: muted ? 400 : 500 }}>{label}</span>
        {count != null && (
          <span
            style={{
              fontWeight: 700,
              fontSize: 13,
              color: muted ? "var(--text-tertiary, #9ca3af)" : "var(--text-primary)",
              minWidth: 28,
            }}
          >
            {count.toLocaleString()}
          </span>
        )}
        {badge && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.03em",
              background: `${badgeColor ?? "var(--text-tertiary, #9ca3af)"}22`,
              color: badgeColor ?? "var(--text-secondary)",
              border: `1px solid ${badgeColor ?? "var(--border-color, #e5e7eb)"}`,
              borderRadius: 3,
              padding: "1px 5px",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {badge}
          </span>
        )}
      </div>
      {children && <div style={{ marginTop: 2 }}>{children}</div>}
    </div>
  );
}

function WorkloadWaterfall({ workload }: { workload: NewsletterGenerationPreview }) {
  const ex = workload.exclusion_summary ?? {};
  const totalUsers = workload.total_active_users ?? null;
  const noAccountSub = workload.users_without_any_subscription ?? null;
  const anySubCount = ex.distinct_emails_any_city ?? null;
  const excludedLaunched = ex.excluded_from_pipeline_launched_cohort ?? 0;
  const onlyNonLaunched = ex.distinct_emails_only_non_launched_cities ?? 0;
  const totalExcluded = excludedLaunched + onlyNonLaunched;
  const inPipeline = ex.included_distinct_emails ?? (workload.total_pipeline_recipients ?? workload.total_weekly_recipients);
  const personalized = workload.personalized_recipients;
  const sharedRecipients = workload.shared_recipients;
  const sharedGroups = workload.shared_llm_calls_planned;

  const PURPLE = "var(--brand-primary, #ad35fa)";
  const BLUE = "#2563eb";
  const GREEN = "var(--green, #16a34a)";
  const GRAY = "var(--text-tertiary, #9ca3af)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* ── Main waterfall: root = newsletter subscribers ──────────── */}
      <div
        style={{
          border: "1px solid var(--border-color, #e5e7eb)",
          borderRadius: 8,
          padding: "12px 14px",
          background: "var(--bg-subtle, #f9fafb)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          Subscriber waterfall — token distribution
        </div>

        {/* Root: total subscribers */}
        <WaterfallRow
          label="Subscribers (any city, this frequency)"
          count={anySubCount}
        >
          {/* Excluded */}
          {totalExcluded > 0 && (
            <WaterfallRow
              indent={1}
              connector="branch"
              label="Excluded from this run"
              count={totalExcluded}
              badge="no email · 0 LLM"
              badgeColor={GRAY}
              muted
            >
              {onlyNonLaunched > 0 && (
                <WaterfallRow
                  indent={1}
                  connector="branch"
                  label="Only subscribed to non-launched cities"
                  count={onlyNonLaunched}
                  muted
                />
              )}
              {excludedLaunched > 0 && (
                <WaterfallRow
                  indent={1}
                  connector="last"
                  label="Subscribed to launched city but no active account"
                  count={excludedLaunched}
                  muted
                />
              )}
            </WaterfallRow>
          )}

          {/* In this run */}
          <WaterfallRow
            indent={1}
            connector="last"
            label={<strong>In this run</strong>}
            count={inPipeline}
            badge={`${workload.total_llm_calls_planned} LLM run${workload.total_llm_calls_planned !== 1 ? "s" : ""}`}
            badgeColor={GREEN}
          >
            {/* Personalized */}
            <WaterfallRow
              indent={1}
              connector="branch"
              label="Personalized email"
              count={personalized}
              badge={`${personalized} LLM run${personalized !== 1 ? "s" : ""} · 1 per subscriber`}
              badgeColor={PURPLE}
            />

            {/* Shared */}
            <WaterfallRow
              indent={1}
              connector="last"
              label="Shared email"
              count={sharedRecipients}
              badge={`${sharedGroups} LLM run${sharedGroups !== 1 ? "s" : ""} · 1 per group`}
              badgeColor={BLUE}
            >
              {workload.shared_groups_per_city.length > 0 && (
                <div style={{ marginLeft: 20, marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
                  {workload.shared_groups_per_city.map((city, ci) => {
                    const isLast = ci === workload.shared_groups_per_city.length - 1;
                    return (
                      <div key={city.city_id}>
                        <WaterfallRow
                          connector={isLast ? "last" : "branch"}
                          label={<span style={{ fontWeight: 600 }}>{city.city_name}</span>}
                          count={city.shared_recipients}
                          badge={`${city.shared_groups} group${city.shared_groups !== 1 ? "s" : ""}`}
                          badgeColor={BLUE}
                        >
                          {city.group_details && city.group_details.length > 0 && (
                            <div style={{ marginLeft: 20, display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
                              {city.group_details.map((g, gi) => {
                                const isLastGroup = gi === (city.group_details?.length ?? 0) - 1;
                                return (
                                  <WaterfallRow
                                    key={g.district}
                                    connector={isLastGroup ? "last" : "branch"}
                                    label={g.district === 0 ? "Whole city (no district)" : `District ${g.district}`}
                                    count={g.recipients}
                                    badge={`${g.recipients} recipient${g.recipients !== 1 ? "s" : ""} share 1 LLM run`}
                                    badgeColor={BLUE}
                                    muted={false}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </WaterfallRow>
                      </div>
                    );
                  })}
                </div>
              )}
            </WaterfallRow>
          </WaterfallRow>
        </WaterfallRow>
      </div>

      {/* ── Platform account context (separate callout) ─────────────── */}
      {(totalUsers != null || noAccountSub != null) && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          {totalUsers != null && (
            <span
              style={{
                background: "var(--bg-canvas, #fff)",
                border: "1px solid var(--border-color, #e5e7eb)",
                borderRadius: 5,
                padding: "4px 10px",
              }}
            >
              <strong style={{ color: "var(--text-primary)" }}>{totalUsers.toLocaleString()}</strong> active platform account{totalUsers !== 1 ? "s" : ""}
            </span>
          )}
          {noAccountSub != null && (
            <span
              style={{
                background: "var(--bg-canvas, #fff)",
                border: "1px solid var(--border-color, #e5e7eb)",
                borderRadius: 5,
                padding: "4px 10px",
              }}
            >
              <strong style={{ color: "var(--text-primary)" }}>{noAccountSub.toLocaleString()}</strong> account{noAccountSub !== 1 ? "s" : ""} with no newsletter subscription
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function NewsletterDashboardQueue({
  workloadEstimateModelKey,
  setWorkloadEstimateModelKey,
  workloadModelOptions,
  setWorkloadModelOptions,
}: {
  workloadEstimateModelKey: string;
  setWorkloadEstimateModelKey: Dispatch<SetStateAction<string>>;
  workloadModelOptions: Array<{ key: string; name: string }>;
  setWorkloadModelOptions: Dispatch<SetStateAction<Array<{ key: string; name: string }>>>;
}) {
  const { getAccessTokenSilently } = useAuth0();
  const [pending, setPending] = useState<NewsletterPendingListItem[]>([]);
  const [archive, setArchive] = useState<NewsletterPendingListItem[]>([]);
  const [directSends, setDirectSends] = useState<NewsletterSendItem[]>([]);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [runBusy, setRunBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewPublicUrl, setPreviewPublicUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Archive preview state (shared between queue archive + direct-send archive)
  // Key format: "q-{id}" for queue archive rows, "d-{id}" for direct-send rows
  const [archiveExpandedKey, setArchiveExpandedKey] = useState<string | null>(null);
  const [archivePreviewHtml, setArchivePreviewHtml] = useState<string | null>(null);
  const [archivePreviewPublicUrl, setArchivePreviewPublicUrl] = useState<string | null>(
    null
  );
  const [archivePreviewLoading, setArchivePreviewLoading] = useState(false);

  // Workload preview
  const [workload, setWorkload] = useState<NewsletterGenerationPreview | null>(null);
  const [workloadLoading, setWorkloadLoading] = useState(true);
  const [workloadOpen, setWorkloadOpen] = useState(false);
  const [workloadFrequency, setWorkloadFrequency] = useState<"weekly" | "monthly">("weekly");
  const [saveNewsletterModelBusy, setSaveNewsletterModelBusy] = useState(false);
  const previewModalOpen = expandedId !== null || archiveExpandedKey !== null;

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getAccessTokenSilently();
      const [u, a, sends] = await Promise.all([
        listNewsletterPending(token, { unsent_only: true, limit: 200 }),
        listNewsletterPending(token, { sent_only: true, limit: 200 }),
        listNewsletterSends(token, { limit: 500 }),
      ]);
      setPending(u.items);
      setArchive(a.items);
      // Show only direct system sends (not via the admin review queue) so there
      // is no duplication with the queue archive shown directly above.
      setDirectSends(sends.items.filter((s) => !s.via_queue));
      setSelected(new Set(u.items.map((x) => x.id)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load newsletter queue");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  const loadWorkload = useCallback(
    async (previewModelKeyOverride?: string) => {
      try {
        setWorkloadLoading(true);
        const token = await getAccessTokenSilently();
        const mkSource =
          previewModelKeyOverride !== undefined
            ? previewModelKeyOverride
            : workloadEstimateModelKey;
        const mk = mkSource.trim();
        const [preview, modelGroups] = await Promise.all([
          getNewsletterGenerationPreview(token, {
            frequency: workloadFrequency,
            ...(mk ? { model_key: mk } : {}),
          }),
          getAvailableModels(token).catch(() => []),
        ]);
        setWorkload(preview);
        const flat = modelGroups
          .flatMap((g) =>
            g.models.filter((m) => m.is_available).map((m) => ({ key: m.key, name: m.name }))
          )
          .sort((a, b) => a.name.localeCompare(b.name));
        if (flat.length > 0) {
          setWorkloadModelOptions(flat);
        }
      } catch {
        // Non-critical; don't toast — show fallback UI
      } finally {
        setWorkloadLoading(false);
      }
    },
    [getAccessTokenSilently, workloadFrequency, workloadEstimateModelKey]
  );

  const handleSaveWeeklyNewsletterModel = async () => {
    setSaveNewsletterModelBusy(true);
    try {
      const token = await getAccessTokenSilently();
      const res = await putNewsletterWeeklySeymourModel(workloadEstimateModelKey, token);
      const nextKey = res.newsletter_seymour_model_key ?? "";
      setWorkloadEstimateModelKey(nextKey);
      toast.success(
        res.newsletter_seymour_model_key
          ? `Weekly newsletter job will use ${res.newsletter_seymour_model_key}.`
          : "Saved: weekly job will use AGENT_MODEL (override cleared)."
      );
      await loadWorkload(nextKey);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save newsletter model");
    } finally {
      setSaveNewsletterModelBusy(false);
    }
  };

  const newsletterModelSaveMatchesServer = useMemo(() => {
    if (!workload) return true;
    const desired = workloadEstimateModelKey.trim() || null;
    const saved = workload.saved_newsletter_seymour_model_key ?? null;
    return desired === saved;
  }, [workload, workloadEstimateModelKey]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    loadWorkload();
  }, [loadWorkload]);

  useEffect(() => {
    if (!previewModalOpen) return;

    const originalOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpandedId(null);
        setPreviewHtml(null);
        setPreviewPublicUrl(null);
        setArchiveExpandedKey(null);
        setArchivePreviewHtml(null);
        setArchivePreviewPublicUrl(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewModalOpen]);

  const toggleSelect = (id: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleGenerateOnce = async () => {
    setRunBusy(true);
    try {
      const token = await getAccessTokenSilently();
      const res = await runScheduleJob(token, {
        schedule_key: "weekly_newsletter",
        queue_newsletters: true,
      });
      const jobId = (res.result as { job_id?: string })?.job_id;
      if (jobId) notifyJobCreated(jobId);
      toast.success("Weekly newsletter run started (drafts queued for review).");
      await Promise.all([loadAll(), loadWorkload()]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to start generation");
    } finally {
      setRunBusy(false);
    }
  };

  const handleSendSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) {
      toast.error("Select at least one newsletter.");
      return;
    }
    setActionBusy(true);
    try {
      const token = await getAccessTokenSilently();
      const r = await sendNewsletterPendingBatch(ids, token);
      toast.success(`Sent ${r.sent}, skipped ${r.skipped}, failed ${r.failed}.`);
      setExpandedId(null);
      setPreviewHtml(null);
      await loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeleteSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) {
      toast.error("Select at least one newsletter.");
      return;
    }
    setActionBusy(true);
    try {
      const token = await getAccessTokenSilently();
      const r = await deleteNewsletterPendingBatch(ids, token);
      toast.success(`Removed ${r.deleted} draft(s).`);
      setExpandedId(null);
      setPreviewHtml(null);
      await loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setActionBusy(false);
    }
  };

  const handleArchiveSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) {
      toast.error("Select at least one newsletter.");
      return;
    }
    setActionBusy(true);
    try {
      const token = await getAccessTokenSilently();
      const r = await archiveNewsletterPendingBatch(ids, token);
      toast.success(`Archived ${r.archived} draft(s) as unsent.`);
      setExpandedId(null);
      setPreviewHtml(null);
      setPreviewPublicUrl(null);
      await loadAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Archive failed");
    } finally {
      setActionBusy(false);
    }
  };

  const handlePreview = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      setPreviewHtml(null);
      setPreviewPublicUrl(null);
      return;
    }
    setExpandedId(id);
    setPreviewLoading(true);
    setPreviewHtml(null);
    setPreviewPublicUrl(null);
    try {
      const token = await getAccessTokenSilently();
      const d = await getNewsletterPendingDetail(id, token);
      setPreviewHtml(d.email_html || d.body_html);
      setPreviewPublicUrl(d.public_url || null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  // Archive preview: queue rows use getNewsletterPendingDetail directly;
  // direct-send rows use their pending_send_id if available.
  const handleArchivePreview = async (key: string, pendingId: number) => {
    if (archiveExpandedKey === key) {
      setArchiveExpandedKey(null);
      setArchivePreviewHtml(null);
      setArchivePreviewPublicUrl(null);
      return;
    }
    setArchiveExpandedKey(key);
    setArchivePreviewLoading(true);
    setArchivePreviewHtml(null);
    setArchivePreviewPublicUrl(null);
    try {
      const token = await getAccessTokenSilently();
      const d = await getNewsletterPendingDetail(pendingId, token);
      setArchivePreviewHtml(d.email_html || d.body_html || "(empty)");
      setArchivePreviewPublicUrl(d.public_url || null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setArchivePreviewLoading(false);
    }
  };

  const closePreviewModal = () => {
    setExpandedId(null);
    setPreviewHtml(null);
    setPreviewPublicUrl(null);
    setArchiveExpandedKey(null);
    setArchivePreviewHtml(null);
    setArchivePreviewPublicUrl(null);
  };

  return (
    <>
      <div className={styles.filtersContainer}>
        <div
          className={styles.filtersRow}
          style={{
            flexWrap: "wrap",
            alignItems: "center",
            flexDirection: "row",
            gap: 10,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 13 }}>Actions</span>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleGenerateOnce}
            disabled={runBusy}
          >
            {runBusy ? "Starting…" : "Generate newsletters (one-time)"}
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleSendSelected}
            disabled={actionBusy || selected.size === 0}
          >
            {actionBusy ? "…" : "Send selected"}
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleArchiveSelected}
            disabled={actionBusy || selected.size === 0}
          >
            Archive selected as unsent
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleDeleteSelected}
            disabled={actionBusy || selected.size === 0}
          >
            Delete selected
          </button>
          <button type="button" className={styles.linkBtn} onClick={() => setSelected(new Set(pending.map((p) => p.id)))}>
            Select all
          </button>
          <button type="button" className={styles.linkBtn} onClick={() => setSelected(new Set())}>
            Clear
          </button>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => { loadAll(); loadWorkload(); }}
            disabled={loading || workloadLoading}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* ── Workload preview strip ─────────────────────────────────── */}
      <div className={styles.tableContainer} style={{ marginBottom: 8 }}>
        <div
          className={styles.tableHeader}
          style={{
            cursor: "pointer",
            userSelect: "none",
            flexWrap: "wrap",
            gap: "8px 12px",
            alignItems: "center",
          }}
          onClick={() => setWorkloadOpen((o) => !o)}
        >
          <span className={styles.tableTitle}>
            {workloadOpen ? "▼" : "▶"} Next run workload
          </span>
          <div
            style={{ display: "flex", alignItems: "center", gap: 8 }}
            onClick={(e) => e.stopPropagation()}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Mode</span>
              <select
                className={styles.select}
                style={{ minWidth: 148, fontSize: 12 }}
                value={workloadFrequency}
                disabled={workloadLoading}
                onChange={(e) =>
                  setWorkloadFrequency(e.target.value as "weekly" | "monthly")
                }
              >
                <option value="weekly">Weekly subscribers</option>
                <option value="monthly">Monthly subscribers</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>Model</span>
              <select
                className={styles.select}
                style={{ minWidth: 200, maxWidth: 280, fontSize: 12 }}
                value={workloadEstimateModelKey}
                disabled={workloadLoading}
                onChange={(e) => setWorkloadEstimateModelKey(e.target.value)}
                title="Cost estimate uses this model. Save applies it to the weekly newsletter scheduled job."
              >
                <option value="">Default (job saved or AGENT_MODEL)</option>
                {workloadModelOptions.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.secondaryBtn}
              style={{ fontSize: 12, padding: "4px 10px" }}
              disabled={
                workloadLoading || saveNewsletterModelBusy || newsletterModelSaveMatchesServer
              }
              onClick={(e) => {
                e.stopPropagation();
                void handleSaveWeeklyNewsletterModel();
              }}
            >
              {saveNewsletterModelBusy ? "Saving…" : "Save model"}
            </button>
          </div>
          {workload && !workloadLoading && (
            <span
              className={styles.tableCount}
              style={{ marginLeft: "auto", fontWeight: 500, fontSize: 12, lineHeight: 1.4 }}
            >
              <strong style={{ fontWeight: 600 }}>{workload.personalized_llm_calls_planned}</strong>{" "}
              personalized LLM
              {workload.personalized_llm_calls_planned !== 1 ? "s" : ""}
              {" + "}
              <strong style={{ fontWeight: 600 }}>{workload.shared_llm_calls_planned}</strong>{" "}
              shared LLM
              {workload.shared_llm_calls_planned !== 1 ? "s" : ""}
              {" = "}
              <strong style={{ fontWeight: 600 }}>{workload.total_llm_calls_planned}</strong> total
              {" · "}
              {workload.total_pipeline_recipients ?? workload.total_weekly_recipients} recipient
              {(workload.total_pipeline_recipients ?? workload.total_weekly_recipients) !== 1
                ? "s"
                : ""}
              {workload.cost_estimate_usd ? (
                <>
                  {" · "}
                  {formatWorkloadMoneyUsd(workload.cost_estimate_usd.total_estimated_usd)}
                </>
              ) : null}
            </span>
          )}
          {workloadLoading && (
            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-secondary)" }}>Loading…</span>
          )}
        </div>
        {workloadOpen && (
          <div style={{ padding: "12px 16px" }}>
            {workloadLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Loader size="sm" color="dark" />
                <span style={{ fontSize: 13 }}>Loading workload…</span>
              </div>
            ) : workload ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* ── Token waterfall ───────────────────────────────────── */}
                <WorkloadWaterfall workload={workload} />
                {/* ── Cost estimate ─────────────────────────────────────── */}
                {workload.cost_estimate_usd ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-color, #e5e7eb)",
                      borderRadius: 6,
                      padding: "10px 12px",
                      background: "var(--brand-primary-faint, rgba(173,53,250,0.04))",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                      Cost estimate
                    </div>
                    {formatWorkloadMoneyUsd(workload.cost_estimate_usd.personalized_estimated_usd)} for{" "}
                    {workload.cost_estimate_usd.personalized_seymour_sessions} personalized session
                    {workload.cost_estimate_usd.personalized_seymour_sessions !== 1 ? "s" : ""}
                    {" · "}
                    {formatWorkloadMoneyUsd(workload.cost_estimate_usd.shared_estimated_usd)} for{" "}
                    {workload.cost_estimate_usd.shared_seymour_sessions} shared session
                    {workload.cost_estimate_usd.shared_seymour_sessions !== 1 ? "s" : ""}
                    {" · "}
                    <strong style={{ color: "var(--text-primary)" }}>
                      Total {formatWorkloadMoneyUsd(workload.cost_estimate_usd.total_estimated_usd)}
                    </strong>
                    {". "}
                    <span className={styles.muted}>{workload.cost_estimate_usd.methodology ?? "$2.00 flat per session."}</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Could not load workload preview.
              </span>
            )}
          </div>
        )}
      </div>

      <div className={styles.tableContainer}>
        <div
          className={styles.tableHeader}
          style={{ cursor: "pointer", userSelect: "none" }}
          onClick={() => setPendingOpen((o) => !o)}
        >
          <span className={styles.tableTitle}>
            {pendingOpen ? "\u25BC" : "\u25B6"} Pending review
          </span>
          <span className={styles.tableCount}>
            {loading ? "(loading...)" : `(${pending.length})`}
          </span>
        </div>
        {pendingOpen && (loading ? (
          <div
            style={{
              padding: 24,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Loader size="sm" color="dark" />
            <span>Loading queue…</span>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th} style={{ width: 36 }} aria-label="Select" />
                  <th className={styles.th}>Recipient</th>
                  <th className={styles.th}>Scope</th>
                  <th
                    className={styles.th}
                    style={{ maxWidth: 88, fontSize: 11, lineHeight: 1.25, textAlign: "center" }}
                    title="Whether the subscriber has custom newsletter instructions on file"
                  >
                    Custom instructions
                  </th>
                  <th className={styles.th}>Subject</th>
                  <th className={styles.th}>Mode</th>
                  <th className={styles.th}>Cost</th>
                  <th className={styles.th} />
                </tr>
              </thead>
              <tbody>
                {pending.length === 0 && (
                  <tr>
                    <td colSpan={8} className={styles.emptyState}>
                      No newsletters waiting for review. Use Generate newsletters (one-time) to build and queue drafts.
                    </td>
                  </tr>
                )}
                {pending.map((row) => (
                  <Fragment key={row.id}>
                    <tr className={styles.rowClickable}>
                      <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={(e) => toggleSelect(row.id, e.target.checked)}
                          aria-label={`Select ${row.recipient_email}`}
                        />
                      </td>
                      <td className={styles.td}>{emailUsername(row.recipient_email)}</td>
                      <td className={styles.td} style={{ fontSize: 12 }}>
                        {newsletterScopeLabel(row)}
                      </td>
                      <NewsletterCustomInstructionsCell row={row} />
                      <td className={styles.td}>
                        <div className={styles.headline}>{row.subject || "\u2014"}</div>
                      </td>
                      <td className={styles.td} style={{ fontSize: 12 }}>
                        {row.generation_mode}
                      </td>
                      <td className={styles.td}>
                        <LlmUsagePill usage={row.llm_usage} />
                      </td>
                      <td className={styles.td}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {row.session_id?.trim() && (
                            <JobSessionDebugLink sessionId={row.session_id} />
                          )}
                          <button
                            type="button"
                            className={styles.linkBtn}
                            onClick={() => handlePreview(row.id)}
                          >
                            {expandedId === row.id ? "Hide" : "Preview"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className={styles.tableContainer}>
        <div
          className={styles.tableHeader}
          style={{ cursor: "pointer", userSelect: "none" }}
          onClick={() => setArchiveOpen((o) => !o)}
          aria-expanded={archiveOpen}
        >
          <span className={styles.tableTitle}>
            {archiveOpen ? "\u25BC" : "\u25B6"} Archive
          </span>
          <span className={styles.tableCount}>
            ({archive.length + directSends.length})
          </span>
        </div>
        {archiveOpen && (
          <>
            {archive.length === 0 && directSends.length === 0 && (
              <div className={styles.emptyState} style={{ padding: "24px 16px" }}>
                No items in archive yet.
              </div>
            )}
            {archive.length > 0 && (
              <>
                <div
                  className={styles.tableCount}
                  style={{
                    display: "block",
                    padding: "10px 16px 6px",
                    fontWeight: 600,
                  }}
                >
                  Admin queue archive
                  <span style={{ fontWeight: 400 }}> ({archive.length})</span>
                </div>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.th}>Status</th>
                        <th className={styles.th}>Recipient</th>
                        <th className={styles.th}>Scope</th>
                        <th
                          className={styles.th}
                          style={{ maxWidth: 88, fontSize: 11, lineHeight: 1.25, textAlign: "center" }}
                          title="Whether the subscriber has custom newsletter instructions on file"
                        >
                          Custom instructions
                        </th>
                        <th className={styles.th}>Subject</th>
                        <th className={styles.th}>Cost</th>
                        <th className={styles.th} />
                      </tr>
                    </thead>
                    <tbody>
                      {archive.map((row) => {
                        const aKey = `q-${row.id}`;
                        const isExpanded = archiveExpandedKey === aKey;
                        return (
                          <Fragment key={`a-${row.id}`}>
                            <tr>
                              <td className={styles.td} style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                                {row.sent_at
                                  ? `Sent ${formatDate(row.sent_at)}`
                                  : `Unsent${row.archived_at ? `, archived ${formatDate(row.archived_at)}` : ""}`}
                              </td>
                              <td className={styles.td}>{emailUsername(row.recipient_email)}</td>
                              <td className={styles.td} style={{ fontSize: 12 }}>
                                {newsletterScopeLabel(row)}
                              </td>
                              <NewsletterCustomInstructionsCell row={row} />
                              <td className={styles.td}>
                                <div className={styles.headline}>{row.subject || "\u2014"}</div>
                              </td>
                              <td className={styles.td}>
                                <LlmUsagePill usage={row.llm_usage} />
                              </td>
                              <td className={styles.td} style={{ whiteSpace: "nowrap" }}>
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <button
                                    type="button"
                                    className={styles.linkBtn}
                                    onClick={() => handleArchivePreview(aKey, row.id)}
                                  >
                                    {isExpanded ? "Hide" : "Preview"}
                                  </button>
                                  {row.session_id?.trim() && (
                                    <JobSessionDebugLink sessionId={row.session_id} />
                                  )}
                                </div>
                              </td>
                            </tr>
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {directSends.length > 0 && (
              <>
                <div
                  className={styles.tableCount}
                  style={{
                    display: "block",
                    padding: archive.length > 0 ? "14px 16px 6px" : "10px 16px 6px",
                    fontWeight: 600,
                    borderTop:
                      archive.length > 0 ? "1px solid var(--border-primary)" : undefined,
                  }}
                >
                  Sent directly by system
                  <span style={{ fontWeight: 400 }}> ({directSends.length})</span>
                </div>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.th}>Sent</th>
                        <th className={styles.th}>Recipient</th>
                        <th className={styles.th}>Source</th>
                        <th className={styles.th}>Subject</th>
                        <th className={styles.th}>Status</th>
                        <th className={styles.th}>Cost</th>
                        <th className={styles.th} />
                      </tr>
                    </thead>
                    <tbody>
                      {directSends.map((row) => {
                        const dKey = `d-${row.id}`;
                        const isExpanded = archiveExpandedKey === dKey;
                        return (
                          <Fragment key={`ds-${row.id}`}>
                            <tr>
                              <td className={styles.td} style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                                {row.sent_at ? formatDate(row.sent_at) : "\u2014"}
                              </td>
                              <td className={styles.td}>{emailUsername(row.to_email)}</td>
                              <td className={styles.td} style={{ fontSize: 12 }}>{row.source}</td>
                              <td className={styles.td}>
                                <div className={styles.headline}>{row.subject || "\u2014"}</div>
                              </td>
                              <td className={styles.td} style={{ fontSize: 12 }}>
                                <span style={{ color: row.status === "sent" ? "var(--green, #16a34a)" : "var(--text-secondary)" }}>
                                  {row.status}
                                </span>
                              </td>
                              <td className={styles.td}>
                                <LlmUsagePill usage={row.llm_usage} />
                              </td>
                              <td className={styles.td} style={{ whiteSpace: "nowrap" }}>
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  {typeof row.pending_send_id === "number" && (
                                    <button
                                      type="button"
                                      className={styles.linkBtn}
                                      onClick={() => handleArchivePreview(dKey, row.pending_send_id as number)}
                                    >
                                      {isExpanded ? "Hide" : "Preview"}
                                    </button>
                                  )}
                                  {row.session_id?.trim() && (
                                    <JobSessionDebugLink sessionId={row.session_id} />
                                  )}
                                </div>
                              </td>
                            </tr>
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
      {previewModalOpen && (
        <div
          className={styles.emailPreviewOverlay}
          onClick={closePreviewModal}
          role="presentation"
        >
          <div
            className={styles.emailPreviewModal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Newsletter email preview"
          >
            <div className={styles.emailPreviewHeader}>
              <div className={styles.emailPreviewTitle}>Email preview</div>
              <div className={styles.emailPreviewActions}>
                {(previewPublicUrl || archivePreviewPublicUrl) && (
                  <a
                    href={previewPublicUrl || archivePreviewPublicUrl || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.secondaryBtn}
                  >
                    Open permalink
                  </a>
                )}
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={closePreviewModal}
                >
                  Close
                </button>
              </div>
            </div>
            <div className={styles.emailPreviewBody}>
              {previewLoading || archivePreviewLoading ? (
                <div className={styles.emailPreviewEmpty}>
                  <Loader size="sm" color="dark" />
                  <span>Loading body…</span>
                </div>
              ) : (
                <div className={styles.emailPreviewFrame}>
                  {previewHtml || archivePreviewHtml ? (
                    <div className={styles.emailPreviewContent}>
                      <div
                        dangerouslySetInnerHTML={{
                          __html: previewHtml || archivePreviewHtml || "",
                        }}
                      />
                    </div>
                  ) : (
                    <div className={styles.emailPreviewEmpty}>
                      <span className={styles.muted}>No body.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ===========================================================================
// Dashboard Tab
// ===========================================================================
function DashboardTab({
  stats,
  cityStatuses,
  editionsByCityId,
  expandedCityId,
  workloadEstimateModelKey,
  setWorkloadEstimateModelKey,
  workloadModelOptions,
  setWorkloadModelOptions,
  onToggleExpand,
  onGenerate,
}: {
  stats: { totalNewsletters: number; citiesWithNewsletters: number; thisWeek: number; avgWords: number; totalCities: number };
  cityStatuses: CityNewsletterStatus[];
  editionsByCityId: Record<number, NewsletterEditionAdminItem[]>;
  expandedCityId: number | null;
  workloadEstimateModelKey: string;
  setWorkloadEstimateModelKey: Dispatch<SetStateAction<string>>;
  workloadModelOptions: Array<{ key: string; name: string }>;
  setWorkloadModelOptions: Dispatch<SetStateAction<Array<{ key: string; name: string }>>>;
  onToggleExpand: (id: number) => void;
  onGenerate: (cityId: number) => void;
}) {
  return (
    <>
      <NewsletterDashboardQueue
        workloadEstimateModelKey={workloadEstimateModelKey}
        setWorkloadEstimateModelKey={setWorkloadEstimateModelKey}
        workloadModelOptions={workloadModelOptions}
        setWorkloadModelOptions={setWorkloadModelOptions}
      />
      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Newsletters</div>
          <div className={styles.statValue}>{stats.totalNewsletters}</div>
          <div className={styles.statSub}>across {stats.totalCities} launched cities</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Cities with Newsletters</div>
          <div className={styles.statValue}>{stats.citiesWithNewsletters}</div>
          <div className={styles.statSub}>of {stats.totalCities} launched</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>This Week</div>
          <div className={styles.statValue}>{stats.thisWeek}</div>
          <div className={styles.statSub}>newsletters generated</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Avg Word Count</div>
          <div className={styles.statValue}>{stats.avgWords.toLocaleString()}</div>
          <div className={styles.statSub}>per newsletter</div>
        </div>
      </div>

      {/* City Status Table */}
      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <div>
            <span className={styles.tableTitle}>Launched Cities </span>
            <span className={styles.tableCount}>({cityStatuses.length})</span>
          </div>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}></th>
                <th className={styles.th}>City</th>
                <th className={styles.th}>State</th>
                <th className={styles.th}>Newsletters</th>
                <th
                  className={styles.th}
                  title="Stored shared newsletter editions (public permalinks) for this city"
                >
                  Shared editions
                </th>
                <th className={styles.th}>Last Generated</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Districts</th>
                <th className={styles.th} style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cityStatuses.length === 0 && (
                <tr>
                  <td colSpan={9} className={styles.emptyState}>
                    No launched cities found
                  </td>
                </tr>
              )}
              {cityStatuses.map((cs) => {
                const fb = freshnessBadge(cs.latestDate);
                const isExpanded = expandedCityId === cs.city.city_id;
                return (
                  <CityRow
                    key={cs.city.city_id}
                    cs={cs}
                    editions={editionsByCityId[cs.city.city_id] ?? []}
                    fb={fb}
                    isExpanded={isExpanded}
                    onToggle={() => onToggleExpand(cs.city.city_id)}
                    onGenerate={() => onGenerate(cs.city.city_id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function CityRow({
  cs,
  editions,
  fb,
  isExpanded,
  onToggle,
  onGenerate,
}: {
  cs: CityNewsletterStatus;
  editions: NewsletterEditionAdminItem[];
  fb: { cls: string; label: string };
  isExpanded: boolean;
  onToggle: () => void;
  onGenerate: () => void;
}) {
  // Group reports by district
  const byDistrict = useMemo(() => {
    const map = new Map<string, NewsletterReport[]>();
    for (const r of cs.reports) {
      const key = r.district || "0";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [cs.reports]);

  return (
    <>
      <tr className={styles.rowClickable} onClick={onToggle}>
        <td className={styles.td} style={{ width: 30, textAlign: "center" }}>
          <span style={{ fontSize: 10 }}>{isExpanded ? "\u25BC" : "\u25B6"}</span>
        </td>
        <td className={styles.td} style={{ fontWeight: 500 }}>{cs.city.city_name}</td>
        <td className={styles.td}>{cs.city.state || "\u2014"}</td>
        <td className={styles.td}>{cs.totalCount}</td>
        <td className={styles.td} title="Expand row for permalink details">
          {editions.length > 0 ? (
            <span style={{ fontWeight: 600 }}>{editions.length}</span>
          ) : (
            <span className={styles.muted}>0</span>
          )}
        </td>
        <td className={styles.td}>{formatDate(cs.latestDate)}</td>
        <td className={styles.td}>
          <span className={`${styles.badge} ${fb.cls}`}>{fb.label}</span>
        </td>
        <td className={styles.td}>{cs.districts.size || "\u2014"}</td>
        <td className={styles.td}>
          <button
            className={styles.secondaryBtn}
            onClick={(e) => { e.stopPropagation(); onGenerate(); }}
            style={{ fontSize: 12, padding: "4px 10px" }}
            title="Generate one shared Seymour newsletter for this launched city/district and queue drafts for all current no-place recipients in that shared group."
          >
            Generate shared
          </button>
        </td>
      </tr>
      {isExpanded && (cs.reports.length > 0 || editions.length > 0) && (
        <tr className={styles.expandedRow}>
          <td colSpan={9} className={styles.td} style={{ padding: 0 }}>
            <div className={styles.expandedContent}>
              {cs.reports.length > 0 && (
                <table className={styles.subTable}>
                  <thead>
                    <tr>
                      <th>District</th>
                      <th>Title</th>
                      <th>Frequency</th>
                      <th>Date</th>
                      <th>Words</th>
                      <th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(byDistrict.entries())
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .flatMap(([district, reports]) =>
                        reports.map((r) => (
                          <tr key={r.id}>
                            <td>{district === "0" || !district ? "City-wide" : `District ${district}`}</td>
                            <td style={{ maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {r.title || "\u2014"}
                            </td>
                            <td>{r.frequency || "\u2014"}</td>
                            <td>{formatDate(r.created_at)}</td>
                            <td>{countWords(r.final_report_html).toLocaleString()}</td>
                            <td>
                              <a href={r.public_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-primary)" }}>
                                View
                              </a>
                            </td>
                          </tr>
                        ))
                      )}
                  </tbody>
                </table>
              )}
              {editions.length > 0 && (
                <div style={{ marginTop: cs.reports.length > 0 ? 14 : 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                    Shared edition permalinks
                  </div>
                  <table className={styles.subTable}>
                    <thead>
                      <tr>
                        <th>District</th>
                        <th>Generated</th>
                        <th>Edition Date</th>
                        <th>Headline</th>
                        <th>Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editions.map((ed) => {
                        const scope = ed.district > 0 ? `District ${ed.district}` : "City-wide";
                        const href =
                          ed.city_slug && ed.short_hash
                            ? `/c/${ed.city_slug}/newsletter/${ed.short_hash}`
                            : null;
                        return (
                          <tr key={`edition-${ed.id}`}>
                            <td>{scope}</td>
                            <td>{formatDate(ed.created_at)}</td>
                            <td>{formatDate(ed.edition_date)}</td>
                            <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {ed.summary_headline || "\u2014"}
                            </td>
                            <td>
                              {href ? (
                                <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-primary)" }}>
                                  View
                                </a>
                              ) : (
                                "\u2014"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
      {isExpanded && cs.reports.length === 0 && editions.length === 0 && (
        <tr className={styles.expandedRow}>
          <td colSpan={9} className={styles.td}>
            <div className={styles.expandedContent}>
              <span className={styles.muted}>No newsletters generated yet for this city.</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ===========================================================================
// Browse Tab
// ===========================================================================
function BrowseTab({
  cities,
  cityStatuses,
  browseCity,
  browseDistrict,
  browseFrequency,
  browseSearch,
  browseLoading,
  pagedReports,
  filteredCount,
  page,
  totalPages,
  expandedReportId,
  onCityChange,
  onDistrictChange,
  onFrequencyChange,
  onSearchChange,
  onPageChange,
  onToggleExpand,
  onExport,
}: {
  cities: CityListItem[];
  cityStatuses: CityNewsletterStatus[];
  browseCity: number | null;
  browseDistrict: string;
  browseFrequency: string;
  browseSearch: string;
  browseLoading: boolean;
  pagedReports: NewsletterReport[];
  filteredCount: number;
  page: number;
  totalPages: number;
  expandedReportId: number | null;
  onCityChange: (id: number | null) => void;
  onDistrictChange: (v: string) => void;
  onFrequencyChange: (v: string) => void;
  onSearchChange: (v: string) => void;
  onPageChange: (p: number) => void;
  onToggleExpand: (id: number) => void;
  onExport: () => void;
}) {
  // Get launched city IDs for the dropdown
  const launchedCities = useMemo(
    () => cityStatuses.map((cs) => cs.city).sort((a, b) => a.city_name.localeCompare(b.city_name)),
    [cityStatuses]
  );

  return (
    <>
      <div className={styles.filtersContainer}>
        <div className={styles.filtersRow}>
          <select
            className={styles.select}
            value={browseCity ?? ""}
            onChange={(e) => onCityChange(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Select City...</option>
            {launchedCities.map((c) => (
              <option key={c.city_id} value={c.city_id}>
                {c.city_name}{c.state ? `, ${c.state}` : ""}
              </option>
            ))}
          </select>

          <select
            className={styles.select}
            value={browseDistrict}
            onChange={(e) => onDistrictChange(e.target.value)}
          >
            <option value="">All Districts</option>
            <option value="0">City-wide</option>
            {Array.from({ length: 15 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>District {d}</option>
            ))}
          </select>

          <select
            className={styles.select}
            value={browseFrequency}
            onChange={(e) => onFrequencyChange(e.target.value)}
          >
            <option value="">All Frequencies</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>

          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search titles..."
            value={browseSearch}
            onChange={(e) => onSearchChange(e.target.value)}
          />

          {browseCity && filteredCount > 0 && (
            <button className={styles.secondaryBtn} onClick={onExport}>
              Export
            </button>
          )}
        </div>
      </div>

      {!browseCity && (
        <div className={styles.emptyState}>Select a city to browse newsletters</div>
      )}

      {browseLoading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0", gap: 10 }}>
          <Loader size="sm" color="dark" />
          <span>Loading...</span>
        </div>
      )}

      {browseCity && !browseLoading && (
        <div className={styles.tableContainer}>
          <div className={styles.tableHeader}>
            <div>
              <span className={styles.tableTitle}>Newsletters </span>
              <span className={styles.tableCount}>({filteredCount})</span>
            </div>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Date</th>
                  <th className={styles.th}>Title</th>
                  <th className={styles.th}>District</th>
                  <th className={styles.th}>Frequency</th>
                  <th className={styles.th} style={{ textAlign: "right" }}>Words</th>
                  <th className={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedReports.length === 0 && (
                  <tr>
                    <td colSpan={6} className={styles.emptyState}>
                      No newsletters found
                    </td>
                  </tr>
                )}
                {pagedReports.map((r) => {
                  const isExpanded = expandedReportId === r.id;
                  const wc = countWords(r.final_report_html);
                  return (
                    <BrowseRow
                      key={r.id}
                      report={r}
                      wordCount={wc}
                      isExpanded={isExpanded}
                      onToggle={() => onToggleExpand(r.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                className={styles.secondaryBtn}
                disabled={page === 0}
                onClick={() => onPageChange(page - 1)}
                style={{ fontSize: 12, padding: "4px 10px" }}
              >
                Prev
              </button>
              <span className={styles.pageInfo}>
                Page {page + 1} of {totalPages}
              </span>
              <button
                className={styles.secondaryBtn}
                disabled={page >= totalPages - 1}
                onClick={() => onPageChange(page + 1)}
                style={{ fontSize: 12, padding: "4px 10px" }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function BrowseRow({
  report,
  wordCount,
  isExpanded,
  onToggle,
}: {
  report: NewsletterReport;
  wordCount: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className={styles.rowClickable} onClick={onToggle}>
        <td className={styles.td}>{formatDate(report.created_at)}</td>
        <td className={styles.td}>
          <div className={styles.headline}>{report.title || "\u2014"}</div>
        </td>
        <td className={styles.td}>
          {!report.district || report.district === "0" ? "City-wide" : `District ${report.district}`}
        </td>
        <td className={styles.td}>
          {report.frequency ? (
            <span className={`${styles.badge} ${styles.badgeBlue}`}>{report.frequency}</span>
          ) : "\u2014"}
        </td>
        <td className={styles.td} style={{ textAlign: "right" }}>
          {wordCount > 0 ? wordCount.toLocaleString() : "\u2014"}
        </td>
        <td className={styles.td}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className={styles.linkBtn} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
              {isExpanded ? "Hide" : "Preview"}
            </button>
            <a
              href={report.public_url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkBtn}
              onClick={(e) => e.stopPropagation()}
            >
              Open
            </a>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className={styles.expandedRow}>
          <td colSpan={6} style={{ padding: 0 }}>
            {report.session_id?.trim() ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px 0" }}>
                <JobSessionDebugLink sessionId={report.session_id} />
              </div>
            ) : null}
            {report.final_report_html ? (
              <div
                className={styles.previewPanel}
                dangerouslySetInnerHTML={{ __html: report.final_report_html }}
              />
            ) : (
              <div className={styles.previewPanel}>
                <span className={styles.muted}>
                  {report.social_summary || "No content available for preview."}
                </span>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ===========================================================================
// Prompts Tab — now handled by NewsletterAdminPromptsTab component
// Retained only for TypeScript to not error; the function below is dead code
// kept so the old props don't become dangling references.
// ===========================================================================
function _PromptsTabUnused({
  cities,
  promptFrequency,
  promptText,
  promptDirty,
  testCityId,
  testDistrict,
  testGenerating,
  testResult,
  onFrequencyChange,
  onTextChange,
  onSave,
  onReset,
  onTestCityChange,
  onTestDistrictChange,
  onTestGenerate,
}: {
  cities: CityListItem[];
  promptFrequency: "weekly" | "monthly";
  promptText: string;
  promptDirty: boolean;
  testCityId: number | null;
  testDistrict: string;
  testGenerating: boolean;
  testResult: string | null;
  onFrequencyChange: (f: "weekly" | "monthly") => void;
  onTextChange: (t: string) => void;
  onSave: () => void;
  onReset: () => void;
  onTestCityChange: (id: number | null) => void;
  onTestDistrictChange: (v: string) => void;
  onTestGenerate: () => void;
}) {
  return (
    <>
      <div className={styles.infoBox}>
        Edit the prompt templates used when generating newsletters. Use placeholders: <code>{"{city_name}"}</code>, <code>{"{district_label}"}</code>, <code>{"{frequency}"}</code>. Prompts are saved to your browser (localStorage) for now.
      </div>

      <div className={styles.promptEditor}>
        {/* Frequency tabs */}
        <div className={styles.promptTabs}>
          <button
            className={`${styles.promptTab} ${promptFrequency === "weekly" ? styles.promptTabActive : ""}`}
            onClick={() => onFrequencyChange("weekly")}
          >
            Weekly
          </button>
          <button
            className={`${styles.promptTab} ${promptFrequency === "monthly" ? styles.promptTabActive : ""}`}
            onClick={() => onFrequencyChange("monthly")}
          >
            Monthly
          </button>
        </div>

        <textarea
          className={styles.textarea}
          value={promptText}
          onChange={(e) => onTextChange(e.target.value)}
          rows={12}
        />

        <div className={styles.promptActions}>
          <button className={styles.primaryBtn} onClick={onSave} disabled={!promptDirty}>
            Save Prompt
          </button>
          <button className={styles.secondaryBtn} onClick={onReset}>
            Reset to Default
          </button>
        </div>
      </div>

      {/* Test panel */}
      <div className={styles.testPanel}>
        <div className={styles.testPanelTitle}>Test Generate</div>
        <div className={styles.testPanelRow}>
          <div className={styles.testField}>
            <label className={styles.testLabel}>City</label>
            <select
              className={styles.select}
              value={testCityId ?? ""}
              onChange={(e) => onTestCityChange(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Select City...</option>
              {cities
                .filter((c) => c.is_active !== false)
                .sort((a, b) => a.city_name.localeCompare(b.city_name))
                .map((c) => (
                  <option key={c.city_id} value={c.city_id}>
                    {c.city_name}{c.state ? `, ${c.state}` : ""}
                  </option>
                ))}
            </select>
          </div>
          <div className={styles.testField}>
            <label className={styles.testLabel}>District</label>
            <select
              className={styles.select}
              value={testDistrict}
              onChange={(e) => onTestDistrictChange(e.target.value)}
            >
              <option value="0">City-wide</option>
              {Array.from({ length: 15 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={String(d)}>District {d}</option>
              ))}
            </select>
          </div>
          <div className={styles.testField} style={{ alignSelf: "flex-end" }}>
            <button
              className={styles.primaryBtn}
              onClick={onTestGenerate}
              disabled={!testCityId || testGenerating}
            >
              {testGenerating ? "Generating..." : "Test"}
            </button>
          </div>
        </div>

        {testGenerating && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0" }}>
            <Loader size="sm" color="dark" />
            <span>Generating test newsletter (this may take a minute)...</span>
          </div>
        )}

        {testResult && !testGenerating && (
          <div
            className={styles.previewPanel}
            dangerouslySetInnerHTML={{ __html: testResult }}
          />
        )}
      </div>
    </>
  );
}

// ===========================================================================
// Subscribers Tab — now handled by NewsletterAdminSubscribersTab component
// ===========================================================================
function _SubscribersTabUnused({ cityStatuses }: { cityStatuses: CityNewsletterStatus[] }) {
  return (
    <>
      <div className={styles.infoBox}>
        Newsletter subscriptions are managed separately from user accounts. Users can unsubscribe from newsletters
        while keeping their login active. Subscription preferences are stored in each user&apos;s communication preferences
        and can be changed from their profile settings or via the unsubscribe link in each email.
      </div>

      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <div>
            <span className={styles.tableTitle}>Cities with Newsletters </span>
            <span className={styles.tableCount}>
              ({cityStatuses.filter((cs) => cs.totalCount > 0).length})
            </span>
          </div>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>City</th>
                <th className={styles.th}>State</th>
                <th className={styles.th}>Newsletters</th>
                <th className={styles.th}>Districts Covered</th>
                <th className={styles.th}>Last Generated</th>
              </tr>
            </thead>
            <tbody>
              {cityStatuses
                .filter((cs) => cs.totalCount > 0)
                .map((cs) => (
                  <tr key={cs.city.city_id}>
                    <td className={styles.td} style={{ fontWeight: 500 }}>{cs.city.city_name}</td>
                    <td className={styles.td}>{cs.city.state || "\u2014"}</td>
                    <td className={styles.td}>{cs.totalCount}</td>
                    <td className={styles.td}>
                      {cs.districts.size > 0
                        ? Array.from(cs.districts).sort((a, b) => Number(a) - Number(b)).map((d) =>
                            d === "0" ? "City-wide" : `D${d}`
                          ).join(", ")
                        : "\u2014"}
                    </td>
                    <td className={styles.td}>{formatDate(cs.latestDate)}</td>
                  </tr>
                ))}
              {cityStatuses.filter((cs) => cs.totalCount > 0).length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.emptyState}>
                    No cities have newsletters yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
