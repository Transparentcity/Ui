"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listCities,
  listNewsletterReports,
  generateSampleNewsletter,
  createResearch,
  type CityListItem,
  type NewsletterReport,
  type CreateResearchRequest,
} from "@/lib/apiClient";
import {
  listPublicCitiesForSitemap,
  type PublicCitySitemapItem,
} from "@/lib/publicApiClient";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import Loader from "@/components/Loader";
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
  const [generating, setGenerating] = useState(false);

  // -----------------------------------------------------------------------
  // Load initial data
  // -----------------------------------------------------------------------
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();

      const [citiesList, publicList] = await Promise.all([
        listCities(token),
        listPublicCitiesForSitemap(),
      ]);

      setCities(citiesList);
      setPublicCities(publicList);

      // Build a set of launched city IDs
      const launchedIds = new Set(
        publicList.filter((c) => c.is_launched).map((c) => c.id)
      );

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
      const city = cities.find((c) => c.city_id === genCityId);
      const cityName = city?.city_name || "Unknown";
      const districtLabel = genDistrict === "0" ? "city-wide" : `District ${genDistrict}`;

      // Check for saved prompt
      const savedPrompt = getPromptFromStorage(genFrequency);
      const defaultPrompt = genFrequency === "weekly" ? DEFAULT_WEEKLY_PROMPT : DEFAULT_MONTHLY_PROMPT;
      const template = savedPrompt || defaultPrompt;
      const prompt = resolvePrompt(template, cityName, districtLabel, genFrequency);

      const payload: CreateResearchRequest = {
        prompt,
        city_id: genCityId,
        district: genDistrict === "0" ? null : genDistrict,
        one_shot: true,
        model_key: "gpt-5.1",
        enable_web_search: true,
        is_newsletter: true,
        newsletter_frequency: genFrequency,
      };

      const response = await createResearch(payload, token);
      if (response.job_id) {
        notifyJobCreated(response.job_id);
      }
      setGenCityId(null);
      // Refresh data
      loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to generate newsletter");
    } finally {
      setGenerating(false);
    }
  }, [genCityId, genDistrict, genFrequency, cities, getAccessTokenSilently, loadData]);

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
          expandedCityId={expandedCityId}
          onToggleExpand={(id) => setExpandedCityId(expandedCityId === id ? null : id)}
          onGenerate={(cityId) => { setGenCityId(cityId); }}
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

      {/* Prompts Tab */}
      {activeTab === "prompts" && (
        <PromptsTab
          cities={cities}
          promptFrequency={promptFrequency}
          promptText={promptText}
          promptDirty={promptDirty}
          testCityId={testCityId}
          testDistrict={testDistrict}
          testGenerating={testGenerating}
          testResult={testResult}
          onFrequencyChange={setPromptFrequency}
          onTextChange={(t) => { setPromptText(t); setPromptDirty(true); }}
          onSave={handleSavePrompt}
          onReset={handleResetPrompt}
          onTestCityChange={setTestCityId}
          onTestDistrictChange={setTestDistrict}
          onTestGenerate={handleTestGenerate}
        />
      )}

      {/* Subscribers Tab */}
      {activeTab === "subscribers" && (
        <SubscribersTab cityStatuses={cityStatuses} />
      )}

      {/* Generate Modal */}
      {genCityId !== null && (
        <div className={styles.exportOverlay} onClick={() => !generating && setGenCityId(null)}>
          <div className={styles.exportPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.exportTitle}>Generate Newsletter</div>
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
            </div>
            <div className={styles.exportActions}>
              <button className={styles.secondaryBtn} onClick={() => setGenCityId(null)} disabled={generating}>
                Cancel
              </button>
              <button className={styles.primaryBtn} onClick={handleGenerate} disabled={generating}>
                {generating ? "Generating..." : "Generate"}
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
// Dashboard Tab
// ===========================================================================
function DashboardTab({
  stats,
  cityStatuses,
  expandedCityId,
  onToggleExpand,
  onGenerate,
}: {
  stats: { totalNewsletters: number; citiesWithNewsletters: number; thisWeek: number; avgWords: number; totalCities: number };
  cityStatuses: CityNewsletterStatus[];
  expandedCityId: number | null;
  onToggleExpand: (id: number) => void;
  onGenerate: (cityId: number) => void;
}) {
  return (
    <>
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
                <th className={styles.th}>Last Generated</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Districts</th>
                <th className={styles.th} style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cityStatuses.length === 0 && (
                <tr>
                  <td colSpan={8} className={styles.emptyState}>
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
  fb,
  isExpanded,
  onToggle,
  onGenerate,
}: {
  cs: CityNewsletterStatus;
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
          >
            Generate
          </button>
        </td>
      </tr>
      {isExpanded && cs.reports.length > 0 && (
        <tr className={styles.expandedRow}>
          <td colSpan={8} className={styles.td} style={{ padding: 0 }}>
            <div className={styles.expandedContent}>
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
            </div>
          </td>
        </tr>
      )}
      {isExpanded && cs.reports.length === 0 && (
        <tr className={styles.expandedRow}>
          <td colSpan={8} className={styles.td}>
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
      {isExpanded && report.final_report_html && (
        <tr className={styles.expandedRow}>
          <td colSpan={6} style={{ padding: 0 }}>
            <div
              className={styles.previewPanel}
              dangerouslySetInnerHTML={{ __html: report.final_report_html }}
            />
          </td>
        </tr>
      )}
      {isExpanded && !report.final_report_html && (
        <tr className={styles.expandedRow}>
          <td colSpan={6} style={{ padding: 0 }}>
            <div className={styles.previewPanel}>
              <span className={styles.muted}>
                {report.social_summary || "No content available for preview."}
              </span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ===========================================================================
// Prompts Tab
// ===========================================================================
function PromptsTab({
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
// Subscribers Tab
// ===========================================================================
function SubscribersTab({ cityStatuses }: { cityStatuses: CityNewsletterStatus[] }) {
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
