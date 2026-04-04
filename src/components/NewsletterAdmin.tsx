"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listCities,
  listNewsletterReports,
  generateSampleNewsletter,
  createResearch,
  listNewsletterPending,
  getNewsletterPendingDetail,
  sendNewsletterPendingBatch,
  deleteNewsletterPendingBatch,
  runScheduleJob,
  getNewsletterGenerationPreview,
  listJobs,
  type CityListItem,
  type NewsletterReport,
  type CreateResearchRequest,
  type NewsletterPendingListItem,
  type NewsletterGenerationPreview,
  type Job,
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

const DEFAULT_WEEKLY_PROMPT = `Create a weekly newsletter report for {city_name} ({district_label}).

Focus on:
- Recent changes and trends in key metrics (crime, housing, permits, 311 calls, budget)
- Notable anomalies or significant shifts
- Comparative analysis (this period vs. previous period, this district vs. city-wide)
- Actionable insights for residents and officials

The report should be:
- Accessible to general public (avoid jargon)
- Data-driven with specific numbers and percentages
- Highlight both positive and concerning trends
- Include visualizations (charts, maps) where helpful
- Suggest what these trends might mean for residents

Format as a newsletter-style summary that could be emailed to subscribers interested in {district_label} news.`;

const DEFAULT_MONTHLY_PROMPT = `Create a monthly newsletter report for {city_name} ({district_label}).

Focus on:
- Month-over-month trends across all key metrics (crime, housing, permits, 311 calls, budget)
- Significant anomalies and their potential causes
- District vs. city-wide comparative analysis
- Year-over-year comparisons where relevant
- Policy impacts or notable government actions

The report should be:
- Accessible to general public (avoid jargon)
- Data-driven with specific numbers and percentages
- Provide broader context for trends (not just raw numbers)
- Include visualizations (charts, maps) where helpful
- Summarize what changed, why it matters, and what to watch next

Format as a monthly newsletter digest for subscribers interested in {district_label}.`;

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
          onGenerate={(cityId) => {
            setGenCityId(cityId);
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
// Dashboard: admin review queue (pending sends)
// ===========================================================================
function newsletterScopeLabel(item: NewsletterPendingListItem): string {
  const dt = item.draft_type || "";
  if (dt === "shared_city_district") {
    const d = item.district || "0";
    return d === "0" ? "City-wide (shared edition)" : `District ${d} (shared edition)`;
  }
  if (dt === "personalized_place") return "Place (personalized)";
  if (dt === "personalized_district") return "District (personalized)";
  if (dt === "personalized_citywide") return "City-wide (personalized)";
  return dt || "\u2014";
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

function NewsletterDashboardQueue() {
  const { getAccessTokenSilently } = useAuth0();
  const [pending, setPending] = useState<NewsletterPendingListItem[]>([]);
  const [archive, setArchive] = useState<NewsletterPendingListItem[]>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [runBusy, setRunBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Workload preview
  const [workload, setWorkload] = useState<NewsletterGenerationPreview | null>(null);
  const [workloadLoading, setWorkloadLoading] = useState(true);
  const [workloadOpen, setWorkloadOpen] = useState(false);

  // Recent weekly_newsletter jobs
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [jobsOpen, setJobsOpen] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getAccessTokenSilently();
      const [u, a] = await Promise.all([
        listNewsletterPending(token, { unsent_only: true, limit: 200 }),
        listNewsletterPending(token, { sent_only: true, limit: 200 }),
      ]);
      setPending(u.items);
      setArchive(a.items);
      setSelected(new Set(u.items.map((x) => x.id)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load newsletter queue");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  const loadWorkload = useCallback(async () => {
    try {
      setWorkloadLoading(true);
      const token = await getAccessTokenSilently();
      const [preview, jobs] = await Promise.all([
        getNewsletterGenerationPreview(token),
        listJobs(token, 20, undefined, undefined, "weekly_newsletter"),
      ]);
      setWorkload(preview);
      setRecentJobs(jobs.jobs);
    } catch {
      // Non-critical; don't toast — show fallback UI
    } finally {
      setWorkloadLoading(false);
    }
  }, [getAccessTokenSilently]);

  useEffect(() => {
    loadAll();
    loadWorkload();
  }, [loadAll, loadWorkload]);

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

  const handlePreview = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      setPreviewHtml(null);
      return;
    }
    setExpandedId(id);
    setPreviewLoading(true);
    setPreviewHtml(null);
    try {
      const token = await getAccessTokenSilently();
      const d = await getNewsletterPendingDetail(id, token);
      setPreviewHtml(d.body_html);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
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
          style={{ cursor: "pointer", userSelect: "none" }}
          onClick={() => setWorkloadOpen((o) => !o)}
        >
          <span className={styles.tableTitle}>
            {workloadOpen ? "▼" : "▶"} Next run workload
          </span>
          {workload && !workloadLoading && (
            <span className={styles.tableCount} style={{ marginLeft: 8, fontWeight: 400, fontSize: 12 }}>
              {workload.llm_edition_slots_planned} LLM call{workload.llm_edition_slots_planned !== 1 ? "s" : ""} planned
              &nbsp;·&nbsp;{workload.total_weekly_recipients} recipients
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
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Cost summary */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 8,
                }}>
                  <WorkloadCard
                    label="LLM curation calls"
                    value={workload.llm_edition_slots_planned}
                    sub="city-wide + district editions (upper bound)"
                    accent
                  />
                  <WorkloadCard
                    label="Recipients (standard)"
                    value={workload.standard_recipients}
                    sub="receive shared LLM edition, no per-recipient LLM"
                  />
                  <WorkloadCard
                    label="Recipients (personalized)"
                    value={workload.personalized_recipients}
                    sub="feed-story email — no LLM in weekly job"
                  />
                  <WorkloadCard
                    label="Excluded (no saved places)"
                    value={workload.weekly_subscribers_without_places}
                    sub="have weekly subscription but no user_places"
                  />
                </div>
                {/* Per-city breakdown */}
                {workload.llm_edition_slots_per_city.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                      Editions per city
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {workload.llm_edition_slots_per_city.map((c) => (
                        <span
                          key={c.city_id}
                          style={{
                            fontSize: 12,
                            background: "var(--bg-subtle, #f3f4f6)",
                            border: "1px solid var(--border-color, #e5e7eb)",
                            borderRadius: 4,
                            padding: "2px 8px",
                          }}
                          title={`Districts: ${c.districts.length > 0 ? c.districts.join(", ") : "none"}`}
                        >
                          {c.city_name}: {c.slots} slot{c.slots !== 1 ? "s" : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Could not load workload preview.
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Recent weekly newsletter runs ─────────────────────────── */}
      <div className={styles.tableContainer} style={{ marginBottom: 8 }}>
        <div
          className={styles.tableHeader}
          style={{ cursor: "pointer", userSelect: "none" }}
          onClick={() => setJobsOpen((o) => !o)}
        >
          <span className={styles.tableTitle}>
            {jobsOpen ? "▼" : "▶"} Recent runs
          </span>
          <span className={styles.tableCount} style={{ marginLeft: 8, fontWeight: 400, fontSize: 12 }}>
            ({recentJobs.length})
          </span>
        </div>
        {jobsOpen && (
          recentJobs.length === 0 ? (
            <div style={{ padding: "10px 16px", fontSize: 13, color: "var(--text-secondary)" }}>
              No weekly newsletter jobs found.
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Completed</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}>Recipients</th>
                    <th className={styles.th}>Queued</th>
                    <th className={styles.th}>Sent</th>
                    <th className={styles.th} title="LLM edition curation calls actually run">LLM calls</th>
                    <th className={styles.th} title="Total tokens used in edition curation (prompt + completion)">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map((job) => {
                    const r = (job.result as Record<string, any>) || {};
                    const llmCalls = r.edition_llm_calls ?? "—";
                    const totalTokens = r.edition_total_tokens != null
                      ? Number(r.edition_total_tokens).toLocaleString()
                      : "—";
                    const statusColor =
                      job.status === "completed" ? "var(--green, #16a34a)"
                      : job.status === "failed" ? "var(--red, #dc2626)"
                      : "var(--text-secondary)";
                    return (
                      <tr key={job.job_id}>
                        <td className={styles.td} style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                          {job.completed_at ? formatDate(job.completed_at) : "—"}
                        </td>
                        <td className={styles.td}>
                          <span style={{ fontSize: 12, color: statusColor, fontWeight: 500 }}>
                            {job.status}
                          </span>
                        </td>
                        <td className={styles.td} style={{ fontSize: 12 }}>
                          {r.recipients_processed ?? "—"}
                        </td>
                        <td className={styles.td} style={{ fontSize: 12 }}>
                          {r.newsletters_queued ?? "—"}
                        </td>
                        <td className={styles.td} style={{ fontSize: 12 }}>
                          {r.newsletters_sent ?? "—"}
                        </td>
                        <td className={styles.td} style={{ fontSize: 12 }}>
                          {llmCalls}
                        </td>
                        <td className={styles.td} style={{ fontSize: 12 }}>
                          {totalTokens}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>Pending review</span>
          <span className={styles.tableCount}>({pending.length})</span>
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
                  <th className={styles.th}>Mode</th>
                  <th className={styles.th} />
                </tr>
              </thead>
              <tbody>
                {pending.length === 0 && (
                  <tr>
                    <td colSpan={6} className={styles.emptyState}>
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
                      <td className={styles.td}>{row.recipient_email}</td>
                      <td className={styles.td} style={{ fontSize: 12 }}>
                        {newsletterScopeLabel(row)}
                      </td>
                      <td className={styles.td}>
                        <div className={styles.headline}>{row.subject || "\u2014"}</div>
                      </td>
                      <td className={styles.td} style={{ fontSize: 12 }}>
                        {row.generation_mode}
                      </td>
                      <td className={styles.td}>
                        <button
                          type="button"
                          className={styles.linkBtn}
                          onClick={() => handlePreview(row.id)}
                        >
                          {expandedId === row.id ? "Hide" : "Preview"}
                        </button>
                      </td>
                    </tr>
                    {expandedId === row.id && (
                      <tr className={styles.expandedRow}>
                        <td colSpan={6} style={{ padding: 0 }}>
                          {previewLoading ? (
                            <div className="tc-loading-state" style={{ padding: 16, gap: 8 }}>
                              <Loader size="sm" color="dark" />
                              <span>Loading body…</span>
                            </div>
                          ) : previewHtml ? (
                            <>
                              {row.session_id?.trim() ? (
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    padding: "8px 12px 0",
                                  }}
                                >
                                  <JobSessionDebugLink sessionId={row.session_id} />
                                </div>
                              ) : null}
                              <div
                                className={styles.previewPanel}
                                style={{ maxHeight: 360, overflow: "auto" }}
                                dangerouslySetInnerHTML={{ __html: previewHtml }}
                              />
                            </>
                          ) : (
                            <div className={styles.previewPanel}>
                              <span className={styles.muted}>No body.</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, marginBottom: 16 }}>
        <button
          type="button"
          className={styles.linkBtn}
          onClick={() => setArchiveOpen((o) => !o)}
          aria-expanded={archiveOpen}
        >
          {archiveOpen ? "\u25BC" : "\u25B6"} Archive ({archive.length})
        </button>
        {archiveOpen && (
          <div className={styles.tableWrapper} style={{ marginTop: 8 }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Sent</th>
                  <th className={styles.th}>Recipient</th>
                  <th className={styles.th}>Scope</th>
                  <th className={styles.th}>Subject</th>
                </tr>
              </thead>
              <tbody>
                {archive.length === 0 && (
                  <tr>
                    <td colSpan={4} className={styles.emptyState}>
                      No sent items in archive yet.
                    </td>
                  </tr>
                )}
                {archive.map((row) => (
                  <tr key={`a-${row.id}`}>
                    <td className={styles.td} style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                      {row.sent_at ? formatDate(row.sent_at) : "\u2014"}
                    </td>
                    <td className={styles.td}>{row.recipient_email}</td>
                    <td className={styles.td} style={{ fontSize: 12 }}>
                      {newsletterScopeLabel(row)}
                    </td>
                    <td className={styles.td}>
                      <div className={styles.headline}>{row.subject || "\u2014"}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
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
      <NewsletterDashboardQueue />
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
