"use client";

import { useAuth0 } from "@auth0/auth0-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  adminGenerateSharedNewsletter,
  adminGenerateUnifiedNewsletterForCity,
  adminQueueNewsletterPendingForUser,
  adminQueueUnifiedNewsletterForUser,
  listCities,
  generateSampleNewsletter,
  listNewsletterPending,
  listNewsletterSends,
  getNewsletterPendingDetail,
  sendNewsletterPendingBatch,
  deleteNewsletterPendingBatch,
  archiveNewsletterPendingBatch,
  runScheduleJob,
  typeaheadAdminUsers,
  getAvailableModels,
  type CityListItem,
  type NewsletterPendingListItem,
  type NewsletterPendingSelection,
  type NewsletterSendItem,
} from "@/lib/apiClient";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import Loader from "@/components/Loader";
import JobSessionDebugLink from "@/components/JobSessionDebugLink";
import NewsletterAdminSubscribersTab from "@/components/NewsletterAdminSubscribersTab";
import NewsletterAdminPromptsTab from "@/components/NewsletterAdminPromptsTab";
import NewsletterAdminLibraryTab from "@/components/NewsletterAdminLibraryTab";
import NewsletterAdminMetricsTab from "@/components/NewsletterAdminMetricsTab";
import styles from "./NewsletterAdmin.module.css";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
type TabId = "dashboard" | "prompts" | "subscribers" | "library" | "metrics";

const TABS: { id: TabId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "prompts", label: "Prompts" },
  { id: "subscribers", label: "Subscribers" },
  { id: "library", label: "Workbench" },
  { id: "metrics", label: "Metrics" },
];

const RECENT_SENDS_PAGE_SIZE = 20;

type QueuePanelTab = "pending" | "recent";

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

  // Prompts tab
  const [promptFrequency, setPromptFrequency] = useState<"weekly" | "monthly">("weekly");
  const [promptText, setPromptText] = useState("");
  const [promptDirty, setPromptDirty] = useState(false);
  const [testCityId, setTestCityId] = useState<number | null>(null);
  const [testDistrict, setTestDistrict] = useState("0");
  const [testGenerating, setTestGenerating] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Generate modal
  const [genCityId, setGenCityId] = useState<number | null>(null);
  const [genDistrict, setGenDistrict] = useState("0");
  const [genFrequency, setGenFrequency] = useState<"weekly" | "monthly">("weekly");
  const [genModelKey, setGenModelKey] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [workloadModelOptions, setWorkloadModelOptions] = useState<
    Array<{ key: string; name: string; isDefault: boolean }>
  >([]);

  useEffect(() => {
    getAccessTokenSilently()
      .then((token) => getAvailableModels(token))
      .then((modelGroups) => {
        const flat = modelGroups
          .flatMap((g) =>
            g.models
              .filter((m) => m.is_available)
              .map((m) => ({ key: m.key, name: m.name, isDefault: !!m.is_default }))
          )
          .sort((a, b) => a.name.localeCompare(b.name));
        if (flat.length > 0) setWorkloadModelOptions(flat);
      })
      .catch(() => {});
  }, [getAccessTokenSilently]);

  // -----------------------------------------------------------------------
  // Load initial data
  // -----------------------------------------------------------------------
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();
      const citiesList = await listCities(token);
      setCities(citiesList);
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
      {activeTab === "dashboard" && <DashboardTab cities={cities} />}

      {activeTab === "prompts" && <NewsletterAdminPromptsTab />}

      {activeTab === "subscribers" && <NewsletterAdminSubscribersTab />}

      {activeTab === "library" && <NewsletterAdminLibraryTab cities={cities} />}

      {activeTab === "metrics" && <NewsletterAdminMetricsTab />}

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
                    {m.isDefault ? " (default)" : ""}
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

const SELECTION_SLOT_LABELS: Record<string, string> = {
  place_lead: "Home place",
  anomaly_or_event: "Anomaly / event",
  district: "District",
  citywide: "Citywide",
};

function formatSelectionScore(finalScore: number, personalizationScore: number, multiplier?: number): string {
  const base = `${Math.round(finalScore)} \u2192 ${Math.round(personalizationScore)}`;
  if (multiplier != null && Math.abs(multiplier - 1) > 0.001) {
    return `${base} (\u00d7${multiplier.toFixed(2)})`;
  }
  return base;
}

type SelectionCandidateFilter = "all" | "chosen" | "not_chosen";

/**
 * Admin-only story-selection panel shown above the email preview for
 * unified-pipeline drafts: full scored candidate list, the slate handed to
 * the LLM, and which stories the submitted plan actually used.
 */
