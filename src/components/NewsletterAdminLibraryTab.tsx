"use client";

/**
 * Newsletter admin "Library" tab — eval playground.
 *
 * Runs eval batches over the unified newsletter pipeline with synthetic
 * personas (no real subscribers, nothing sendable):
 *   - persona range: many personas x 1 model
 *   - model pivot:   1 persona x many models
 *   - prompt sweep:  1 persona x 1 model x up to 12 prompt templates
 *   - import:        judge existing pending-send drafts
 *
 * Each cell gets deterministic stats (tokens, cost, timing, tool calls) and
 * optional LLM-as-judge scores (accuracy / relevance / cogency /
 * data_honesty / tone, with a fabrication cap).
 */

import { useAuth0 } from "@auth0/auth0-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  getAvailableModels,
  getNewsletterEvalBatch,
  getNewsletterEvalResult,
  getNewsletterPrompts,
  importNewsletterEvalSends,
  listNewsletterEvalBatches,
  listNewsletterEvalPersonas,
  listNewsletterEvalResults,
  listNewsletterPending,
  runNewsletterEvalBatch,
  type CityListItem,
  type ModelGroupInfo,
  type ModelInfo,
  type NewsletterEvalBatchListItem,
  type NewsletterEvalCell,
  type NewsletterEvalLeaderboardItem,
  type NewsletterEvalLocation,
  type NewsletterEvalPersona,
  type NewsletterEvalResultDetail,
  type NewsletterPendingListItem,
} from "@/lib/apiClient";
import {
  fetchAddressSuggestions,
  type AddressSuggestion,
} from "@/lib/locationSearchUtils";
import { knownCityHallForCity } from "@/lib/cityHallLocations";
import Loader from "@/components/Loader";
import { ScoreBadge } from "@/components/eval/JudgeScoresPanel";
import {
  TelemetryStrip,
  cellComboLabel,
  evalCellPatch,
  fmtCost,
  fmtMs,
  fmtTokens,
  formatWorkbenchModelLabel,
  maskEmails,
  overallScore,
} from "@/components/newsletter/NewsletterEvalResultDetailPane";
import { NewsletterEvalPreviewModal } from "@/components/newsletter/NewsletterEvalPreviewModal";
import styles from "./NewsletterAdmin.module.css";

const MAX_CELLS = 12;
const LEADERBOARD_PAGE_SIZE = 5;
// Rough per-cell token profile for the pre-run cost estimate (a full
// newsletter Seymour session is tool-heavy on input tokens).
const EST_INPUT_TOKENS = 130_000;
const EST_OUTPUT_TOKENS = 8_000;

/**
 * Shortlist for the Workbench run builder — current flagships + cheap
 * runners worth pivoting against. Everything else stays behind "Show all".
 * Keys that aren't available (missing API key) are simply omitted.
 */
const WORKBENCH_FEATURED_MODEL_KEYS: string[] = [
  "claude-sonnet-5",
  "claude-haiku-4.5",
  "claude-sonnet-4.6",
  "claude-opus-4.8",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5-mini",
  "gemini-3.5-flash",
  "gemini-3-flash",
  "grok-4.5",
  "deepinfra/kimi-k2.6",
  "deepinfra/kimi-k2.5",
  "deepinfra/deepseek-v4-pro",
  "deepinfra/deepseek-v4-flash",
  "deepinfra/glm-5.2",
];


function ModelChip({
  model,
  active,
  onToggle,
}: {
  model: ModelInfo;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      title={`${model.key}\nin $${model.input_price}/M · out $${model.output_price}/M`}
      onClick={onToggle}
      style={{
        fontSize: 12,
        padding: "4px 10px",
        borderRadius: 14,
        cursor: "pointer",
        border: `1px solid ${active ? "var(--brand-primary, #ad35fa)" : "var(--border-primary)"}`,
        background: active ? "var(--brand-primary-faint, rgba(173,53,250,0.09))" : "var(--bg-primary)",
        color: active ? "var(--brand-primary, #ad35fa)" : "var(--text-primary)",
        fontWeight: active ? 600 : 400,
      }}
    >
      {formatWorkbenchModelLabel(model.key)}
      {model.is_default ? " ★" : ""}
    </button>
  );
}


// ---------------------------------------------------------------------------
// Main tab component
// ---------------------------------------------------------------------------

interface CustomPersonaDraft {
  label: string;
  prompt: string;
}

interface PromptVariantDraft {
  label: string;
  template: string | null; // null = current default template
}

