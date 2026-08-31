"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CustomScheduledJob,
  updateCustomScheduledJob,
  pauseCustomScheduledJob,
  resumeCustomScheduledJob,
  runCustomScheduledJob,
  runCustomScheduledJobForCurrentUser,
  getAvailableModels,
  getDistrictFeedStoriesDefaultPrompt,
  listCities,
  type CityListItem,
  type DistrictFeedStoriesDefaultPrompt,
  type ModelGroupInfo,
} from "@/lib/apiClient";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import {
  buildStandardFeedProducerDefaultPrompt,
  cityIdsFromJobConfig,
  parseCityIdsFromCsv,
  parseStoryTypesFromCsv,
  storyTypesFromJobConfig,
} from "@/lib/jobs/feedProducerDefaultPrompt";
import Loader from "./Loader";
import styles from "./ScheduledJobsPanel.module.css";

interface ScheduledJobsPanelProps {
  customSchedules: CustomScheduledJob[];
  scheduleLoading: boolean;
  scheduleError: string | null;
  onRefresh: () => void;
  getAccessTokenSilently: () => Promise<string>;
  token: string | null;
}

export default function ScheduledJobsPanel({
  customSchedules,
  scheduleLoading,
  scheduleError,
  onRefresh,
  getAccessTokenSilently,
  token,
}: ScheduledJobsPanelProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [runSuccessMessage, setRunSuccessMessage] = useState<{ jobId: string; jobName: string } | null>(null);
  const [runningCustomJobId, setRunningCustomJobId] = useState<number | null>(null);
  const [runningPersonalTestJobId, setRunningPersonalTestJobId] = useState<number | null>(null);

  const [editJob, setEditJob] = useState<CustomScheduledJob | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    job_type: string;
    schedule_type: string;
    schedule_hour: string;
    schedule_minute: string;
    schedule_day_of_week: string;
    schedule_day_of_month: string;
    timezone: string;
    max_concurrent_cities: string;
    per_city_concurrency: string;
    cron_expression: string;
    question: string;
    feed_producer_mode: boolean;
    city_ids: string;
    story_types: string;
    test_user_id: string;
    model_key: string;
  } | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelGroupInfo[]>([]);

  /** Default: active schedules only; paused/disabled hidden until user changes filter. */
  const [statusFilter, setStatusFilter] = useState<
    "active" | "paused" | "disabled" | "all"
  >("active");
  const [jobTypeFilter, setJobTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  /** Empty string = no city filter; otherwise numeric city_id from job_config.city_ids / city_id */
  const [cityFilterId, setCityFilterId] = useState<string>("");
  const [cityDirectory, setCityDirectory] = useState<CityListItem[]>([]);

  const cityIdsReferencedBySchedules = useMemo(() => {
    const ids = new Set<number>();
    for (const j of customSchedules) {
      const cfg = (j.job_config || {}) as Record<string, unknown>;
      for (const id of cityIdsFromJobConfig(cfg)) {
        ids.add(id);
      }
    }
    return Array.from(ids).sort((a, b) => a - b);
  }, [customSchedules]);

  useEffect(() => {
    if (!token) return;
    listCities(token)
      .then(setCityDirectory)
      .catch(() => setCityDirectory([]));
  }, [token]);

  useEffect(() => {
    if (!cityFilterId) return;
    const n = Number(cityFilterId);
    if (
      Number.isNaN(n) ||
      !cityIdsReferencedBySchedules.includes(n)
    ) {
      setCityFilterId("");
    }
  }, [cityFilterId, cityIdsReferencedBySchedules]);

  const cityLabel = (cityId: number): string => {
    const row = cityDirectory.find((c) => c.city_id === cityId);
    if (row?.city_name) {
      const region = [row.state, row.country].filter(Boolean).join(", ");
      return region ? `${row.city_name} (${region})` : row.city_name;
    }
    return `City ${cityId}`;
  };

  const jobTypeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const j of customSchedules) {
      if (j.job_type) set.add(j.job_type);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [customSchedules]);

  const filteredSchedules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cityIdNum =
      cityFilterId !== "" ? Number(cityFilterId) : Number.NaN;
    const filterByCity =
      cityFilterId !== "" && !Number.isNaN(cityIdNum);

    return customSchedules.filter((job) => {
      if (statusFilter !== "all" && job.status !== statusFilter) return false;
      if (jobTypeFilter !== "all" && job.job_type !== jobTypeFilter) return false;
      if (filterByCity) {
        const cfg = (job.job_config || {}) as Record<string, unknown>;
        const jobCities = cityIdsFromJobConfig(cfg);
        if (!jobCities.includes(cityIdNum)) return false;
      }
      if (q) {
        const name = (job.name || "").toLowerCase();
        const jt = (job.job_type || "").toLowerCase();
        if (!name.includes(q) && !jt.includes(q)) return false;
      }
      return true;
    });
  }, [
    customSchedules,
    statusFilter,
    jobTypeFilter,
    searchQuery,
    cityFilterId,
  ]);

  /** When true, prompt text tracks city IDs + story types (until user edits the textarea). */
  const [feedProducerUsesLiveTemplate, setFeedProducerUsesLiveTemplate] =
    useState(false);

  /** Autocomplete for feed_producer city_ids (synced with editForm.city_ids CSV). */
  const [feedProducerCityQuery, setFeedProducerCityQuery] = useState("");
  const [feedProducerCityHighlight, setFeedProducerCityHighlight] = useState(0);
  const [feedProducerCityFocused, setFeedProducerCityFocused] = useState(false);

  /** Server-side built-in template for district_feed_stories (prefilled in the editor). */
  const [districtDefaultPrompt, setDistrictDefaultPrompt] =
    useState<DistrictFeedStoriesDefaultPrompt | null>(null);

  useEffect(() => {
    getAvailableModels().then(setAvailableModels).catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    getDistrictFeedStoriesDefaultPrompt(token)
      .then(setDistrictDefaultPrompt)
      .catch(() => setDistrictDefaultPrompt(null));
  }, [token]);

  useEffect(() => {
    if (!editForm) return;
    if (editForm.job_type !== "feed_producer" && editForm.job_type !== "feed_stories") {
      return;
    }
    if (!feedProducerUsesLiveTemplate) return;
    const ids = parseCityIdsFromCsv(editForm.city_ids);
    const types = parseStoryTypesFromCsv(editForm.story_types);
    const next = buildStandardFeedProducerDefaultPrompt(ids, types) ?? "";
    setEditForm((f) => (f ? { ...f, question: next } : f));
  }, [
    editForm?.city_ids,
    editForm?.story_types,
    feedProducerUsesLiveTemplate,
    editForm?.job_type,
  ]);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "completed":
        return "var(--success)";
      case "failed":
        return "var(--error)";
      case "running":
        return "#3b82f6";
      case "pending":
        return "var(--warning)";
      case "cancelled":
        return "var(--text-secondary, var(--text-muted))";
      case "active":
        return "var(--success)";
      case "paused":
        return "var(--warning)";
      case "disabled":
        return "var(--text-secondary, var(--text-muted))";
      default:
        return "var(--text-secondary, var(--text-muted))";
    }
  };

  const formatDateShort = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const displayError = localError || scheduleError;

  const openEdit = (job: CustomScheduledJob) => {
    setEditJob(job);
    const cfg = job.job_config || {};
    const cfgRec = cfg as Record<string, unknown>;
    const isFeedJob =
      job.job_type === "feed_producer" || job.job_type === "feed_stories";
    const explicitStored =
      (typeof cfg.prompt === "string" && cfg.prompt.trim() !== "") ||
      (typeof cfg.question === "string" && cfg.question.trim() !== "");

    let initialPromptText = "";
    if (isFeedJob && !explicitStored) {
      initialPromptText =
        buildStandardFeedProducerDefaultPrompt(
          cityIdsFromJobConfig(cfgRec),
          storyTypesFromJobConfig(cfgRec),
        ) ?? "";
      setFeedProducerUsesLiveTemplate(true);
    } else if (job.job_type === "district_feed_stories" && !explicitStored) {
      // Prefill the server's built-in template so admins edit the default
      // rather than starting from a blank override.
      initialPromptText = districtDefaultPrompt?.template ?? "";
      setFeedProducerUsesLiveTemplate(false);
    } else {
      initialPromptText =
        typeof cfg.prompt === "string"
          ? cfg.prompt
          : typeof cfg.question === "string"
            ? cfg.question
            : "";
      setFeedProducerUsesLiveTemplate(false);
    }

    setEditForm({
      name: job.name || "",
      job_type: job.job_type || "",
      schedule_type: job.schedule_type || "daily",
      schedule_hour: job.schedule_hour !== null && job.schedule_hour !== undefined ? String(job.schedule_hour) : "",
      schedule_minute: job.schedule_minute !== null && job.schedule_minute !== undefined ? String(job.schedule_minute) : "0",
      schedule_day_of_week: job.schedule_day_of_week !== null && job.schedule_day_of_week !== undefined ? String(job.schedule_day_of_week) : "0",
      schedule_day_of_month: job.schedule_day_of_month !== null && job.schedule_day_of_month !== undefined ? String(job.schedule_day_of_month) : "1",
      timezone: job.timezone || "UTC",
      max_concurrent_cities: job.max_concurrent_cities !== null && job.max_concurrent_cities !== undefined ? String(job.max_concurrent_cities) : "2",
      per_city_concurrency: job.per_city_concurrency !== null && job.per_city_concurrency !== undefined ? String(job.per_city_concurrency) : "2",
      cron_expression: job.cron_expression || "",
      question: initialPromptText,
      feed_producer_mode: Boolean(cfg.feed_producer_mode),
      city_ids: Array.isArray(cfg.city_ids) ? cfg.city_ids.join(", ") : (cfg.city_ids || ""),
      story_types: Array.isArray(cfg.story_types) ? cfg.story_types.join(", ") : (cfg.story_types || ""),
      test_user_id: cfg.user_id != null ? String(cfg.user_id) : "",
      model_key: typeof cfg.model_key === "string" ? cfg.model_key : "",
    });
  };

  const closeEdit = () => {
    setEditJob(null);
    setEditForm(null);
    setFeedProducerUsesLiveTemplate(false);
    setFeedProducerCityQuery("");
    setFeedProducerCityHighlight(0);
    setFeedProducerCityFocused(false);
  };

  const feedProducerSelectedCityIds = useMemo(() => {
    if (!editForm || editForm.job_type !== "feed_producer") return [];
    return parseCityIdsFromCsv(editForm.city_ids);
  }, [editForm?.city_ids, editForm?.job_type]);

  const feedProducerCitySuggestions = useMemo(() => {
    if (!editForm || editForm.job_type !== "feed_producer") return [];
    const q = feedProducerCityQuery.trim().toLowerCase();
    const selected = new Set(feedProducerSelectedCityIds);
    let rows = cityDirectory.filter((c) => !selected.has(c.city_id));
    if (q) {
      rows = rows.filter((c) => {
        const name = (c.city_name || "").toLowerCase();
        const st = (c.state || "").toLowerCase();
        const country = (c.country || "").toLowerCase();
        const idStr = String(c.city_id);
        return (
          name.includes(q) ||
          st.includes(q) ||
          country.includes(q) ||
          idStr === q ||
          idStr.includes(q)
        );
      });
    }
    rows = [...rows].sort((a, b) =>
      a.city_name.localeCompare(b.city_name, undefined, { sensitivity: "base" }),
    );
    return rows.slice(0, 20);
  }, [
    cityDirectory,
    editForm?.job_type,
    feedProducerCityQuery,
    feedProducerSelectedCityIds,
  ]);

  useEffect(() => {
    setFeedProducerCityHighlight(0);
  }, [feedProducerCityQuery, editForm?.city_ids, editForm?.job_type]);

  const addFeedProducerCityId = (id: number) => {
    setEditForm((f) => {
      if (!f || f.job_type !== "feed_producer") return f;
      const ids = parseCityIdsFromCsv(f.city_ids);
      if (ids.includes(id)) return f;
      return { ...f, city_ids: [...ids, id].join(", ") };
    });
    setFeedProducerCityQuery("");
  };

  const removeFeedProducerCityId = (id: number) => {
    setEditForm((f) => {
      if (!f || f.job_type !== "feed_producer") return f;
      const ids = parseCityIdsFromCsv(f.city_ids).filter((x) => x !== id);
      return { ...f, city_ids: ids.join(", ") };
    });
  };

  const handleSaveEdit = async () => {
    if (!editJob || !editForm) return;
    try {
      setLocalError(null);
      const currentToken = token || (await getAccessTokenSilently());

      const scheduleType = editForm.schedule_type;
      const payload: any = {
        schedule_type: scheduleType,
        timezone: editForm.timezone || "UTC",
        max_concurrent_cities: Number(editForm.max_concurrent_cities || "2"),
        per_city_concurrency: Number(editForm.per_city_concurrency || "2"),
      };
      const trimmedName = editForm.name?.trim() ?? "";
      if (trimmedName !== editJob.name) {
        payload.name = trimmedName;
      }
      if (editForm.job_type && editForm.job_type !== editJob.job_type) {
        payload.job_type = editForm.job_type;
      }

      if (scheduleType === "cron") {
        payload.cron_expression = editForm.cron_expression || null;
      } else if (scheduleType === "hourly") {
        payload.schedule_minute = Number(editForm.schedule_minute || "0");
      } else if (scheduleType === "daily") {
        payload.schedule_hour = Number(editForm.schedule_hour || "0");
        payload.schedule_minute = Number(editForm.schedule_minute || "0");
      } else if (scheduleType === "weekly") {
        payload.schedule_day_of_week = Number(editForm.schedule_day_of_week || "0");
        payload.schedule_hour = Number(editForm.schedule_hour || "0");
        payload.schedule_minute = Number(editForm.schedule_minute || "0");
      } else if (scheduleType === "monthly") {
        payload.schedule_day_of_month = Number(editForm.schedule_day_of_month || "1");
        payload.schedule_hour = Number(editForm.schedule_hour || "0");
        payload.schedule_minute = Number(editForm.schedule_minute || "0");
      }

      // Build updated job_config — merge all editable config fields
      const origCfg = editJob.job_config || {};
      const newCfg: Record<string, any> = { ...origCfg };

      const trimmedDraft = editForm.question.trim();
      const origDraft = String(
        typeof origCfg.prompt === "string"
          ? origCfg.prompt
          : typeof origCfg.question === "string"
            ? origCfg.question
            : "",
      ).trim();
      const promptFieldChanged = trimmedDraft !== origDraft;

      if (editForm.job_type === "research") {
        if (promptFieldChanged) {
          if (trimmedDraft) {
            newCfg.question = trimmedDraft;
          } else {
            delete newCfg.question;
          }
          delete newCfg.prompt;
        }
      } else if (editForm.job_type === "feed_producer" || editForm.job_type === "feed_stories") {
        if (trimmedDraft) {
          newCfg.prompt = trimmedDraft;
          delete newCfg.question;
        } else {
          delete newCfg.prompt;
          delete newCfg.question;
        }
      } else if (editForm.job_type === "district_feed_stories") {
        // Only persist a custom prompt when it diverges from the built-in
        // template; matching the default (or clearing the field) drops the
        // override so the job follows future default-template updates.
        const defaultTemplate = (districtDefaultPrompt?.template ?? "").trim();
        if (!trimmedDraft || trimmedDraft === defaultTemplate) {
          delete newCfg.prompt;
          delete newCfg.question;
        } else if (promptFieldChanged) {
          newCfg.prompt = trimmedDraft;
          delete newCfg.question;
        }
      } else if (editForm.job_type === "personalized_feed_producer") {
        if (promptFieldChanged) {
          if (trimmedDraft) {
            newCfg.prompt = trimmedDraft;
            delete newCfg.question;
          } else {
            delete newCfg.prompt;
            delete newCfg.question;
          }
        }
      }

      newCfg.feed_producer_mode = editForm.feed_producer_mode;

      const parsedCityIds = editForm.city_ids
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => !isNaN(n));
      newCfg.city_ids = parsedCityIds.length > 0 ? parsedCityIds : undefined;

      const parsedStoryTypes = editForm.story_types
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      newCfg.story_types = parsedStoryTypes.length > 0 ? parsedStoryTypes : undefined;

      const parsedUserId = editForm.test_user_id.trim()
        ? Number(editForm.test_user_id.trim())
        : undefined;
      newCfg.user_id = !isNaN(parsedUserId as number) ? parsedUserId : undefined;

      const trimmedModelKey = editForm.model_key.trim();
      newCfg.model_key = trimmedModelKey || undefined;

      // Remove undefined keys
      Object.keys(newCfg).forEach((k) => newCfg[k] === undefined && delete newCfg[k]);

      if (JSON.stringify(newCfg) !== JSON.stringify(origCfg)) {
        payload.job_config = newCfg;
      }

      await updateCustomScheduledJob(editJob.id, payload, currentToken);
      closeEdit();
      onRefresh();
    } catch (err) {
      console.error("Error updating custom scheduled job:", err);
      setLocalError("Failed to update scheduled job. Please try again.");
    }
  };

  const handleRunCustomJob = async (job: CustomScheduledJob) => {
    if (runningCustomJobId !== null) return;
    try {
      setRunningCustomJobId(job.id);
      setLocalError(null);
      setRunSuccessMessage(null);
      const currentToken = token || (await getAccessTokenSilently());
      const res = await runCustomScheduledJob(job.id, currentToken);
      if (res?.status === "skipped") {
        setLocalError(res?.message ?? "Job was skipped (e.g. not active). Resume it first to run.");
        return;
      }
      if (res?.job_id) {
        notifyJobCreated(String(res.job_id));
        setRunSuccessMessage({ jobId: res.job_id, jobName: job.name });
        setTimeout(() => setRunSuccessMessage(null), 8000);
      }
      setTimeout(() => onRefresh(), 1000);
    } catch (err) {
      console.error("Error running custom scheduled job:", err);
      setLocalError("Failed to run custom scheduled job. Please try again.");
    } finally {
      setRunningCustomJobId(null);
    }
  };

  const handleRunPersonalTest = async (job: CustomScheduledJob) => {
    if (runningPersonalTestJobId !== null) return;
    try {
      setRunningPersonalTestJobId(job.id);
      setLocalError(null);
      setRunSuccessMessage(null);
      const currentToken = token || (await getAccessTokenSilently());
      const res = await runCustomScheduledJobForCurrentUser(job.id, currentToken);
      if (res?.status === "skipped") {
        setLocalError(res?.message ?? "Job was skipped. Resume it first to run.");
        return;
      }
      if (res?.job_id) {
        notifyJobCreated(String(res.job_id));
        setRunSuccessMessage({ jobId: res.job_id, jobName: `${job.name} (my places)` });
        setTimeout(() => setRunSuccessMessage(null), 8000);
      }
      setTimeout(() => onRefresh(), 1000);
    } catch (err) {
      console.error("Error running personal test:", err);
      setLocalError("Failed to run personal test. Please try again.");
    } finally {
      setRunningPersonalTestJobId(null);
    }
  };

  const handleToggleCustomJob = async (job: CustomScheduledJob) => {
    try {
      setLocalError(null);
      const currentToken = token || (await getAccessTokenSilently());
      if (job.status === "active") {
        await pauseCustomScheduledJob(job.id, currentToken);
      } else if (job.status === "paused") {
        await resumeCustomScheduledJob(job.id, currentToken);
      }
      onRefresh();
    } catch (err) {
      console.error("Error toggling custom scheduled job:", err);
      setLocalError("Failed to update job status. Please try again.");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h3 className={styles.title}>Scheduled Jobs</h3>
          <p className={styles.subtitle}>
            Database-backed schedules. ▶ runs now. Use filters to show paused jobs.
          </p>
        </div>
        {scheduleLoading && (
          <div className={styles.headerLoader}>
            <Loader size="sm" color="purple" />
          </div>
        )}
      </div>

      {displayError && (
        <div className={styles.error}>{displayError}</div>
      )}

      {runSuccessMessage && (
        <div className={styles.successMessage}>
          <span>
            <strong>{runSuccessMessage.jobName}</strong> run started.{" "}
            <Link
              href={`/home?tab=logs&job_id=${encodeURIComponent(runSuccessMessage.jobId)}`}
              className={styles.viewRunLink}
            >
              View in Job Logs
            </Link>
          </span>
        </div>
      )}

      {!scheduleLoading && customSchedules.length === 0 && !displayError && (
        <div className={styles.empty}>
          <p>No scheduled jobs configured.</p>
        </div>
      )}

      {customSchedules.length > 0 && (
        <div className={styles.section}>
          <div className={styles.filterBar}>
            <label className={styles.filterLabel}>
              Status
              <select
                className={styles.filterSelect}
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as typeof statusFilter)
                }
                aria-label="Filter by schedule status"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="disabled">Disabled</option>
                <option value="all">All</option>
              </select>
            </label>
            <label className={styles.filterLabel}>
              Job type
              <select
                className={styles.filterSelect}
                value={jobTypeFilter}
                onChange={(e) => setJobTypeFilter(e.target.value)}
                aria-label="Filter by job type"
              >
                <option value="all">All types</option>
                {jobTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.filterLabel}>
              City in config
              <select
                className={styles.filterSelect}
                value={cityFilterId}
                onChange={(e) => setCityFilterId(e.target.value)}
                disabled={cityIdsReferencedBySchedules.length === 0}
                aria-label="Filter by city ID in job config"
                title={
                  cityIdsReferencedBySchedules.length === 0
                    ? "No schedules include city_ids or city_id in job config"
                    : "Show schedules whose job config lists this city"
                }
              >
                <option value="">All cities</option>
                {cityIdsReferencedBySchedules.map((id) => (
                  <option key={id} value={String(id)}>
                    {cityLabel(id)}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${styles.filterLabel} ${styles.filterSearch}`}>
              Search
              <input
                className={styles.filterInput}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name or type…"
                aria-label="Search schedules by name or type"
              />
            </label>
            <div className={styles.filterSummary}>
              Showing{" "}
              <strong>{filteredSchedules.length}</strong> of{" "}
              <strong>{customSchedules.length}</strong>
              {(statusFilter !== "active" ||
                jobTypeFilter !== "all" ||
                searchQuery.trim() ||
                cityFilterId !== "") && (
                <button
                  type="button"
                  className={styles.resetFilters}
                  onClick={() => {
                    setStatusFilter("active");
                    setJobTypeFilter("all");
                    setSearchQuery("");
                    setCityFilterId("");
                  }}
                >
                  Reset filters
                </button>
              )}
            </div>
          </div>

          {filteredSchedules.length === 0 ? (
            <div className={styles.emptyFiltered}>
              <p>No schedules match the current filters.</p>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setStatusFilter("all");
                  setJobTypeFilter("all");
                  setSearchQuery("");
                  setCityFilterId("");
                }}
              >
                Show all schedules
              </button>
            </div>
          ) : (
            <div className={styles.list}>
              {filteredSchedules.map((job) => (
                <div key={job.id} className={styles.compactRow}>
                  <div className={styles.rowLine1}>
                    <div className={styles.rowMain}>
                      <span className={styles.rowId} title={`Job ID ${job.id}`}>
                        #{job.id}
                      </span>
                      <span className={styles.rowName} title={job.name}>
                        {job.name}
                      </span>
                      <span className={styles.rowCadence}>
                        {job.schedule_description || job.schedule_type}
                      </span>
                      <span className={styles.rowJobType}>{job.job_type}</span>
                      {job.job_config?.feed_producer_mode && (
                        <span className={styles.miniBadge}>feed</span>
                      )}
                      {job.job_config?.model_key && (
                        <span
                          className={styles.miniBadgeMuted}
                          title="Model"
                        >
                          {job.job_config.model_key}
                        </span>
                      )}
                    </div>
                    <div className={styles.rowActions}>
                      <span
                        className={styles.statusPill}
                        style={{
                          color: getStatusColor(job.status),
                          borderColor: getStatusColor(job.status),
                        }}
                        title="Schedule status"
                      >
                        {job.status}
                      </span>
                      <button
                        type="button"
                        className={styles.compactBtn}
                        onClick={() => openEdit(job)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.compactBtn}
                        onClick={() => handleToggleCustomJob(job)}
                        disabled={job.status === "disabled"}
                      >
                        {job.status === "active"
                          ? "Pause"
                          : job.status === "paused"
                            ? "Resume"
                            : "Disabled"}
                      </button>
                      <button
                        type="button"
                        className={styles.compactRun}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRunCustomJob(job);
                        }}
                        disabled={runningCustomJobId !== null}
                        title={`Run ${job.name} now`}
                      >
                        {runningCustomJobId === job.id ? (
                          <Loader size="sm" color="purple" />
                        ) : (
                          "▶"
                        )}
                      </button>
                      {job.job_type === "personalized_feed_producer" && (
                        <button
                          type="button"
                          className={styles.compactBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRunPersonalTest(job);
                          }}
                          disabled={runningPersonalTestJobId !== null}
                          title="Run for your own saved places (test)"
                        >
                          {runningPersonalTestJobId === job.id ? (
                            <Loader size="sm" color="purple" />
                          ) : (
                            "My places"
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className={styles.rowLine2}>
                    <span className={styles.rowMeta}>
                      <span className={styles.metaPiece}>
                        Next{" "}
                        {job.next_run_at
                          ? formatDateShort(job.next_run_at)
                          : "—"}
                      </span>
                      <span className={styles.metaSep}>·</span>
                      <span className={styles.metaPiece}>
                        Last{" "}
                        {job.last_run_at
                          ? formatDateShort(job.last_run_at)
                          : "never"}
                        {job.last_run_status ? (
                          <>
                            {" "}
                            <span
                              className={styles.lastRunStatus}
                              style={{
                                color: getStatusColor(job.last_run_status),
                              }}
                            >
                              {job.last_run_status}
                            </span>
                          </>
                        ) : null}
                        {job.last_run_job_id ? (
                          <>
                            {" "}
                            <Link
                              href={`/home?tab=logs&job_id=${encodeURIComponent(job.last_run_job_id)}`}
                              className={styles.viewRunLink}
                            >
                              log
                            </Link>
                          </>
                        ) : null}
                      </span>
                    </span>
                    {job.description?.trim() ? (
                      <span
                        className={styles.rowDescription}
                        title={job.description || undefined}
                      >
                        {job.description}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editJob && editForm && (
        <div className={styles.modalOverlay} onClick={closeEdit}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>Edit: {editForm.name || editJob.name}</div>
              <button className={styles.iconButton} onClick={closeEdit}>
                ✕
              </button>
            </div>

            <div className={styles.formRow}>
              <label className={styles.label}>Job title</label>
              <input
                className={styles.input}
                type="text"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                placeholder="e.g. Weekly research digest"
                aria-label="Job title"
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.label}>Job type</label>
              <select
                className={styles.input}
                value={editForm.job_type}
                onChange={(e) => {
                  const nextType = e.target.value;
                  if (!editForm) return;
                  if (nextType !== "feed_producer") {
                    setFeedProducerCityQuery("");
                    setFeedProducerCityHighlight(0);
                    setFeedProducerCityFocused(false);
                  }
                  const wasFeed =
                    editForm.job_type === "feed_producer" ||
                    editForm.job_type === "feed_stories";
                  const nowFeed =
                    nextType === "feed_producer" || nextType === "feed_stories";
                  if (nowFeed && !wasFeed) {
                    setFeedProducerUsesLiveTemplate(true);
                    const ids = parseCityIdsFromCsv(editForm.city_ids);
                    const types = parseStoryTypesFromCsv(editForm.story_types);
                    setEditForm({
                      ...editForm,
                      job_type: nextType,
                      question:
                        buildStandardFeedProducerDefaultPrompt(ids, types) ?? "",
                    });
                    return;
                  }
                  if (!nowFeed) {
                    setFeedProducerUsesLiveTemplate(false);
                  }
                  setEditForm({ ...editForm, job_type: nextType });
                }}
                aria-label="Job type"
              >
                {[
                  "research",
                  "feed_producer",
                  "personalized_feed_producer",
                  "feed_stories",
                  "district_feed_stories",
                  "context_stories",
                  "batch_metric_execution",
                  "daily_metrics",
                  "weekly_metrics",
                  "monthly_metrics",
                  "annual_metrics",
                  "database_cleanup",
                  "weekly_newsletter",
                  "check_email",
                  "population_refresh",
                  "personalized_place_refresh",
                ].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {editForm.job_type !== editJob.job_type && (
                <p className={styles.promptVariablesNote} style={{ color: "#b45309", marginTop: "0.25rem" }}>
                  ⚠ Changing job type will take effect on the next run.
                </p>
              )}
            </div>

            {(editForm.job_type === "research" || editForm.job_type === "context_stories") && (
              <div className={styles.formRow}>
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={editForm.feed_producer_mode}
                    onChange={(e) => setEditForm({ ...editForm, feed_producer_mode: e.target.checked })}
                    aria-label="Enable feed producer mode"
                  />
                  <span>
                    <strong>Feed producer mode</strong>{" "}
                    — skip research report; use full Seymour (analytics + charts + maps) to publish stories directly via <code>create_feed_story</code>
                  </span>
                </label>
              </div>
            )}

            {editForm.job_type === "feed_producer" && cityDirectory.length > 0 && (
              <div className={styles.formRow}>
                <label className={styles.label} id="feed-producer-cities-label">
                  Cities{" "}
                  <span style={{ fontWeight: 400 }}>(search by name or ID; required)</span>
                </label>
                <div
                  className={styles.cityPillWrap}
                  role="group"
                  aria-labelledby="feed-producer-cities-label"
                >
                  {feedProducerSelectedCityIds.length === 0 ? (
                    <span className={styles.cityPillEmpty}>No cities selected</span>
                  ) : (
                    <div className={styles.cityPillRow}>
                      {feedProducerSelectedCityIds.map((id) => (
                        <span key={id} className={styles.cityPill}>
                          <span className={styles.cityPillText}>
                            {cityLabel(id)}
                            <span className={styles.cityPillId}>#{id}</span>
                          </span>
                          <button
                            type="button"
                            className={styles.cityPillRemove}
                            onClick={() => removeFeedProducerCityId(id)}
                            aria-label={`Remove ${cityLabel(id)}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className={styles.cityAutocomplete}>
                    <input
                      className={styles.input}
                      type="text"
                      value={feedProducerCityQuery}
                      onChange={(e) => setFeedProducerCityQuery(e.target.value)}
                      onFocus={() => setFeedProducerCityFocused(true)}
                      onBlur={() => {
                        window.setTimeout(() => setFeedProducerCityFocused(false), 200);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          if (feedProducerCitySuggestions.length === 0) return;
                          setFeedProducerCityHighlight((h) =>
                            Math.min(feedProducerCitySuggestions.length - 1, h + 1),
                          );
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setFeedProducerCityHighlight((h) => Math.max(0, h - 1));
                        } else if (e.key === "Enter") {
                          e.preventDefault();
                          const pick = feedProducerCitySuggestions[feedProducerCityHighlight];
                          if (pick) {
                            addFeedProducerCityId(pick.city_id);
                            return;
                          }
                          const raw = feedProducerCityQuery.trim();
                          if (/^\d+$/.test(raw)) {
                            addFeedProducerCityId(Number(raw));
                          }
                        } else if (e.key === "Escape") {
                          setFeedProducerCityQuery("");
                        } else if (e.key === "Backspace" && !feedProducerCityQuery.trim()) {
                          const ids = feedProducerSelectedCityIds;
                          if (ids.length > 0) {
                            removeFeedProducerCityId(ids[ids.length - 1]);
                          }
                        }
                      }}
                      placeholder="Search cities…"
                      aria-label="Search cities to add"
                      aria-autocomplete="list"
                      aria-controls="feed-producer-city-suggestions"
                      aria-expanded={
                        feedProducerCityFocused && feedProducerCitySuggestions.length > 0
                      }
                      autoComplete="off"
                    />
                    {feedProducerCityFocused && feedProducerCitySuggestions.length > 0 && (
                      <ul
                        id="feed-producer-city-suggestions"
                        className={styles.citySuggestionList}
                        role="listbox"
                      >
                        {feedProducerCitySuggestions.map((c, i) => {
                          const region = [c.state, c.country].filter(Boolean).join(", ");
                          return (
                            <li key={c.city_id} role="presentation">
                              <button
                                type="button"
                                role="option"
                                aria-selected={i === feedProducerCityHighlight}
                                className={
                                  i === feedProducerCityHighlight
                                    ? styles.citySuggestionOptionActive
                                    : styles.citySuggestionOption
                                }
                                onMouseDown={(ev) => {
                                  ev.preventDefault();
                                  addFeedProducerCityId(c.city_id);
                                }}
                                onMouseEnter={() => setFeedProducerCityHighlight(i)}
                              >
                                <span className={styles.citySuggestionName}>{c.city_name}</span>
                                {region ? (
                                  <span className={styles.citySuggestionMeta}>{region}</span>
                                ) : null}
                                <span className={styles.citySuggestionId}>#{c.city_id}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <p className={styles.promptVariablesNote}>
                    Add by search or type a numeric ID and press Enter. Backspace on an empty
                    search removes the last city.
                  </p>
                </div>
              </div>
            )}

            {editForm.job_type === "feed_producer" && cityDirectory.length === 0 && (
              <div className={styles.formRow}>
                <label className={styles.label}>
                  City IDs{" "}
                  <span style={{ fontWeight: 400 }}>
                    (comma-separated; city list failed to load — enter IDs manually)
                  </span>
                </label>
                <input
                  className={styles.input}
                  type="text"
                  value={editForm.city_ids}
                  onChange={(e) => setEditForm({ ...editForm, city_ids: e.target.value })}
                  placeholder="e.g. 1, 3, 12"
                  aria-label="City IDs"
                />
              </div>
            )}

            {(editForm.job_type === "feed_stories" || editForm.job_type === "context_stories") && (
              <div className={styles.formRow}>
                <label className={styles.label}>
                  City IDs{" "}
                  <span style={{ fontWeight: 400 }}>
                    {editForm.job_type === "context_stories"
                      ? "(comma-separated; optional — defaults to all cities with active metrics)"
                      : "(comma-separated; required)"}
                  </span>
                </label>
                <input
                  className={styles.input}
                  type="text"
                  value={editForm.city_ids}
                  onChange={(e) => setEditForm({ ...editForm, city_ids: e.target.value })}
                  placeholder="e.g. 1, 3, 12"
                  aria-label="City IDs"
                />
              </div>
            )}

            {editForm.job_type === "personalized_feed_producer" && (
              <div className={styles.formRow}>
                <label className={styles.label}>
                  Test user ID{" "}
                  <span style={{ fontWeight: 400 }}>
                    (leave blank to run for all users with saved places)
                  </span>
                </label>
                <input
                  className={styles.input}
                  type="number"
                  value={editForm.test_user_id}
                  onChange={(e) => setEditForm({ ...editForm, test_user_id: e.target.value })}
                  placeholder="e.g. 42"
                  aria-label="Test user ID"
                />
              </div>
            )}

            {(editForm.job_type === "feed_producer" || editForm.job_type === "feed_stories" || editForm.job_type === "personalized_feed_producer") && (
              <div className={styles.formRow}>
                <label className={styles.label}>Story types <span style={{ fontWeight: 400 }}>(comma-separated; leave blank for default)</span></label>
                <input
                  className={styles.input}
                  type="text"
                  value={editForm.story_types}
                  onChange={(e) => setEditForm({ ...editForm, story_types: e.target.value })}
                  placeholder="e.g. alert, trend, multi_metric"
                  aria-label="Story types"
                />
                <p className={styles.promptVariablesNote}>
                  Options: <code>alert</code>, <code>trend</code>, <code>multi_metric</code>, <code>business</code>, <code>spending</code>, <code>safety</code>, <code>context</code>, <code>off_the_charts</code>
                </p>
              </div>
            )}

            {(editForm.job_type === "feed_producer" || editForm.job_type === "feed_stories" || editForm.job_type === "personalized_feed_producer" || editForm.job_type === "district_feed_stories") && (
              <div className={styles.formRow}>
                <label className={styles.label}>
                  Model{" "}
                  <span style={{ fontWeight: 400 }}>(leave blank to use server default: <code>claude-sonnet-4.6</code>)</span>
                </label>
                <select
                  className={styles.input}
                  value={editForm.model_key}
                  onChange={(e) => setEditForm({ ...editForm, model_key: e.target.value })}
                  aria-label="Model"
                >
                  <option value="">— server default (claude-sonnet-4.6) —</option>
                  {availableModels.flatMap((group) =>
                    group.models.map((model) => (
                      <option key={model.key} value={model.key}>
                        {model.key} ({group.label})
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}

            {editForm.job_type === "research" && (
              <div className={styles.formRow}>
                <label className={styles.label}>Research prompt</label>
                <p className={styles.promptVariablesNote}>
                  Prompt variables (replaced at run time):{" "}
                  <code>{`{last_run}`}</code> — date/time of the previous run, or &quot;Never&quot; if first run;{" "}
                  <code>{`{now}`}</code> — date/time of this run. Use these to refer to time since last run (e.g. &quot;What changed since {`{last_run}`}?&quot;).
                </p>
                <textarea
                  className={styles.promptInput}
                  value={editForm.question}
                  onChange={(e) =>
                    setEditForm({ ...editForm, question: e.target.value })
                  }
                  rows={14}
                  spellCheck={false}
                  aria-label="Research prompt"
                />
              </div>
            )}

            {(editForm.job_type === "feed_producer" || editForm.job_type === "feed_stories") && (
              <div className={styles.formRow}>
                <label className={styles.label}>Feed producer prompt</label>
                <p className={styles.promptVariablesNote}>
                  This is the exact text sent to{" "}
                  <code>run_feed_producer_job</code> (Seymour, feed_producer tools). It is saved as{" "}
                  <code>prompt</code> in job config. We pre-fill the same template the API would use when{" "}
                  <code>prompt</code> was unset, so you edit the default instead of an &quot;override&quot;.
                  Clear the field and save to drop <code>prompt</code> and let the server build the default again
                  from city IDs and story types at run time.
                </p>
                {feedProducerUsesLiveTemplate && (
                  <p className={styles.promptVariablesNote} style={{ color: "#0369a1" }}>
                    Prompt is <strong>linked</strong> to City IDs and Story types — change those fields to refresh
                    the opening lines, or edit this text to detach.
                  </p>
                )}
                <textarea
                  className={styles.promptInput}
                  value={editForm.question}
                  onChange={(e) => {
                    setFeedProducerUsesLiveTemplate(false);
                    setEditForm({ ...editForm, question: e.target.value });
                  }}
                  rows={12}
                  spellCheck={false}
                  placeholder="Add city IDs above to generate the default template, or type a custom prompt…"
                  aria-label="Feed producer prompt"
                />
                <button
                  type="button"
                  className={styles.secondaryButton}
                  style={{ marginTop: "0.5rem" }}
                  onClick={() => {
                    if (!editForm) return;
                    setFeedProducerUsesLiveTemplate(true);
                    const ids = parseCityIdsFromCsv(editForm.city_ids);
                    const types = parseStoryTypesFromCsv(editForm.story_types);
                    const next = buildStandardFeedProducerDefaultPrompt(ids, types) ?? "";
                    setEditForm({ ...editForm, question: next });
                  }}
                >
                  Reset prompt from city IDs &amp; story types
                </button>
              </div>
            )}

            {editForm.job_type === "district_feed_stories" && (
              <div className={styles.formRow}>
                <label className={styles.label}>
                  Per-city prompt template{" "}
                  <span style={{ fontWeight: 400 }}>
                    {typeof editJob.job_config?.prompt === "string" &&
                    editJob.job_config.prompt.trim() !== ""
                      ? `(custom v${editJob.job_config?.prompt_version ?? "?"})`
                      : `(built-in default${districtDefaultPrompt ? ` v${districtDefaultPrompt.version}` : ""})`}
                  </span>
                </label>
                <p className={styles.promptVariablesNote}>
                  Pre-filled with the built-in template — edit it to save a custom
                  version. Each save that changes the text bumps the prompt version
                  (kept in <code>prompt_history</code>) and runs record which version
                  produced them, so versions can be compared. Restoring the text to
                  match the default (or clearing it) drops the override so the job
                  follows future built-in template updates.
                </p>
                <p className={styles.promptVariablesNote}>
                  At run time the server finds every district with active weekly
                  newsletter subscribers and runs the feed producer once per city.
                  Placeholders:{" "}
                  <code>{`{city_name}`}</code> / <code>{`{city_id}`}</code> — city being processed;{" "}
                  <code>{`{districts}`}</code> — district numbers with weekly subscribers;{" "}
                  <code>{`{last_run}`}</code> / <code>{`{now}`}</code> — run timestamps;{" "}
                  <code>{`{recent_feed_stories_context}`}</code> — recent weekly stories
                  scoped to this run&apos;s districts (headline + district) to avoid repeats.
                </p>
                <textarea
                  className={styles.promptInput}
                  value={editForm.question}
                  onChange={(e) =>
                    setEditForm({ ...editForm, question: e.target.value })
                  }
                  rows={16}
                  spellCheck={false}
                  placeholder="Loading built-in template…"
                  aria-label="District feed stories prompt template"
                />
                {districtDefaultPrompt && (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    style={{ marginTop: "0.5rem" }}
                    onClick={() => {
                      if (!editForm) return;
                      setEditForm({
                        ...editForm,
                        question: districtDefaultPrompt.template,
                      });
                    }}
                  >
                    Reset to built-in default
                  </button>
                )}
              </div>
            )}

            {editForm.job_type === "personalized_feed_producer" && (
              <div className={styles.formRow}>
                <label className={styles.label}>Custom prompt template (optional)</label>
                <p className={styles.promptVariablesNote}>
                  Leave empty to use the built-in slim template (recommended). The server
                  injects investigation and writing rules via system sections automatically.
                </p>
                <p className={styles.promptVariablesNote}>
                  Placeholders replaced at run time:{" "}
                  <code>{`{last_run}`}</code> — ISO timestamp of previous run (or &quot;Never&quot;);{" "}
                  <code>{`{now}`}</code> — ISO timestamp of this run;{" "}
                  <code>{`{user_id}`}</code> — subscriber auth0 ID;{" "}
                  <code>{`{user_places}`}</code> — one line per saved place (place_id, label, city_id, lat, lng, radius_m);{" "}
                  <code>{`{story_types}`}</code> — comma-separated story types from the field above.
                </p>
                <p className={styles.promptVariablesNote} style={{ color: "#b45309" }}>
                  <strong>Limit:</strong> at most 1 story per saved place per run. Detailed rules
                  (pipeline, voice, visuals) live in the system prompt — keep this template short.
                </p>
                <textarea
                  className={styles.promptInput}
                  value={editForm.question}
                  onChange={(e) =>
                    setEditForm({ ...editForm, question: e.target.value })
                  }
                  rows={10}
                  spellCheck={false}
                  placeholder={
                    "Leave empty to use built-in template, or paste a custom override:\n\n" +
                    "Last run: {last_run}\nNow: {now}\n\n" +
                    "Generate weekly personalized feed stories for user_id={user_id}.\n\n" +
                    "Saved places:\n{user_places}\n\n" +
                    "Story types: {story_types}\n\n" +
                    "Hard limits:\n" +
                    "- At most ONE create_feed_story per place_id this run (0 if nothing notable).\n" +
                    "- Place-scoped data only; use each place's label in copy, not generic \"your block.\"\n" +
                    "- Follow system sections: personalized_feed_producer_tools, feed_story_authoring."
                  }
                  aria-label="Personalized feed producer prompt template"
                />
              </div>
            )}

            <div className={styles.formRow}>
              <label className={styles.label}>Schedule type</label>
              <select
                className={styles.input}
                value={editForm.schedule_type}
                onChange={(e) =>
                  setEditForm({ ...editForm, schedule_type: e.target.value })
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="hourly">Hourly</option>
                <option value="cron">Cron</option>
              </select>
            </div>

            {editForm.schedule_type === "cron" && (
              <div className={styles.formRow}>
                <label className={styles.label}>Cron expression</label>
                <input
                  className={styles.input}
                  value={editForm.cron_expression}
                  onChange={(e) =>
                    setEditForm({ ...editForm, cron_expression: e.target.value })
                  }
                  placeholder="0 3 * * *"
                />
              </div>
            )}

            {editForm.schedule_type !== "cron" && (
              <>
                {(editForm.schedule_type === "daily" ||
                  editForm.schedule_type === "weekly" ||
                  editForm.schedule_type === "monthly") && (
                  <div className={styles.formRowSplit}>
                    <div className={styles.formRow}>
                      <label className={styles.label}>Hour (0-23)</label>
                      <input
                        className={styles.input}
                        value={editForm.schedule_hour}
                        onChange={(e) =>
                          setEditForm({ ...editForm, schedule_hour: e.target.value })
                        }
                      />
                    </div>
                    <div className={styles.formRow}>
                      <label className={styles.label}>Minute (0-59)</label>
                      <input
                        className={styles.input}
                        value={editForm.schedule_minute}
                        onChange={(e) =>
                          setEditForm({ ...editForm, schedule_minute: e.target.value })
                        }
                      />
                    </div>
                  </div>
                )}

                {editForm.schedule_type === "hourly" && (
                  <div className={styles.formRow}>
                    <label className={styles.label}>Minute (0-59)</label>
                    <input
                      className={styles.input}
                      value={editForm.schedule_minute}
                      onChange={(e) =>
                        setEditForm({ ...editForm, schedule_minute: e.target.value })
                      }
                    />
                  </div>
                )}

                {editForm.schedule_type === "weekly" && (
                  <div className={styles.formRow}>
                    <label className={styles.label}>Day of week (0=Sunday)</label>
                    <input
                      className={styles.input}
                      value={editForm.schedule_day_of_week}
                      onChange={(e) =>
                        setEditForm({ ...editForm, schedule_day_of_week: e.target.value })
                      }
                    />
                  </div>
                )}

                {editForm.schedule_type === "monthly" && (
                  <div className={styles.formRow}>
                    <label className={styles.label}>Day of month (1-31)</label>
                    <input
                      className={styles.input}
                      value={editForm.schedule_day_of_month}
                      onChange={(e) =>
                        setEditForm({ ...editForm, schedule_day_of_month: e.target.value })
                      }
                    />
                  </div>
                )}
              </>
            )}

            <div className={styles.formRow}>
              <label className={styles.label}>Timezone</label>
              <input
                className={styles.input}
                value={editForm.timezone}
                onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })}
                placeholder="UTC"
              />
            </div>

            <div className={styles.formRowSplit}>
              <div className={styles.formRow}>
                <label className={styles.label}>Max concurrent cities</label>
                <input
                  className={styles.input}
                  value={editForm.max_concurrent_cities}
                  onChange={(e) =>
                    setEditForm({ ...editForm, max_concurrent_cities: e.target.value })
                  }
                />
              </div>
              <div className={styles.formRow}>
                <label className={styles.label}>Per-city concurrency</label>
                <input
                  className={styles.input}
                  value={editForm.per_city_concurrency}
                  onChange={(e) =>
                    setEditForm({ ...editForm, per_city_concurrency: e.target.value })
                  }
                />
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.secondaryButton} onClick={closeEdit}>
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                onClick={handleSaveEdit}
                disabled={!editForm.name?.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