function NewsletterSelectionPanel({
  selection,
}: {
  selection: NewsletterPendingSelection;
}) {
  // Open by default so admins see why a story led without an extra click.
  const [open, setOpen] = useState(true);
  const [candidateFilter, setCandidateFilter] =
    useState<SelectionCandidateFilter>("all");
  const ps = selection.pool_stats || {};
  const candidates = selection.scored_candidates || [];
  const usedCount = selection.sections.filter((s) => s.used).length;
  const recipientDistrict =
    selection.recipient_district != null && selection.recipient_district > 0
      ? selection.recipient_district
      : null;

  const chosenCandidates = candidates.filter(
    (c) => Boolean(c.selected_slot) || Boolean(c.used),
  );
  const notChosenCandidates = candidates.filter(
    (c) => !c.selected_slot && !c.used,
  );
  const visibleCandidates =
    candidateFilter === "chosen"
      ? chosenCandidates
      : candidateFilter === "not_chosen"
        ? notChosenCandidates
        : candidates;

  const summaryParts: string[] = [];
  if (recipientDistrict != null) {
    summaryParts.push(`recipient D${recipientDistrict}`);
  }
  if (ps.candidates_total != null) {
    summaryParts.push(`${ps.candidates_total} candidates scored`);
  }
  if (candidates.length > 0) {
    summaryParts.push(
      `${chosenCandidates.length} chosen · ${notChosenCandidates.length} not chosen`,
    );
  }
  if (ps.deduped_recent) {
    summaryParts.push(`${ps.deduped_recent} skipped (sent recently)`);
  }
  summaryParts.push(`slate of ${selection.sections.length}`);
  summaryParts.push(`${usedCount} used in email`);

  const poolBreakdown = [
    ["place", ps.place_pool],
    ["anomaly/event", ps.anomaly_pool],
    ["district", ps.district_pool],
    ["citywide", ps.citywide_pool],
  ]
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");

  const filterBtn = (id: SelectionCandidateFilter, label: string) => {
    const active = candidateFilter === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setCandidateFilter(id)}
        style={{
          padding: "2px 8px",
          fontSize: 11,
          borderRadius: 4,
          border: active
            ? "1px solid var(--text-primary, #111)"
            : "1px solid var(--border-primary, #e5e7eb)",
          background: active
            ? "var(--bg-primary, #fff)"
            : "transparent",
          cursor: "pointer",
          fontWeight: active ? 700 : 400,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      style={{
        margin: "0 0 12px",
        border: "1px solid var(--border-primary, #e5e7eb)",
        borderRadius: 8,
        background: "var(--bg-secondary, #f9fafb)",
        fontSize: 12,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          width: "100%",
          padding: "8px 12px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontSize: 12,
        }}
      >
        <span style={{ fontWeight: 700 }}>
          {open ? "\u25BC" : "\u25B6"} Story selection
        </span>
        <span style={{ color: "var(--text-secondary, #6b7280)" }}>
          {summaryParts.join(" \u2192 ")}
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 12px 10px" }}>
          {poolBreakdown && (
            <div
              style={{
                color: "var(--text-secondary, #6b7280)",
                margin: "0 0 8px",
              }}
            >
              Candidate pools: {poolBreakdown}
            </div>
          )}

          {candidates.length > 0 ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                  margin: "0 0 4px",
                }}
              >
                <div style={{ fontWeight: 700 }}>Scored candidates</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {filterBtn("all", `All (${candidates.length})`)}
                  {filterBtn("chosen", `Chosen (${chosenCandidates.length})`)}
                  {filterBtn(
                    "not_chosen",
                    `Not chosen (${notChosenCandidates.length})`,
                  )}
                </div>
              </div>
              <div
                style={{
                  color: "var(--text-secondary, #6b7280)",
                  margin: "0 0 6px",
                }}
              >
                Ranked by personalization score. Selected-for-slate rows first.
                Score = story final \u2192 after geo/interest multiplier.
                {selection.scored_candidates_source === "live"
                  ? " List re-scored live (this draft predated full candidate storage)."
                  : null}
              </div>
              <div
                style={{
                  maxHeight: 420,
                  overflow: "auto",
                  marginBottom: 12,
                  border: "1px solid var(--border-primary, #e5e7eb)",
                  borderRadius: 6,
                  background: "var(--bg-primary, #fff)",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr
                      style={{
                        textAlign: "left",
                        color: "var(--text-secondary, #6b7280)",
                        position: "sticky",
                        top: 0,
                        background: "var(--bg-primary, #fff)",
                      }}
                    >
                      <th style={{ padding: "6px 8px 4px", fontWeight: 600 }}>#</th>
                      <th style={{ padding: "6px 8px 4px", fontWeight: 600 }}>Story</th>
                      <th style={{ padding: "6px 8px 4px", fontWeight: 600 }}>D</th>
                      <th style={{ padding: "6px 8px 4px", fontWeight: 600 }}>Type</th>
                      <th style={{ padding: "6px 8px 4px", fontWeight: 600 }}>Eligible</th>
                      <th style={{ padding: "6px 8px 4px", fontWeight: 600 }}>Score</th>
                      <th style={{ padding: "6px 8px 4px", fontWeight: 600 }}>Slate</th>
                      <th style={{ padding: "6px 8px 4px", fontWeight: 600 }}>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCandidates.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          style={{
                            padding: "10px 8px",
                            color: "var(--text-secondary, #6b7280)",
                          }}
                        >
                          No stories in this filter.
                        </td>
                      </tr>
                    ) : (
                      visibleCandidates.map((c, idx) => {
                        const isRecipientDistrict =
                          recipientDistrict != null &&
                          c.district === recipientDistrict;
                        const rowOpacity = c.deduped
                          ? 0.45
                          : c.selected_slot || c.used
                            ? 1
                            : 0.7;
                        return (
                          <tr
                            key={`${c.story_id}-${idx}`}
                            style={{
                              borderTop:
                                "1px solid var(--border-primary, #e5e7eb)",
                              opacity: rowOpacity,
                              background:
                                c.used_as === "lead"
                                  ? "rgba(34, 197, 94, 0.12)"
                                  : c.selected_slot
                                    ? "rgba(59, 130, 246, 0.08)"
                                    : undefined,
                            }}
                          >
                            <td
                              style={{
                                padding: "4px 8px",
                                color: "var(--text-secondary, #9ca3af)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {idx + 1}
                            </td>
                            <td style={{ padding: "4px 8px" }}>
                              {c.short_hash ? (
                                <a
                                  href={`/s/${c.short_hash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    color: "inherit",
                                    textDecoration: "underline",
                                  }}
                                >
                                  {c.headline || `Story ${c.story_id}`}
                                </a>
                              ) : (
                                c.headline || `Story ${c.story_id}`
                              )}
                              <span
                                style={{
                                  color: "var(--text-secondary, #9ca3af)",
                                  marginLeft: 6,
                                }}
                              >
                                #{c.story_id}
                              </span>
                              {c.deduped ? (
                                <span
                                  style={{
                                    marginLeft: 6,
                                    color: "var(--text-secondary, #9ca3af)",
                                    fontSize: 11,
                                  }}
                                >
                                  (sent recently)
                                </span>
                              ) : null}
                            </td>
                            <td
                              style={{
                                padding: "4px 8px",
                                whiteSpace: "nowrap",
                                fontWeight: isRecipientDistrict ? 700 : 400,
                              }}
                              title={
                                isRecipientDistrict
                                  ? "Matches recipient district"
                                  : undefined
                              }
                            >
                              {c.district > 0 ? c.district : "\u2014"}
                            </td>
                            <td
                              style={{
                                padding: "4px 8px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {c.story_type || "\u2014"}
                            </td>
                            <td
                              style={{
                                padding: "4px 8px",
                                whiteSpace: "nowrap",
                                fontSize: 11,
                              }}
                            >
                              {(c.eligible_slots || [])
                                .map((s) => SELECTION_SLOT_LABELS[s] || s)
                                .join(", ") || "\u2014"}
                            </td>
                            <td
                              style={{
                                padding: "4px 8px",
                                whiteSpace: "nowrap",
                              }}
                              title="final score → personalized score (× multiplier)"
                            >
                              {formatSelectionScore(
                                c.final_score,
                                c.personalization_score,
                                c.multiplier,
                              )}
                            </td>
                            <td
                              style={{
                                padding: "4px 8px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {c.selected_slot
                                ? SELECTION_SLOT_LABELS[c.selected_slot] ||
                                  c.selected_slot
                                : "\u2014"}
                            </td>
                            <td
                              style={{
                                padding: "4px 8px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {c.used_as === "lead"
                                ? "LEAD"
                                : c.used_as === "card"
                                  ? "Card"
                                  : "\u2014"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div
              style={{
                color: "var(--text-secondary, #6b7280)",
                margin: "0 0 8px",
              }}
            >
              Full scored list unavailable for this draft. Slate only:
            </div>
          )}

          <div style={{ fontWeight: 700, margin: "0 0 4px" }}>
            Slate handed to LLM
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  color: "var(--text-secondary, #6b7280)",
                }}
              >
                <th style={{ padding: "2px 8px 4px 0", fontWeight: 600 }}>Slot</th>
                <th style={{ padding: "2px 8px 4px 0", fontWeight: 600 }}>Story</th>
                <th style={{ padding: "2px 8px 4px 0", fontWeight: 600 }}>D</th>
                <th style={{ padding: "2px 8px 4px 0", fontWeight: 600 }}>Type</th>
                <th style={{ padding: "2px 8px 4px 0", fontWeight: 600 }}>Score</th>
                <th style={{ padding: "2px 0 4px 0", fontWeight: 600 }}>Used</th>
              </tr>
            </thead>
            <tbody>
              {selection.sections.map((s) => (
                <tr
                  key={s.story_id}
                  style={{
                    borderTop: "1px solid var(--border-primary, #e5e7eb)",
                    opacity: s.used ? 1 : 0.55,
                  }}
                >
                  <td style={{ padding: "4px 8px 4px 0", whiteSpace: "nowrap" }}>
                    {SELECTION_SLOT_LABELS[s.slot] || s.slot}
                  </td>
                  <td style={{ padding: "4px 8px 4px 0" }}>
                    {s.short_hash ? (
                      <a
                        href={`/s/${s.short_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "inherit", textDecoration: "underline" }}
                      >
                        {s.headline || `Story ${s.story_id}`}
                      </a>
                    ) : (
                      s.headline || `Story ${s.story_id}`
                    )}
                    <span
                      style={{
                        color: "var(--text-secondary, #9ca3af)",
                        marginLeft: 6,
                      }}
                    >
                      #{s.story_id}
                    </span>
                  </td>
                  <td style={{ padding: "4px 8px 4px 0", whiteSpace: "nowrap" }}>
                    {s.district != null && s.district > 0 ? s.district : "\u2014"}
                  </td>
                  <td style={{ padding: "4px 8px 4px 0", whiteSpace: "nowrap" }}>
                    {s.story_type || "\u2014"}
                  </td>
                  <td
                    style={{ padding: "4px 8px 4px 0", whiteSpace: "nowrap" }}
                    title="final score → personalized score"
                  >
                    {formatSelectionScore(s.final_score, s.personalization_score)}
                  </td>
                  <td style={{ padding: "4px 0", whiteSpace: "nowrap" }}>
                    {s.used_as === "lead"
                      ? "LEAD"
                      : s.used_as === "card"
                        ? "Card"
                        : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type SearchSuggestion =
  | { kind: "city"; cityId: number; label: string; sublabel: string }
  | { kind: "user"; userId: number; email: string; label: string; sublabel: string };

type SearchSelection =
  | { kind: "city"; cityId: number; label: string }
  | { kind: "user"; userId: number; email: string; label: string };

function NewsletterDashboardQueue({ cities }: { cities: CityListItem[] }) {
  const { getAccessTokenSilently } = useAuth0();
  const [pending, setPending] = useState<NewsletterPendingListItem[]>([]);
  const [pendingOpen, setPendingOpen] = useState(true);
  const [queueTab, setQueueTab] = useState<QueuePanelTab>("pending");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [runBusy, setRunBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewPublicUrl, setPreviewPublicUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSelection, setPreviewSelection] =
    useState<NewsletterPendingSelection | null>(null);

  // Recent sends (paginated)
  const [recentSends, setRecentSends] = useState<NewsletterSendItem[]>([]);
  const [recentSendsPage, setRecentSendsPage] = useState(1);
  const [recentSendsPages, setRecentSendsPages] = useState(1);
  const [recentSendsTotal, setRecentSendsTotal] = useState(0);
  const [recentSendsLoading, setRecentSendsLoading] = useState(false);
  const [recentSendsLoaded, setRecentSendsLoaded] = useState(false);

  // Search (replaces archive)
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [searchSelection, setSearchSelection] = useState<SearchSelection | null>(null);
  const [searchResults, setSearchResults] = useState<NewsletterPendingListItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchExpandedId, setSearchExpandedId] = useState<number | null>(null);
  const [searchPreviewHtml, setSearchPreviewHtml] = useState<string | null>(null);
  const [searchPreviewPublicUrl, setSearchPreviewPublicUrl] = useState<string | null>(null);
  const [searchPreviewLoading, setSearchPreviewLoading] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // Generate from search selection
  const [searchGenDistrict, setSearchGenDistrict] = useState("0");
  const [searchGenFrequency, setSearchGenFrequency] = useState<"weekly" | "monthly">("weekly");
  const [searchGenCityId, setSearchGenCityId] = useState<number | null>(null);
  const [searchGenModelKey, setSearchGenModelKey] = useState("");
  const [searchGenModelOptions, setSearchGenModelOptions] = useState<
    Array<{ key: string; name: string }>
  >([]);
  const [searchGenBusy, setSearchGenBusy] = useState(false);

  const previewModalOpen = expandedId !== null || searchExpandedId !== null;

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getAccessTokenSilently();
      const u = await listNewsletterPending(token, { unsent_only: true, limit: 200 });
      setPending(u.items);
      setSelected(new Set(u.items.map((x) => x.id)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load newsletter queue");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  const loadRecentSends = useCallback(async (page: number) => {
    try {
      setRecentSendsLoading(true);
      const token = await getAccessTokenSilently();
      const res = await listNewsletterSends(token, {
        page,
        page_size: RECENT_SENDS_PAGE_SIZE,
      });
      setRecentSends(res.items);
      setRecentSendsPage(res.page);
      setRecentSendsPages(res.pages);
      setRecentSendsTotal(res.total);
      setRecentSendsLoaded(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load recent sends");
    } finally {
      setRecentSendsLoading(false);
    }
  }, [getAccessTokenSilently]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (queueTab === "recent" && pendingOpen) {
      void loadRecentSends(recentSendsPage);
    }
  }, [queueTab, pendingOpen, recentSendsPage, loadRecentSends]);

  useEffect(() => {
    getAccessTokenSilently()
      .then((token) => getAvailableModels(token))
      .then((modelGroups) => {
        const flat = modelGroups
          .flatMap((g) =>
            g.models.filter((m) => m.is_available).map((m) => ({ key: m.key, name: m.name }))
          )
          .sort((a, b) => a.name.localeCompare(b.name));
        if (flat.length > 0) setSearchGenModelOptions(flat);
      })
      .catch(() => {});
  }, [getAccessTokenSilently]);

  useEffect(() => {
    if (searchSelection?.kind === "city") {
      setSearchGenCityId(searchSelection.cityId);
    }
  }, [searchSelection]);

  // Close suggestion dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!searchWrapRef.current?.contains(e.target as Node)) {
        setSuggestionsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Debounced typeahead: cities (local) + users (API)
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2 || searchSelection) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    let cancelled = false;
    setSuggestionsLoading(true);
    const timer = window.setTimeout(async () => {
      const ql = q.toLowerCase();
      const cityHits: SearchSuggestion[] = cities
        .filter(
          (c) =>
            c.city_name.toLowerCase().includes(ql) ||
            (c.state || "").toLowerCase().includes(ql)
        )
        .slice(0, 6)
        .map((c) => ({
          kind: "city" as const,
          cityId: c.city_id,
          label: c.city_name,
          sublabel: c.state ? `${c.state} · city` : "city",
        }));

      let userHits: SearchSuggestion[] = [];
      try {
        const token = await getAccessTokenSilently();
        const users = await typeaheadAdminUsers(q, token);
        if (!cancelled) {
          userHits = users.slice(0, 8).map((u) => ({
            kind: "user" as const,
            userId: u.id,
            email: u.email,
            label: u.full_name?.trim() || u.email,
            sublabel: u.full_name?.trim() ? u.email : "user",
          }));
        }
      } catch {
        // Non-fatal — still show city matches
      }

      if (!cancelled) {
        setSuggestions([...cityHits, ...userHits]);
        setSuggestionsOpen(true);
        setSuggestionsLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, searchSelection, cities, getAccessTokenSilently]);

  const loadSearchResults = useCallback(
    async (sel: SearchSelection) => {
      setSearchLoading(true);
      setSearchResults([]);
      setSearchExpandedId(null);
      setSearchPreviewHtml(null);
      setSearchPreviewPublicUrl(null);
      try {
        const token = await getAccessTokenSilently();
        const res = await listNewsletterPending(token, {
          unsent_only: false,
          limit: 100,
          ...(sel.kind === "city"
            ? { city_id: sel.cityId }
            : { q: sel.email }),
        });
        setSearchResults(res.items);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Search failed");
      } finally {
        setSearchLoading(false);
      }
    },
    [getAccessTokenSilently]
  );

  const handleSelectSuggestion = (s: SearchSuggestion) => {
    const sel: SearchSelection =
      s.kind === "city"
        ? { kind: "city", cityId: s.cityId, label: s.label }
        : { kind: "user", userId: s.userId, email: s.email, label: s.label };
    setSearchSelection(sel);
    setSearchQuery(s.kind === "city" ? s.label : s.email);
    setSearchGenDistrict("0");
    setSearchGenFrequency("weekly");
    if (s.kind === "city") {
      setSearchGenCityId(s.cityId);
    } else {
      setSearchGenCityId(null);
    }
    setSuggestionsOpen(false);
    setSuggestions([]);
    void loadSearchResults(sel);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchSelection(null);
    setSearchResults([]);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setSearchExpandedId(null);
    setSearchPreviewHtml(null);
    setSearchPreviewPublicUrl(null);
    setSearchGenCityId(null);
    setSearchGenDistrict("0");
    setSearchGenFrequency("weekly");
  };

  const handleSearchGenerateLegacy = async () => {
    if (!searchSelection) return;
    setSearchGenBusy(true);
    try {
      const token = await getAccessTokenSilently();
      const modelKey = searchGenModelKey.trim() || null;

      if (searchSelection.kind === "city") {
        const res = await adminGenerateSharedNewsletter(
          {
            city_id: searchSelection.cityId,
            district: searchGenDistrict === "0" ? null : Number(searchGenDistrict),
            frequency: searchGenFrequency,
            model_key: modelKey,
          },
          token
        );
        if (res.job_id) notifyJobCreated(res.job_id);
        toast.success(
          "Legacy shared newsletter generation queued. Drafts will appear in Pending review when ready."
        );
      } else {
        if (!searchGenCityId) {
          toast.error("Select a city for this user's newsletter.");
          return;
        }
        const res = await adminQueueNewsletterPendingForUser(
          searchSelection.userId,
          {
            city_id: searchGenCityId,
            district: searchGenDistrict === "0" ? null : Number(searchGenDistrict),
            frequency: searchGenFrequency,
            generation_mode: "seymour",
            ...(modelKey ? { seymour_model_key: modelKey } : {}),
          },
          token
        );
        if (res.job_id) notifyJobCreated(res.job_id);
        toast.success(
          "Legacy newsletter generation queued. It will appear in Pending review when ready."
        );
      }
      await Promise.all([loadAll(), loadSearchResults(searchSelection)]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not queue legacy newsletter");
    } finally {
      setSearchGenBusy(false);
    }
  };

  const handleSearchGenerateUnified = async () => {
    if (!searchSelection) return;
    setSearchGenBusy(true);
    try {
      const token = await getAccessTokenSilently();
      const modelKey = searchGenModelKey.trim() || null;

      if (searchSelection.kind === "city") {
        const res = await adminGenerateUnifiedNewsletterForCity(
          {
            city_id: searchSelection.cityId,
            model_key: modelKey,
          },
          token
        );
        if (res.job_id) notifyJobCreated(res.job_id);
        toast.success(
          "Unified draft assembly queued for this city. Check Pending review when jobs complete."
        );
      } else {
        if (!searchGenCityId) {
          toast.error("Select a city for this user's newsletter.");
          return;
        }
        const res = await adminQueueUnifiedNewsletterForUser(
          searchSelection.userId,
          {
            city_id: searchGenCityId,
            district: searchGenDistrict === "0" ? null : Number(searchGenDistrict),
            frequency: searchGenFrequency,
            ...(modelKey ? { seymour_model_key: modelKey } : {}),
          },
          token
        );
        if (res.job_id) notifyJobCreated(res.job_id);
        toast.success(
          `Unified draft queued (campaign: ${res.campaign}). Check Pending review when ready.`
        );
      }
      await Promise.all([loadAll(), loadSearchResults(searchSelection)]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not queue unified newsletter");
    } finally {
      setSearchGenBusy(false);
    }
  };

  useEffect(() => {
    if (!previewModalOpen) return;

    const originalOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpandedId(null);
        setPreviewHtml(null);
        setPreviewPublicUrl(null);
        setSearchExpandedId(null);
        setSearchPreviewHtml(null);
        setSearchPreviewPublicUrl(null);
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
      await loadAll();
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
      if (recentSendsLoaded || queueTab === "recent") {
        setRecentSendsPage(1);
        await loadRecentSends(1);
      }
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

  const openPreview = async (
    id: number,
    currentId: number | null,
    setId: (v: number | null) => void,
    setHtml: (v: string | null) => void,
    setUrl: (v: string | null) => void,
    setBusy: (v: boolean) => void
  ) => {
    if (currentId === id) {
      setId(null);
      setHtml(null);
      setUrl(null);
      setPreviewSelection(null);
      return;
    }
    setId(id);
    setBusy(true);
    setHtml(null);
    setUrl(null);
    setPreviewSelection(null);
    try {
      const token = await getAccessTokenSilently();
      const d = await getNewsletterPendingDetail(id, token);
      setHtml(d.email_html || d.body_html);
      setUrl(d.public_url || null);
      setPreviewSelection(d.selection ?? null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = (id: number) =>
    openPreview(
      id,
      expandedId,
      setExpandedId,
      setPreviewHtml,
      setPreviewPublicUrl,
      setPreviewLoading
    );

  const handleSearchPreview = (id: number) =>
    openPreview(
      id,
      searchExpandedId,
      setSearchExpandedId,
      setSearchPreviewHtml,
      setSearchPreviewPublicUrl,
      setSearchPreviewLoading
    );

  const closePreviewModal = () => {
    setExpandedId(null);
    setPreviewHtml(null);
    setPreviewPublicUrl(null);
    setPreviewSelection(null);
    setSearchExpandedId(null);
    setSearchPreviewHtml(null);
    setSearchPreviewPublicUrl(null);
  };

  const modelLabel = (row: NewsletterPendingListItem) =>
    row.llm_usage?.model_key?.trim() || row.generation_mode || "—";

  const statusLabel = (row: NewsletterPendingListItem) => {
    if (row.sent_at) return `Sent ${formatDate(row.sent_at)}`;
    if (row.archived_at) return `Archived ${formatDate(row.archived_at)}`;
    return "Unsent";
  };

  const cityNameById = (cityId: number | null | undefined) => {
    if (cityId == null) return "—";
    const city = cities.find((c) => c.city_id === cityId);
    return city?.city_name || `City ${cityId}`;
  };

  const panelTitle =
    queueTab === "recent" ? "Recent sends" : "Pending review";
  const panelCount =
    queueTab === "recent"
      ? recentSendsLoading && !recentSendsLoaded
        ? "(loading...)"
        : `(${recentSendsTotal})`
      : loading
        ? "(loading...)"
        : `(${pending.length})`;

  return (
    <>
      <div className={styles.tableContainer}>
        <div
          className={styles.tableHeader}
          style={{ cursor: "pointer", userSelect: "none" }}
          onClick={() => setPendingOpen((o) => !o)}
        >
          <span className={styles.tableTitle}>
            {pendingOpen ? "\u25BC" : "\u25B6"} {panelTitle}
          </span>
          <span className={styles.tableCount}>{panelCount}</span>
        </div>

        {pendingOpen && (
          <>
            <div
              className={styles.tabs}
              style={{ marginBottom: 0, padding: "0 12px" }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={`${styles.tab} ${queueTab === "pending" ? styles.tabActive : ""}`}
                onClick={() => setQueueTab("pending")}
              >
                Pending review
                {!loading && (
                  <span className={styles.muted} style={{ marginLeft: 6 }}>
                    ({pending.length})
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`${styles.tab} ${queueTab === "recent" ? styles.tabActive : ""}`}
                onClick={() => setQueueTab("recent")}
              >
                Recent sends
                {recentSendsLoaded && (
                  <span className={styles.muted} style={{ marginLeft: 6 }}>
                    ({recentSendsTotal})
                  </span>
                )}
              </button>
            </div>

            {queueTab === "pending" && (
              <>
                <div
                  className={styles.filtersRow}
                  style={{
                    flexWrap: "wrap",
                    alignItems: "center",
                    flexDirection: "row",
                    gap: 10,
                    padding: "10px 16px 12px",
                    borderBottom: "1px solid var(--border-primary)",
                  }}
                  onClick={(e) => e.stopPropagation()}
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
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => setSelected(new Set(pending.map((p) => p.id)))}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => setSelected(new Set())}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => loadAll()}
                    disabled={loading}
                  >
                    Refresh
                  </button>
                </div>

                {loading ? (
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
                          <th className={styles.th}>Subject</th>
                          <th className={styles.th}>Model</th>
                          <th className={styles.th}>Cost</th>
                          <th className={styles.th} />
                        </tr>
                      </thead>
                      <tbody>
                        {pending.length === 0 && (
                          <tr>
                            <td colSpan={7} className={styles.emptyState}>
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
                              <td className={styles.td}>
                                <div className={styles.headline}>{row.subject || "\u2014"}</div>
                              </td>
                              <td className={styles.td} style={{ fontSize: 12 }}>
                                {modelLabel(row)}
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
                )}
              </>
            )}

            {queueTab === "recent" && (
              <>
                <div
                  className={styles.filtersRow}
                  style={{
                    flexWrap: "wrap",
                    alignItems: "center",
                    flexDirection: "row",
                    gap: 10,
                    padding: "10px 16px 12px",
                    borderBottom: "1px solid var(--border-primary)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Recent sends</span>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => void loadRecentSends(recentSendsPage)}
                    disabled={recentSendsLoading}
                  >
                    Refresh
                  </button>
                </div>

                {recentSendsLoading && !recentSendsLoaded ? (
                  <div
                    style={{
                      padding: 24,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Loader size="sm" color="dark" />
                    <span>Loading recent sends…</span>
                  </div>
                ) : (
                  <>
                    <div className={styles.tableWrapper}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th className={styles.th}>Sent</th>
                            <th className={styles.th}>Recipient</th>
                            <th className={styles.th}>City</th>
                            <th className={styles.th}>Subject</th>
                            <th className={styles.th}>Source</th>
                            <th className={styles.th}>Cost</th>
                            <th className={styles.th} />
                          </tr>
                        </thead>
                        <tbody>
                          {recentSends.length === 0 && (
                            <tr>
                              <td colSpan={7} className={styles.emptyState}>
                                No newsletter sends logged yet.
                              </td>
                            </tr>
                          )}
                          {recentSends.map((row) => {
                            const previewId =
                              typeof row.pending_send_id === "number"
                                ? row.pending_send_id
                                : null;
                            return (
                              <tr key={`send-${row.id}`}>
                                <td className={styles.td} style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                                  {formatDate(row.sent_at)}
                                </td>
                                <td className={styles.td}>{emailUsername(row.to_email)}</td>
                                <td className={styles.td} style={{ fontSize: 12 }}>
                                  {cityNameById(row.city_id)}
                                  {row.via_queue ? (
                                    <span className={styles.muted} style={{ marginLeft: 6 }}>
                                      via queue
                                    </span>
                                  ) : null}
                                </td>
                                <td className={styles.td}>
                                  <div className={styles.headline}>{row.subject || "\u2014"}</div>
                                </td>
                                <td className={styles.td} style={{ fontSize: 12 }}>
                                  {row.source || "—"}
                                </td>
                                <td className={styles.td}>
                                  <LlmUsagePill usage={row.llm_usage} />
                                </td>
                                <td className={styles.td} style={{ whiteSpace: "nowrap" }}>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 6,
                                      alignItems: "center",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    {row.session_id?.trim() && (
                                      <JobSessionDebugLink sessionId={row.session_id} />
                                    )}
                                    {previewId != null ? (
                                      <button
                                        type="button"
                                        className={styles.linkBtn}
                                        onClick={() => handlePreview(previewId)}
                                      >
                                        {expandedId === previewId ? "Hide" : "Preview"}
                                      </button>
                                    ) : !row.session_id?.trim() ? (
                                      <span className={styles.muted}>{"\u2014"}</span>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {recentSendsTotal > 0 && (
                      <div className={styles.pagination}>
                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          disabled={recentSendsPage <= 1 || recentSendsLoading}
                          onClick={() => setRecentSendsPage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </button>
                        <span className={styles.pageInfo}>
                          Page {recentSendsPage} of {recentSendsPages} ({recentSendsTotal} sends)
                        </span>
                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          disabled={
                            recentSendsPage >= recentSendsPages || recentSendsLoading
                          }
                          onClick={() =>
                            setRecentSendsPage((p) => Math.min(recentSendsPages, p + 1))
                          }
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div
        className={styles.tableContainer}
        style={{ overflow: "visible", position: "relative", zIndex: 2 }}
      >
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>Find emails</span>
          {searchSelection && (
            <span className={styles.tableCount}>
              {searchLoading
                ? "(loading…)"
                : `(${searchResults.length} for ${searchSelection.label})`}
            </span>
          )}
        </div>
          <div style={{ padding: "12px 16px 16px" }}>
          <div className={styles.autocompleteWrapper} ref={searchWrapRef}>
            <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 480 }}>
              <input
                className={styles.searchInput}
                style={{ width: "100%", maxWidth: "none" }}
                type="search"
                placeholder="Search cities, user names, or emails…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchSelection(null);
                  setSearchResults([]);
                  setSuggestionsOpen(true);
                }}
                onFocus={() => {
                  if (suggestions.length > 0) setSuggestionsOpen(true);
                }}
                aria-autocomplete="list"
                aria-expanded={suggestionsOpen}
              />
              {suggestionsOpen && (suggestionsLoading || suggestions.length > 0) && (
                <ul className={styles.autocompleteDropdown} role="listbox">
                  {suggestionsLoading && suggestions.length === 0 && (
                    <li className={styles.autocompleteOption} style={{ opacity: 0.7 }}>
                      Searching…
                    </li>
                  )}
                  {suggestions.map((s) => (
                    <li key={`${s.kind}-${s.kind === "city" ? s.cityId : s.email}`}>
                      <button
                        type="button"
                        className={styles.autocompleteOption}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                        }}
                        onClick={() => handleSelectSuggestion(s)}
                      >
                        <div style={{ fontWeight: 600 }}>{s.label}</div>
                        <div className={styles.muted} style={{ fontSize: 12 }}>
                          {s.sublabel}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {searchSelection && (
              <button
                type="button"
                className={styles.linkBtn}
                onClick={clearSearch}
              >
                Clear
              </button>
            )}
          </div>

          {searchSelection && (
            <div
              className={styles.infoBox}
              style={{ marginTop: 14, marginBottom: 0, background: "var(--bg-secondary)" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 10,
                    background:
                      searchSelection.kind === "city"
                        ? "rgba(59, 130, 246, 0.12)"
                        : "rgba(173, 53, 250, 0.12)",
                    color:
                      searchSelection.kind === "city"
                        ? "var(--blue-700, #1d4ed8)"
                        : "var(--brand-primary, #ad35fa)",
                  }}
                >
                  {searchSelection.kind === "city" ? "City" : "Individual user"}
                </span>
                <strong style={{ fontSize: 14 }}>{searchSelection.label}</strong>
                {searchSelection.kind === "user" && (
                  <span className={styles.muted} style={{ fontSize: 12 }}>
                    {searchSelection.email}
                  </span>
                )}
              </div>

              <div className={styles.testPanelRow} style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
                {searchSelection.kind === "user" && (
                  <div className={styles.testField}>
                    <label className={styles.testLabel}>City</label>
                    <select
                      className={styles.select}
                      value={searchGenCityId ?? ""}
                      onChange={(e) =>
                        setSearchGenCityId(e.target.value ? Number(e.target.value) : null)
                      }
                    >
                      <option value="">Select…</option>
                      {cities
                        .slice()
                        .sort((a, b) => a.city_name.localeCompare(b.city_name))
                        .map((c) => (
                          <option key={c.city_id} value={c.city_id}>
                            {c.city_name}
                            {c.state ? `, ${c.state}` : ""}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                <div className={styles.testField}>
                  <label className={styles.testLabel}>District</label>
                  <select
                    className={styles.select}
                    value={searchGenDistrict}
                    onChange={(e) => setSearchGenDistrict(e.target.value)}
                    disabled={searchSelection.kind === "city" && searchGenBusy}
                    title={
                      searchSelection.kind === "city"
                        ? "Legacy shared generation only; unified drafts all districts in the city"
                        : undefined
                    }
                  >
                    <option value="0">City-wide</option>
                    {Array.from({ length: 15 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={String(d)}>
                        District {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.testField}>
                  <label className={styles.testLabel}>Frequency</label>
                  <select
                    className={styles.select}
                    value={searchGenFrequency}
                    onChange={(e) =>
                      setSearchGenFrequency(e.target.value as "weekly" | "monthly")
                    }
                    disabled={searchSelection.kind === "city"}
                    title={
                      searchSelection.kind === "city"
                        ? "City legacy shared uses weekly routing; unified uses pipeline frequency"
                        : undefined
                    }
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className={styles.testField}>
                  <label className={styles.testLabel}>Seymour model</label>
                  <select
                    className={styles.select}
                    value={searchGenModelKey}
                    onChange={(e) => setSearchGenModelKey(e.target.value)}
                  >
                    <option value="">Default (server settings)</option>
                    {searchGenModelOptions.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div
                  className={styles.testField}
                  style={{ alignSelf: "flex-end", display: "flex", gap: 8, flexWrap: "wrap" }}
                >
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    disabled={
                      searchGenBusy ||
                      (searchSelection.kind === "user" && !searchGenCityId)
                    }
                    onClick={() => void handleSearchGenerateLegacy()}
                    title={
                      searchSelection.kind === "city"
                        ? "Legacy: one shared Seymour run for this city/district group"
                        : "Legacy: full Seymour research + HTML for this user"
                    }
                  >
                    {searchGenBusy ? "Queuing…" : "Generate (legacy)"}
                  </button>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    disabled={
                      searchGenBusy ||
                      (searchSelection.kind === "user" && !searchGenCityId)
                    }
                    onClick={() => void handleSearchGenerateUnified()}
                    title={
                      searchSelection.kind === "city"
                        ? "Unified: story selector + wrapper for all pipeline recipients in this city"
                        : "Unified: story selector + light LLM wrapper for this user"
                    }
                    style={{ background: "var(--brand-primary-alt, #6d28d9)" }}
                  >
                    {searchGenBusy ? "Queuing…" : "Draft (unified)"}
                  </button>
                </div>
              </div>
              <p className={styles.muted} style={{ margin: "10px 0 0", fontSize: 12 }}>
                {searchSelection.kind === "city"
                  ? "Legacy queues shared drafts for the selected district group. Unified runs draft assembly for all subscribers in this city’s pipeline."
                  : "Pick the city and district for this subscriber, then queue a personalized draft."}
              </p>
            </div>
          )}

          {searchSelection && (
            <div style={{ marginTop: 14 }}>
              {searchLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0" }}>
                  <Loader size="sm" color="dark" />
                  <span>Loading emails…</span>
                </div>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.th}>Status</th>
                        <th className={styles.th}>Recipient</th>
                        <th className={styles.th}>Subject</th>
                        <th className={styles.th}>Model</th>
                        <th className={styles.th}>Cost</th>
                        <th className={styles.th} />
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.length === 0 && (
                        <tr>
                          <td colSpan={6} className={styles.emptyState}>
                            No emails found for this selection.
                          </td>
                        </tr>
                      )}
                      {searchResults.map((row) => (
                        <tr key={`search-${row.id}`}>
                          <td className={styles.td} style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                            {statusLabel(row)}
                          </td>
                          <td className={styles.td}>{emailUsername(row.recipient_email)}</td>
                          <td className={styles.td}>
                            <div className={styles.headline}>{row.subject || "\u2014"}</div>
                          </td>
                          <td className={styles.td} style={{ fontSize: 12 }}>
                            {modelLabel(row)}
                          </td>
                          <td className={styles.td}>
                            <LlmUsagePill usage={row.llm_usage} />
                          </td>
                          <td className={styles.td} style={{ whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                              {row.session_id?.trim() && (
                                <JobSessionDebugLink sessionId={row.session_id} />
                              )}
                              <button
                                type="button"
                                className={styles.linkBtn}
                                onClick={() => handleSearchPreview(row.id)}
                              >
                                {searchExpandedId === row.id ? "Hide" : "Preview"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
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
                {(previewPublicUrl || searchPreviewPublicUrl) && (
                  <>
                    <a
                      href={previewPublicUrl || searchPreviewPublicUrl || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.secondaryBtn}
                    >
                      Open permalink
                    </a>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={async () => {
                        const url = previewPublicUrl || searchPreviewPublicUrl || "";
                        if (!url) return;
                        try {
                          await navigator.clipboard.writeText(url);
                          toast.success("Link copied");
                        } catch {
                          toast.error("Could not copy link");
                        }
                      }}
                    >
                      Copy link
                    </button>
                  </>
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
              {previewLoading || searchPreviewLoading ? (
                <div className={styles.emailPreviewEmpty}>
                  <Loader size="sm" color="dark" />
                  <span>Loading body…</span>
                </div>
              ) : (
                <div className={styles.emailPreviewFrame}>
                  {previewSelection && (
                    <NewsletterSelectionPanel selection={previewSelection} />
                  )}
                  {previewHtml || searchPreviewHtml ? (
                    <div className={styles.emailPreviewContent}>
                      <div
                        dangerouslySetInnerHTML={{
                          __html: previewHtml || searchPreviewHtml || "",
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
function DashboardTab({ cities }: { cities: CityListItem[] }) {
  return <NewsletterDashboardQueue cities={cities} />;
}