export default function NewsletterAdminLibraryTab({
  cities,
}: {
  cities: CityListItem[];
}) {
  const { getAccessTokenSilently } = useAuth0();

  // Reference data
  const [personas, setPersonas] = useState<NewsletterEvalPersona[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelGroups, setModelGroups] = useState<ModelGroupInfo[]>([]);
  const [showAllModels, setShowAllModels] = useState(false);
  const [defaultTemplate, setDefaultTemplate] = useState<string>("");

  // Run builder
  const [builderOpen, setBuilderOpen] = useState(false);
  const [runName, setRunName] = useState("");
  const [cityId, setCityId] = useState<number | null>(null);
  // "none" = shared-edition baseline (no persona instructions); selected by default.
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<Set<string>>(
    () => new Set(["none"])
  );
  const [customPersonas, setCustomPersonas] = useState<CustomPersonaDraft[]>([]);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [promptVariants, setPromptVariants] = useState<PromptVariantDraft[]>([
    { label: "Current template", template: null },
  ]);
  const [editingVariantIdx, setEditingVariantIdx] = useState<number | null>(null);
  const [judgeEnabled, setJudgeEnabled] = useState(true);
  const [judgeModelKey, setJudgeModelKey] = useState("");
  const [launching, setLaunching] = useState(false);

  // Custom location (optional personalization around an address)
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<AddressSuggestion[]>([]);
  const [locationSuggestLoading, setLocationSuggestLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<NewsletterEvalLocation | null>(null);
  const [refreshPlaceMetrics, setRefreshPlaceMetrics] = useState(true);
  const [resolvingCityHall, setResolvingCityHall] = useState(false);
  const locationSuggestTimeoutRef = useRef<number | null>(null);

  // Import panel
  const [importOpen, setImportOpen] = useState(false);
  const [importQuery, setImportQuery] = useState("");
  const [importItems, setImportItems] = useState<NewsletterPendingListItem[]>([]);
  const [importSelected, setImportSelected] = useState<Set<number>>(new Set());
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // Global newsletter leaderboard (primary list)
  const [leaderboardItems, setLeaderboardItems] = useState<NewsletterEvalLeaderboardItem[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [leaderboardPages, setLeaderboardPages] = useState(1);
  const [leaderboardTotal, setLeaderboardTotal] = useState(0);
  const [leaderboardQuery, setLeaderboardQuery] = useState("");
  const [leaderboardJudgedOnly, setLeaderboardJudgedOnly] = useState(true);

  // Batches / detail (secondary)
  const [batches, setBatches] = useState<NewsletterEvalBatchListItem[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [batchesOpen, setBatchesOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [batchDetail, setBatchDetail] = useState<{
    batch: NewsletterEvalBatchListItem;
    results: NewsletterEvalCell[];
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Detail modal (1 or 2 panes)
  const [detailPanes, setDetailPanes] = useState<NewsletterEvalResultDetail[]>([]);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // -- Loading ------------------------------------------------------------

  const loadReferenceData = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      const [personaList, modelGroups, prompts] = await Promise.all([
        listNewsletterEvalPersonas(token),
        getAvailableModels(token),
        getNewsletterPrompts(token).catch(() => null),
      ]);
      setPersonas(personaList);
      const availableGroups = modelGroups
        .map((g) => ({ ...g, models: g.models.filter((m) => m.is_available) }))
        .filter((g) => g.models.length > 0);
      const flat = availableGroups.flatMap((g) => g.models);
      setModelGroups(availableGroups);
      setModels(flat);
      if (prompts?.unified_newsletter_prompt?.trim()) {
        setDefaultTemplate(prompts.unified_newsletter_prompt);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load eval reference data");
    }
  }, [getAccessTokenSilently]);

  const loadLeaderboard = useCallback(
    async (page = leaderboardPage) => {
      try {
        setLeaderboardLoading(true);
        const token = await getAccessTokenSilently();
        const res = await listNewsletterEvalResults(token, {
          q: leaderboardQuery.trim() || undefined,
          judged_only: leaderboardJudgedOnly,
          page,
          page_size: LEADERBOARD_PAGE_SIZE,
        });
        setLeaderboardItems(res.items);
        setLeaderboardPage(res.page);
        setLeaderboardPages(res.pages);
        setLeaderboardTotal(res.total);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to load eval leaderboard");
      } finally {
        setLeaderboardLoading(false);
      }
    },
    [getAccessTokenSilently, leaderboardPage, leaderboardQuery, leaderboardJudgedOnly]
  );

  const loadBatches = useCallback(async () => {
    try {
      setBatchesLoading(true);
      const token = await getAccessTokenSilently();
      const res = await listNewsletterEvalBatches(token, { page_size: 50 });
      setBatches(res.items);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load eval batches");
    } finally {
      setBatchesLoading(false);
    }
  }, [getAccessTokenSilently]);

  const loadBatchDetail = useCallback(
    async (batchId: number) => {
      try {
        const token = await getAccessTokenSilently();
        const res = await getNewsletterEvalBatch(batchId, token);
        setBatchDetail(res);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to load batch");
      }
    },
    [getAccessTokenSilently]
  );

  const refreshLists = useCallback(async () => {
    await Promise.all([loadLeaderboard(leaderboardPage), loadBatches()]);
  }, [loadLeaderboard, loadBatches, leaderboardPage]);

  /** Push a re-judged / auto-corrected cell into the cached list rows. */
  const applyEvalUpdateToLists = useCallback((updated: NewsletterEvalResultDetail) => {
    if (updated.id <= 0) return;
    const patch = evalCellPatch(updated);
    setLeaderboardItems((prev) =>
      prev.map((r) =>
        r.id === updated.id
          ? { ...r, ...patch, overall_score: updated.judge_scores?.overall?.score ?? null }
          : r
      )
    );
    setBatchDetail((prev) =>
      prev
        ? {
            ...prev,
            results: prev.results.map((c) =>
              c.id === updated.id ? { ...c, ...patch } : c
            ),
          }
        : prev
    );
  }, []);

  useEffect(() => {
    loadReferenceData();
    loadBatches();
  }, [loadReferenceData, loadBatches]);

  useEffect(() => {
    void loadLeaderboard(leaderboardPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when filters/page change
  }, [leaderboardPage, leaderboardJudgedOnly]);

  useEffect(() => {
    if (selectedBatchId != null) {
      setBatchDetail(null);
      setCompareIds([]);
      loadBatchDetail(selectedBatchId);
    }
  }, [selectedBatchId, loadBatchDetail]);

  // Poll while the selected batch is running.
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    const status = batchDetail?.batch?.status;
    if (selectedBatchId != null && (status === "running" || status === "pending")) {
      pollRef.current = setInterval(() => {
        loadBatchDetail(selectedBatchId);
        void refreshLists();
      }, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedBatchId, batchDetail?.batch?.status, loadBatchDetail, refreshLists]);

  // -- Run builder derived state -------------------------------------------

  const personaCount = selectedPersonaIds.size + customPersonas.filter((p) => p.prompt.trim()).length;
  const cellCount = personaCount * selectedModels.size * Math.max(1, promptVariants.length);
  const overCap = cellCount > MAX_CELLS;

  const estCost = useMemo(() => {
    if (personaCount === 0 || selectedModels.size === 0) return 0;
    const variants = Math.max(1, promptVariants.length);
    let sum = 0;
    for (const key of selectedModels) {
      const m = models.find((mm) => mm.key === key);
      if (!m) continue;
      sum +=
        personaCount *
        variants *
        ((m.input_price * EST_INPUT_TOKENS + m.output_price * EST_OUTPUT_TOKENS) / 1_000_000);
    }
    return sum;
  }, [personaCount, selectedModels, promptVariants.length, models]);

  const featuredModels = useMemo(() => {
    const byKey = new Map(models.map((m) => [m.key, m]));
    return WORKBENCH_FEATURED_MODEL_KEYS.map((key) => byKey.get(key)).filter(
      (m): m is ModelInfo => Boolean(m)
    );
  }, [models]);

  const featuredKeySet = useMemo(
    () => new Set(featuredModels.map((m) => m.key)),
    [featuredModels]
  );

  const otherModelGroups = useMemo(
    () =>
      modelGroups
        .map((g) => ({
          ...g,
          models: g.models.filter((m) => !featuredKeySet.has(m.key)),
        }))
        .filter((g) => g.models.length > 0),
    [modelGroups, featuredKeySet]
  );

  const toggleModel = (key: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleLaunch = async () => {
    if (!cityId) {
      toast.error("Pick a city");
      return;
    }
    if (cellCount === 0 || overCap) return;
    try {
      setLaunching(true);
      const token = await getAccessTokenSilently();
      const personasPayload = [
        ...Array.from(selectedPersonaIds).map((id) => ({ id })),
        ...customPersonas
          .filter((p) => p.prompt.trim())
          .map((p) => ({ label: p.label || "Custom", prompt: p.prompt })),
      ];
      const res = await runNewsletterEvalBatch(
        {
          name: runName.trim() || undefined,
          city_id: cityId,
          district: 0,
          personas: personasPayload,
          model_keys: Array.from(selectedModels),
          prompt_variants: promptVariants.map((v) => ({
            label: v.label,
            template: v.template,
          })),
          judge_enabled: judgeEnabled,
          judge_model_key: judgeModelKey || null,
          location: selectedLocation
            ? {
                lat: selectedLocation.lat,
                lng: selectedLocation.lng,
                radius_m: selectedLocation.radius_m ?? 50,
                label: selectedLocation.label,
              }
            : undefined,
          refresh_place_metrics: selectedLocation ? refreshPlaceMetrics : false,
        },
        token
      );
      toast.success(`Eval batch started (${res.cell_count} cells)`);
      setBuilderOpen(false);
      setBatchesOpen(true);
      await refreshLists();
      setSelectedBatchId(res.batch_id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start eval batch");
    } finally {
      setLaunching(false);
    }
  };

  const clearSelectedLocation = () => {
    setSelectedLocation(null);
    setLocationQuery("");
    setLocationSuggestions([]);
  };

  const applyLocationSuggestion = (suggestion: AddressSuggestion) => {
    setSelectedLocation({
      lat: suggestion.lat,
      lng: suggestion.lon,
      radius_m: 50,
      label: suggestion.place_name,
    });
    setLocationQuery(suggestion.place_name);
    setLocationSuggestions([]);
  };

  const handleUseCityHall = async () => {
    if (!cityId) {
      toast.error("Pick a city first");
      return;
    }
    const city = cities.find((c) => c.city_id === cityId);
    if (!city?.city_name) {
      toast.error("Could not resolve city name");
      return;
    }

    // Curated pins for launched cities — Mapbox often returns a random street
    // (e.g. "California Ave, … 94130") for “City Hall, San Francisco”.
    const known = knownCityHallForCity(city.city_name);
    if (known) {
      setSelectedLocation({
        lat: known.lat,
        lng: known.lng,
        radius_m: known.radius_m ?? 50,
        label: known.label,
      });
      setLocationQuery(known.label);
      setLocationSuggestions([]);
      toast.success(`Using ${known.label}`);
      return;
    }

    const cityPart = [city.city_name, city.state].filter(Boolean).join(", ");
    const query = `City Hall, ${cityPart}`;
    const cityNorm = city.city_name.trim().toLowerCase();

    const matchesCity = (s: AddressSuggestion) => {
      const place = s.place_name.toLowerCase();
      const suggestionCity = (s.cityName || "").trim().toLowerCase();
      if (place.includes(cityNorm)) return true;
      if (suggestionCity && suggestionCity === cityNorm) return true;
      if (
        suggestionCity &&
        (cityNorm.includes(suggestionCity) || suggestionCity.includes(cityNorm))
      ) {
        return true;
      }
      return false;
    };
    const looksLikeCityHall = (s: AddressSuggestion) =>
      /city\s*hall/i.test(s.place_name);

    try {
      setResolvingCityHall(true);
      const suggestions = await fetchAddressSuggestions(query, {
        types: "poi",
        country: "US",
      });
      // Strict: only accept a POI whose name is actually City Hall in this city.
      // Never fall back to an arbitrary in-city address.
      const pick = suggestions.find(
        (s) => looksLikeCityHall(s) && matchesCity(s)
      );

      if (pick) {
        applyLocationSuggestion(pick);
        toast.success(`Using ${pick.place_name}`);
        return;
      }

      throw new Error(
        `Could not find City Hall for ${city.city_name}. Type the street address instead.`
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not find city hall");
    } finally {
      setResolvingCityHall(false);
    }
  };

  // Debounced address autocomplete for the custom location field.
  useEffect(() => {
    if (locationSuggestTimeoutRef.current) {
      window.clearTimeout(locationSuggestTimeoutRef.current);
    }
    const q = locationQuery.trim();
    if (selectedLocation && q === (selectedLocation.label || "").trim()) {
      setLocationSuggestions([]);
      return;
    }
    if (q.length < 3) {
      setLocationSuggestions([]);
      return;
    }
    locationSuggestTimeoutRef.current = window.setTimeout(() => {
      void (async () => {
        setLocationSuggestLoading(true);
        try {
          const city = cities.find((c) => c.city_id === cityId);
          const scoped = city?.city_name
            ? `${q}, ${city.city_name}${city.state ? `, ${city.state}` : ""}`
            : q;
          const suggestions = await fetchAddressSuggestions(scoped);
          setLocationSuggestions(suggestions.slice(0, 6));
        } finally {
          setLocationSuggestLoading(false);
        }
      })();
    }, 280);
    return () => {
      if (locationSuggestTimeoutRef.current) {
        window.clearTimeout(locationSuggestTimeoutRef.current);
      }
    };
  }, [locationQuery, selectedLocation, cityId, cities]);

  // -- Import -------------------------------------------------------------

  const searchImportCandidates = useCallback(async () => {
    try {
      setImportLoading(true);
      const token = await getAccessTokenSilently();
      const res = await listNewsletterPending(token, {
        unsent_only: false,
        limit: 25,
        q: importQuery || undefined,
      });
      setImportItems(res.items);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to search drafts");
    } finally {
      setImportLoading(false);
    }
  }, [getAccessTokenSilently, importQuery]);

  useEffect(() => {
    if (importOpen) searchImportCandidates();
  }, [importOpen, searchImportCandidates]);

  const handleImport = async () => {
    if (importSelected.size === 0) return;
    try {
      setImporting(true);
      const token = await getAccessTokenSilently();
      const res = await importNewsletterEvalSends(
        {
          pending_send_ids: Array.from(importSelected),
          judge_enabled: true,
          judge_model_key: judgeModelKey || null,
        },
        token
      );
      toast.success(`Imported ${res.imported} email(s) for judging`);
      setImportOpen(false);
      setImportSelected(new Set());
      setBatchesOpen(true);
      await refreshLists();
      setSelectedBatchId(res.batch_id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  // -- Detail modal ---------------------------------------------------------

  const openDetail = async (ids: number[]) => {
    try {
      setDetailLoading(true);
      const token = await getAccessTokenSilently();
      const details = await Promise.all(ids.map((id) => getNewsletterEvalResult(id, token)));
      setDetailPanes(details);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load result");
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleCompare = (id: number) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  // -- Matrix derived data --------------------------------------------------

  const matrixData = useMemo(() => {
    const results = batchDetail?.results || [];
    const combos: string[] = [];
    const comboSeen = new Set<string>();
    for (const r of results) {
      const label = cellComboLabel(r);
      if (!comboSeen.has(label)) {
        comboSeen.add(label);
        combos.push(label);
      }
    }
    const rowLabels: string[] = [];
    const rowSeen = new Set<string>();
    for (const r of results) {
      const label = r.persona_label || "?";
      if (!rowSeen.has(label)) {
        rowSeen.add(label);
        rowLabels.push(label);
      }
    }
    const byKey = new Map<string, NewsletterEvalCell>();
    for (const r of results) {
      byKey.set(`${r.persona_label || "?"}|${cellComboLabel(r)}`, r);
    }
    return { combos, rowLabels, byKey };
  }, [batchDetail]);

  const leaderboard = useMemo(() => {
    const judged = (batchDetail?.results || []).filter(
      (r) => r.status === "completed" && r.judge_scores?.overall?.score != null
    );
    if (judged.length < 2) return [];
    return [...judged].sort((a, b) => (overallScore(b) ?? 0) - (overallScore(a) ?? 0));
  }, [batchDetail]);

  // -------------------------------------------------------------------------

  return (
    <div>
      {/* Actions */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => setBuilderOpen(!builderOpen)}
        >
          {builderOpen ? "Close run builder" : "New eval run"}
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={() => setImportOpen(!importOpen)}>
          Import emails
        </button>
        <span className={styles.muted} style={{ fontSize: 12 }}>
          Synthetic eval runs — nothing here can be sent to subscribers.
        </span>
      </div>

      {/* Run builder */}
      {builderOpen && (
        <div className={styles.testPanel} style={{ marginBottom: 14 }}>
          <div className={styles.testPanelTitle}>New eval run</div>

          <div className={styles.testPanelRow}>
            <div className={styles.testField}>
              <label className={styles.testLabel}>Name (optional)</label>
              <input
                className={styles.searchInput}
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
                placeholder="e.g. Prompt sweep v3 — SF commuter"
              />
            </div>
            <div className={styles.testField}>
              <label className={styles.testLabel}>City</label>
              <select
                className={styles.select}
                value={cityId ?? ""}
                onChange={(e) => {
                  const next = e.target.value ? Number(e.target.value) : null;
                  setCityId(next);
                  clearSelectedLocation();
                }}
              >
                <option value="">Select city…</option>
                {cities
                  .filter((c) => c.is_launched !== false)
                  .map((c) => (
                    <option key={c.city_id} value={c.city_id}>
                      {c.city_name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Custom location */}
          <div style={{ marginTop: 10 }}>
            <label className={styles.testLabel}>
              Custom location{" "}
              <span className={styles.muted} style={{ fontWeight: 400 }}>
                (optional — personalize around an address)
              </span>
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
              <input
                className={styles.searchInput}
                style={{ flex: "1 1 220px", minWidth: 180 }}
                value={locationQuery}
                onChange={(e) => {
                  setLocationQuery(e.target.value);
                  if (selectedLocation) setSelectedLocation(null);
                }}
                placeholder={cityId ? "Street address in this city…" : "Pick a city first"}
                disabled={!cityId}
              />
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={!cityId || resolvingCityHall}
                onClick={() => void handleUseCityHall()}
              >
                {resolvingCityHall ? "Finding…" : "Use city hall"}
              </button>
              {selectedLocation && (
                <button type="button" className={styles.linkBtn} onClick={clearSelectedLocation}>
                  Clear
                </button>
              )}
            </div>
            {(locationSuggestLoading || locationSuggestions.length > 0) && !selectedLocation && (
              <div
                style={{
                  marginTop: 4,
                  border: "1px solid var(--border-primary)",
                  borderRadius: 6,
                  background: "var(--bg-primary)",
                  maxWidth: 520,
                }}
              >
                {locationSuggestLoading && locationSuggestions.length === 0 ? (
                  <div className={styles.muted} style={{ padding: "8px 10px", fontSize: 12 }}>
                    Searching addresses…
                  </div>
                ) : (
                  locationSuggestions.map((s, i) => (
                    <button
                      key={`${s.place_name}-${i}`}
                      type="button"
                      onClick={() => applyLocationSuggestion(s)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 10px",
                        border: "none",
                        borderBottom:
                          i < locationSuggestions.length - 1
                            ? "1px solid var(--border-primary)"
                            : "none",
                        background: "transparent",
                        cursor: "pointer",
                        fontSize: 12,
                        color: "var(--text-primary)",
                      }}
                    >
                      {s.place_name}
                    </button>
                  ))
                )}
              </div>
            )}
            {selectedLocation && (
              <div
                className={styles.muted}
                style={{ marginTop: 6, fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}
              >
                <span>
                  Pin: {selectedLocation.label}{" "}
                  <span style={{ opacity: 0.75 }}>
                    ({selectedLocation.lat.toFixed(5)}, {selectedLocation.lng.toFixed(5)})
                  </span>
                </span>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={refreshPlaceMetrics}
                    onChange={(e) => setRefreshPlaceMetrics(e.target.checked)}
                  />
                  Refresh place metrics before generating (slower, better block-level detail)
                </label>
              </div>
            )}
          </div>

          {/* Personas */}
          <div style={{ marginTop: 10 }}>
            <label className={styles.testLabel}>Personas</label>
            <div className={styles.muted} style={{ fontSize: 11, marginTop: 2, marginBottom: 4 }}>
              Same instruction slot as weekend draft assembly
              ({`{instructions_block}`}). &ldquo;No persona&rdquo; is the shared-edition
              baseline; with a location, place-focus text is still injected into the
              prompt (like a subscriber who named their home address).
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {personas.map((p) => {
                const active = selectedPersonaIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    title={p.prompt}
                    onClick={() =>
                      setSelectedPersonaIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      })
                    }
                    style={{
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 14,
                      cursor: "pointer",
                      border: `1px solid ${active ? "var(--brand-primary, #ad35fa)" : "var(--border-primary)"}`,
                      background: active ? "var(--brand-primary-faint, rgba(173,53,250,0.09))" : "var(--bg-primary)",
                      color: active ? "var(--brand-primary, #ad35fa)" : "var(--text-primary)",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => setCustomPersonas((prev) => [...prev, { label: "", prompt: "" }])}
              >
                + custom persona
              </button>
            </div>
            {customPersonas.map((cp, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "flex-start" }}>
                <input
                  className={styles.searchInput}
                  style={{ maxWidth: 180 }}
                  placeholder="Label"
                  value={cp.label}
                  onChange={(e) =>
                    setCustomPersonas((prev) =>
                      prev.map((p, j) => (j === i ? { ...p, label: e.target.value } : p))
                    )
                  }
                />
                <textarea
                  className={styles.textarea}
                  style={{ flex: 1, minHeight: 48 }}
                  placeholder="Persona instructions, written as the subscriber (e.g. 'I run a coffee shop on Valencia St…')"
                  value={cp.prompt}
                  onChange={(e) =>
                    setCustomPersonas((prev) =>
                      prev.map((p, j) => (j === i ? { ...p, prompt: e.target.value } : p))
                    )
                  }
                />
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => setCustomPersonas((prev) => prev.filter((_, j) => j !== i))}
                >
                  remove
                </button>
              </div>
            ))}
          </div>

          {/* Models */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <label className={styles.testLabel}>Models</label>
              <span className={styles.muted} style={{ fontSize: 11 }}>
                {selectedModels.size} selected
                {models.length === 0 ? " · loading…" : ""}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {featuredModels.map((m) => (
                <ModelChip
                  key={m.key}
                  model={m}
                  active={selectedModels.has(m.key)}
                  onToggle={() => toggleModel(m.key)}
                />
              ))}
            </div>
            {otherModelGroups.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => setShowAllModels((v) => !v)}
                >
                  {showAllModels
                    ? "Hide extra models"
                    : `Show all models (${otherModelGroups.reduce((n, g) => n + g.models.length, 0)})`}
                </button>
                {showAllModels &&
                  otherModelGroups.map((group) => (
                    <div key={group.label} style={{ marginTop: 8 }}>
                      <div className={styles.muted} style={{ fontSize: 11, marginBottom: 4 }}>
                        {group.emoji ? `${group.emoji} ` : ""}
                        {group.label}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {group.models.map((m) => (
                          <ModelChip
                            key={m.key}
                            model={m}
                            active={selectedModels.has(m.key)}
                            onToggle={() => toggleModel(m.key)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Prompt variants */}
          <div style={{ marginTop: 10 }}>
            <label className={styles.testLabel}>
              Prompt variants ({promptVariants.length})
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              {promptVariants.map((v, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    className={styles.searchInput}
                    style={{ maxWidth: 220 }}
                    value={v.label}
                    onChange={(e) =>
                      setPromptVariants((prev) =>
                        prev.map((p, j) => (j === i ? { ...p, label: e.target.value } : p))
                      )
                    }
                  />
                  <span className={styles.muted} style={{ fontSize: 11 }}>
                    {v.template == null ? "uses current saved template" : `${v.template.length.toLocaleString()} chars`}
                  </span>
                  {v.template != null && (
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() => setEditingVariantIdx(editingVariantIdx === i ? null : i)}
                    >
                      {editingVariantIdx === i ? "close" : "edit"}
                    </button>
                  )}
                  {i > 0 && (
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() => setPromptVariants((prev) => prev.filter((_, j) => j !== i))}
                    >
                      remove
                    </button>
                  )}
                </div>
              ))}
              {editingVariantIdx != null && promptVariants[editingVariantIdx]?.template != null && (
                <textarea
                  className={styles.textarea}
                  style={{ minHeight: 220, fontFamily: "monospace", fontSize: 11.5 }}
                  value={promptVariants[editingVariantIdx].template as string}
                  onChange={(e) =>
                    setPromptVariants((prev) =>
                      prev.map((p, j) =>
                        j === editingVariantIdx ? { ...p, template: e.target.value } : p
                      )
                    )
                  }
                />
              )}
              <div>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => {
                    setPromptVariants((prev) => [
                      ...prev,
                      {
                        label: `Variant ${prev.length + 1}`,
                        template: defaultTemplate || "",
                      },
                    ]);
                    setEditingVariantIdx(promptVariants.length);
                  }}
                >
                  + add variant (starts from current template)
                </button>
              </div>
            </div>
          </div>

          {/* Judge */}
          <div className={styles.testPanelRow} style={{ marginTop: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={judgeEnabled}
                onChange={(e) => setJudgeEnabled(e.target.checked)}
              />
              Run LLM judge
            </label>
            {judgeEnabled && (
              <select
                className={styles.select}
                value={judgeModelKey}
                onChange={(e) => setJudgeModelKey(e.target.value)}
                style={{ maxWidth: 280 }}
              >
                <option value="">Default judge model</option>
                {featuredModels.map((m) => (
                  <option key={m.key} value={m.key}>
                    {formatWorkbenchModelLabel(m.key)}
                  </option>
                ))}
                {otherModelGroups.flatMap((g) =>
                  g.models.map((m) => (
                    <option key={m.key} value={m.key}>
                      {formatWorkbenchModelLabel(m.key)}
                    </option>
                  ))
                )}
              </select>
            )}
          </div>

          {/* Summary + launch */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: overCap ? "#c1341b" : "var(--text-primary)" }}>
              {cellCount} cell{cellCount === 1 ? "" : "s"}
              {overCap ? ` — over the ${MAX_CELLS}-cell cap` : ""}
            </span>
            {estCost > 0 && (
              <span className={styles.muted} style={{ fontSize: 12 }}>
                rough generation cost ~${estCost.toFixed(2)}
              </span>
            )}
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={launching || cellCount === 0 || overCap || !cityId}
              onClick={handleLaunch}
            >
              {launching ? "Starting…" : "Run eval batch"}
            </button>
          </div>
        </div>
      )}

      {/* Import panel */}
      {importOpen && (
        <div className={styles.testPanel} style={{ marginBottom: 14 }}>
          <div className={styles.testPanelTitle}>Import existing emails for judging</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              className={styles.searchInput}
              placeholder="Search drafts by email or subject…"
              value={importQuery}
              onChange={(e) => setImportQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchImportCandidates()}
            />
            <button type="button" className={styles.secondaryBtn} onClick={searchImportCandidates}>
              Search
            </button>
          </div>
          {importLoading ? (
            <Loader />
          ) : (
            <div style={{ maxHeight: 260, overflow: "auto" }}>
              {importItems.map((item) => (
                <label
                  key={item.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    padding: "4px 2px",
                    fontSize: 12.5,
                    borderBottom: "1px solid var(--border-primary)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={importSelected.has(item.id)}
                    onChange={() =>
                      setImportSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })
                    }
                  />
                  <span style={{ fontWeight: 600 }}>{maskEmails(item.recipient_email)}</span>
                  <span style={{ color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.subject}
                  </span>
                  {item.eval_score != null && (
                    <ScoreBadge score={item.eval_score} title={item.eval_verdict ?? undefined} size={18} />
                  )}
                  <span className={styles.muted} style={{ fontSize: 11 }}>
                    {item.sent_at ? "sent" : "draft"}
                    {item.created_at ? ` · ${new Date(item.created_at).toLocaleDateString()}` : ""}
                  </span>
                </label>
              ))}
              {importItems.length === 0 && <div className={styles.emptyState}>No drafts found.</div>}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={importing || importSelected.size === 0}
              onClick={handleImport}
            >
              {importing ? "Importing…" : `Import ${importSelected.size} email(s) & judge`}
            </button>
          </div>
        </div>
      )}

      {/* Global newsletter leaderboard (primary) */}
      <div className={styles.tableContainer} style={{ marginBottom: 14 }}>
        <div className={styles.tableHeader}>
          <span className={styles.tableTitle}>Newsletter leaderboard</span>
          <span className={styles.tableCount}>{leaderboardTotal}</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <label
              className={styles.muted}
              style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}
            >
              <input
                type="checkbox"
                checked={leaderboardJudgedOnly}
                onChange={(e) => {
                  setLeaderboardPage(1);
                  setLeaderboardJudgedOnly(e.target.checked);
                }}
              />
              Judged only
            </label>
            <input
              className={styles.searchInput}
              style={{ width: 180 }}
              value={leaderboardQuery}
              onChange={(e) => setLeaderboardQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setLeaderboardPage(1);
                  void loadLeaderboard(1);
                }
              }}
              placeholder="Search subject, city…"
            />
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => {
                setLeaderboardPage(1);
                void loadLeaderboard(1);
              }}
            >
              Refresh
            </button>
          </div>
        </div>
        {leaderboardLoading && leaderboardItems.length === 0 ? (
          <Loader />
        ) : leaderboardItems.length === 0 ? (
          <div className={styles.emptyState}>
            No scored newsletters yet — run an eval or import emails to judge.
          </div>
        ) : (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>#</th>
                    <th className={styles.th}>Newsletter</th>
                    <th className={styles.th}>Overall</th>
                    <th className={styles.th}>Acc</th>
                    <th className={styles.th}>Rel</th>
                    <th className={styles.th}>Cog</th>
                    <th className={styles.th}>Data</th>
                    <th className={styles.th}>Tone</th>
                    <th className={styles.th}>Tools</th>
                    <th className={styles.th}>Tokens in/out</th>
                    <th className={styles.th}>Cost</th>
                    <th className={styles.th}>Time</th>
                    <th className={styles.th}>Calls</th>
                    <th className={styles.th}>Batch / City</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardItems.map((r, i) => {
                    const dims = r.judge_scores?.dimensions || {};
                    const t = r.run_telemetry;
                    const rank = (leaderboardPage - 1) * LEADERBOARD_PAGE_SIZE + i + 1;
                    return (
                      <tr
                        key={r.id}
                        className={styles.rowClickable}
                        onClick={() => openDetail([r.id])}
                      >
                        <td className={styles.td}>{rank}</td>
                        <td className={styles.td}>
                          <div style={{ fontWeight: 600 }}>
                            {maskEmails(r.subject) || "(no subject)"}
                          </div>
                          <div className={styles.muted} style={{ fontSize: 11.5 }}>
                            {maskEmails(r.persona_label) || "—"} · {cellComboLabel(r)}
                            {r.source === "imported" ? " · imported" : ""}
                          </div>
                        </td>
                        <td className={styles.td}>
                          <ScoreBadge
                            score={r.overall_score ?? overallScore(r)}
                            size={20}
                          />
                        </td>
                        <td className={styles.td}>{dims.accuracy?.score ?? "–"}</td>
                        <td className={styles.td}>{dims.relevance?.score ?? "–"}</td>
                        <td className={styles.td}>{dims.cogency?.score ?? "–"}</td>
                        <td className={styles.td}>{dims.data_honesty?.score ?? "–"}</td>
                        <td className={styles.td}>{dims.tone?.score ?? "–"}</td>
                        <td className={styles.td}>{dims.tool_use?.score ?? "–"}</td>
                        <td className={styles.td}>
                          {fmtTokens(r.llm_usage?.prompt_tokens)}/
                          {fmtTokens(r.llm_usage?.completion_tokens)}
                        </td>
                        <td className={styles.td}>{fmtCost(r.llm_usage?.cost_usd)}</td>
                        <td className={styles.td}>
                          {fmtMs(t?.generation_ms ?? t?.execution_time_ms)}
                        </td>
                        <td className={styles.td}>
                          {t?.llm_call_count ?? "–"}/{t?.tool_call_count ?? "–"}
                        </td>
                        <td className={styles.td}>
                          <button
                            type="button"
                            className={styles.linkBtn}
                            style={{ fontSize: 12, padding: 0, textAlign: "left" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setBatchesOpen(true);
                              setSelectedBatchId(r.batch_id);
                            }}
                          >
                            {r.batch_name || `Batch ${r.batch_id}`}
                          </button>
                          <div className={styles.muted} style={{ fontSize: 11 }}>
                            {r.city_name || "—"}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {leaderboardTotal > 0 && (
              <div className={styles.pagination}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  disabled={leaderboardPage <= 1 || leaderboardLoading}
                  onClick={() => setLeaderboardPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className={styles.pageInfo}>
                  Page {leaderboardPage} of {leaderboardPages} ({leaderboardTotal} newsletters)
                </span>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  disabled={leaderboardPage >= leaderboardPages || leaderboardLoading}
                  onClick={() =>
                    setLeaderboardPage((p) => Math.min(leaderboardPages, p + 1))
                  }
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Batch list (secondary) */}
      <div className={styles.tableContainer} style={{ marginBottom: 14 }}>
        <div className={styles.tableHeader}>
          <button
            type="button"
            className={styles.linkBtn}
            style={{ fontWeight: 700, fontSize: 14 }}
            onClick={() => setBatchesOpen((o) => !o)}
          >
            {batchesOpen ? "▾" : "▸"} Eval batches
          </button>
          <span className={styles.tableCount}>{batches.length}</span>
          <span className={styles.muted} style={{ fontSize: 12 }}>
            batch name, city, status — open a batch for matrix view
          </span>
          <button
            type="button"
            className={styles.linkBtn}
            style={{ marginLeft: "auto" }}
            onClick={() => loadBatches()}
          >
            Refresh
          </button>
        </div>
        {batchesOpen && (
          batchesLoading ? (
            <Loader />
          ) : batches.length === 0 ? (
            <div className={styles.emptyState}>
              No eval batches yet — run one with “New eval run”.
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Batch</th>
                    <th className={styles.th}>City</th>
                    <th className={styles.th}>Status</th>
                    <th className={styles.th}>Cells</th>
                    <th className={styles.th}>Avg score</th>
                    <th className={styles.th}>Total cost</th>
                    <th className={styles.th}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr
                      key={b.id}
                      className={styles.rowClickable}
                      style={selectedBatchId === b.id ? { background: "var(--bg-secondary)" } : undefined}
                      onClick={() => setSelectedBatchId(b.id)}
                    >
                      <td className={styles.td} style={{ fontWeight: 600 }}>{b.name || `Batch ${b.id}`}</td>
                      <td className={styles.td}>{b.city_name || "—"}</td>
                      <td className={styles.td}>
                        <span
                          className={`${styles.badge} ${
                            b.status === "completed"
                              ? styles.badgeGreen
                              : b.status === "failed"
                                ? styles.badgeYellow
                                : b.status === "running"
                                  ? styles.badgeBlue
                                  : styles.badgeGray
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className={styles.td}>
                        {b.completed_cells}/{b.cell_count}
                        {b.failed_cells > 0 ? ` (${b.failed_cells} failed)` : ""}
                      </td>
                      <td className={styles.td}>
                        {b.avg_overall_score != null ? (
                          <ScoreBadge score={Math.round(b.avg_overall_score * 10) / 10} title={`avg ${b.avg_overall_score.toFixed(2)}`} size={20} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={styles.td}>{fmtCost(b.total_cost_usd)}</td>
                      <td className={styles.td}>{new Date(b.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Batch detail */}
      {selectedBatchId != null && (
        <div className={styles.tableContainer}>
          <div className={styles.tableHeader}>
            <span className={styles.tableTitle}>
              {batchDetail?.batch?.name || `Batch ${selectedBatchId}`}
            </span>
            {batchDetail?.batch?.status === "running" && (
              <span className={`${styles.badge} ${styles.badgeBlue}`}>running…</span>
            )}
            {compareIds.length === 2 && (
              <button type="button" className={styles.primaryBtn} onClick={() => openDetail(compareIds)}>
                Compare selected
              </button>
            )}
            <button
              type="button"
              className={styles.linkBtn}
              style={{ marginLeft: "auto" }}
              onClick={() => setSelectedBatchId(null)}
            >
              Close
            </button>
          </div>

          {!batchDetail ? (
            <Loader />
          ) : (
            <div style={{ padding: "0 12px 12px" }}>
              {(() => {
                const loc = batchDetail.batch.config_json?.location as
                  | NewsletterEvalLocation
                  | undefined;
                if (!loc?.label && loc?.lat == null) return null;
                const district =
                  typeof loc.district === "number" && loc.district > 0
                    ? loc.district
                    : typeof batchDetail.batch.config_json?.district === "number"
                      ? (batchDetail.batch.config_json.district as number)
                      : null;
                return (
                  <div className={styles.muted} style={{ fontSize: 12, margin: "8px 0 4px" }}>
                    Location: {loc.label || "Custom pin"}
                    {district ? ` · District ${district}` : ""}
                    {loc.lat != null && loc.lng != null
                      ? ` · ${Number(loc.lat).toFixed(4)}, ${Number(loc.lng).toFixed(4)}`
                      : ""}
                  </div>
                );
              })()}
              {/* Leaderboard (single-axis sweeps and any judged multi-cell batch) */}
              {leaderboard.length >= 2 && (
                <div style={{ margin: "10px 0 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Leaderboard</div>
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th className={styles.th}>#</th>
                          <th className={styles.th}>Cell</th>
                          <th className={styles.th}>Overall</th>
                          <th className={styles.th}>Acc</th>
                          <th className={styles.th}>Rel</th>
                          <th className={styles.th}>Cog</th>
                          <th className={styles.th}>Data</th>
                          <th className={styles.th}>Tone</th>
                          <th className={styles.th}>Tools</th>
                          <th className={styles.th}>Tokens in/out</th>
                          <th className={styles.th}>Cost</th>
                          <th className={styles.th}>Time</th>
                          <th className={styles.th}>Calls</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((r, i) => {
                          const dims = r.judge_scores?.dimensions || {};
                          const t = r.run_telemetry;
                          return (
                            <tr key={r.id} className={styles.rowClickable} onClick={() => openDetail([r.id])}>
                              <td className={styles.td}>{i + 1}</td>
                              <td className={styles.td} style={{ fontWeight: 600 }}>
                                {maskEmails(r.persona_label)} · {cellComboLabel(r)}
                              </td>
                              <td className={styles.td}><ScoreBadge score={overallScore(r)} size={20} /></td>
                              <td className={styles.td}>{dims.accuracy?.score ?? "–"}</td>
                              <td className={styles.td}>{dims.relevance?.score ?? "–"}</td>
                              <td className={styles.td}>{dims.cogency?.score ?? "–"}</td>
                              <td className={styles.td}>{dims.data_honesty?.score ?? "–"}</td>
                              <td className={styles.td}>{dims.tone?.score ?? "–"}</td>
                              <td className={styles.td}>{dims.tool_use?.score ?? "–"}</td>
                              <td className={styles.td}>
                                {fmtTokens(r.llm_usage?.prompt_tokens)}/{fmtTokens(r.llm_usage?.completion_tokens)}
                              </td>
                              <td className={styles.td}>{fmtCost(r.llm_usage?.cost_usd)}</td>
                              <td className={styles.td}>{fmtMs(t?.generation_ms ?? t?.execution_time_ms)}</td>
                              <td className={styles.td}>
                                {t?.llm_call_count ?? "–"}/{t?.tool_call_count ?? "–"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Matrix grid */}
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table style={{ borderCollapse: "separate", borderSpacing: 6 }}>
                  <thead>
                    <tr>
                      <th />
                      {matrixData.combos.map((c) => (
                        <th
                          key={c}
                          style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)", textAlign: "left", padding: "0 4px" }}
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixData.rowLabels.map((rowLabel) => (
                      <tr key={rowLabel}>
                        <td
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            verticalAlign: "top",
                            paddingTop: 8,
                            maxWidth: 140,
                          }}
                        >
                          {maskEmails(rowLabel)}
                        </td>
                        {matrixData.combos.map((combo) => {
                          const cell = matrixData.byKey.get(`${rowLabel}|${combo}`);
                          if (!cell) return <td key={combo} />;
                          return (
                            <td key={combo} style={{ verticalAlign: "top" }}>
                              <div
                                onClick={() => cell.status === "completed" && openDetail([cell.id])}
                                style={{
                                  border: "1px solid var(--border-primary)",
                                  borderRadius: 8,
                                  padding: "8px 10px",
                                  minWidth: 190,
                                  maxWidth: 240,
                                  cursor: cell.status === "completed" ? "pointer" : "default",
                                  background: "var(--bg-primary)",
                                  opacity: cell.status === "pending" ? 0.55 : 1,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  {cell.status === "completed" ? (
                                    <ScoreBadge
                                      score={overallScore(cell)}
                                      title={cell.judge_scores?.overall?.verdict}
                                    />
                                  ) : (
                                    <span
                                      className={`${styles.badge} ${
                                        cell.status === "failed" ? styles.badgeYellow : styles.badgeGray
                                      }`}
                                    >
                                      {cell.status === "running" ? "generating…" : cell.status}
                                    </span>
                                  )}
                                  <input
                                    type="checkbox"
                                    title="Select for compare"
                                    checked={compareIds.includes(cell.id)}
                                    disabled={cell.status !== "completed"}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={() => toggleCompare(cell.id)}
                                    style={{ marginLeft: "auto" }}
                                  />
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    margin: "5px 0 3px",
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                  }}
                                  title={cell.subject || undefined}
                                >
                                  {cell.status === "failed"
                                    ? cell.error || "failed"
                                    : cell.subject || "…"}
                                </div>
                                <TelemetryStrip cell={cell} />
                                {cell.judge_scores?.fabrication_capped && (
                                  <div style={{ marginTop: 3 }}>
                                    <span className={`${styles.badge} ${styles.badgeYellow}`}>fabrication</span>
                                  </div>
                                )}
                                {!cell.judge_scores && cell.judge_usage?.error && (
                                  <div style={{ marginTop: 3 }}>
                                    <span
                                      className={`${styles.badge} ${styles.badgeYellow}`}
                                      title={cell.judge_usage.error}
                                    >
                                      judge failed — open to retry
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <NewsletterEvalPreviewModal
        open={detailPanes.length > 0 || detailLoading}
        loading={detailLoading}
        title={detailPanes.length === 2 ? "Compare cells" : "Eval result"}
        panes={detailPanes}
        models={models}
        compareMode={detailPanes.length === 2}
        onClose={() => setDetailPanes([])}
        onRejudged={(updated) => {
          setDetailPanes((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          applyEvalUpdateToLists(updated);
        }}
      />
    </div>
  );
}
