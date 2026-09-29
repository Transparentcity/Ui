"use client";

/**
 * FeedAdmin — platform story desk.
 *
 * Same list, filters, review, and generate-story job as the city dashboard
 * Stories tab. Admins also get the platform auto-correct switch.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { toast } from "sonner";
import OpsStoriesTab from "@/components/admin/OpsStoriesTab";
import {
  getOpsCities,
  getStoryEvalSettings,
  updateStoryEvalSettings,
  type OpsCity,
  type StoryEvalSettings,
} from "@/lib/apiClient";
import styles from "./ProductAnalyticsDashboard.module.css";

const PRESETS = [
  { label: "L7", days: 7 },
  { label: "L30", days: 30 },
  { label: "L90", days: 90 },
];

interface FeedAdminProps {
  isAdmin?: boolean;
  onViewJob?: (jobId: string) => void;
}

export default function FeedAdmin({ isAdmin = false, onViewJob }: FeedAdminProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [cities, setCities] = useState<OpsCity[] | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);
  const [days, setDays] = useState(30);
  const [refreshToken, setRefreshToken] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [evalSettings, setEvalSettings] = useState<StoryEvalSettings | null>(null);
  const [savingEvalSettings, setSavingEvalSettings] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const res = await getOpsCities(token);
        if (cancelled) return;
        setCities(res.cities);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load cities");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getAccessTokenSilently]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const settings = await getStoryEvalSettings(token);
        if (!cancelled) setEvalSettings(settings);
      } catch (err) {
        console.error("Error loading story eval settings:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, getAccessTokenSilently]);

  const handleToggleAutoCorrect = useCallback(
    async (enabled: boolean) => {
      try {
        setSavingEvalSettings(true);
        const token = await getAccessTokenSilently();
        const settings = await updateStoryEvalSettings({ auto_correct: enabled }, token);
        setEvalSettings(settings);
        toast.success(
          enabled
            ? "Auto-correct on — failing stories get up to 3 repair attempts"
            : "Auto-correct off — failing stories keep their original text"
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save setting");
      } finally {
        setSavingEvalSettings(false);
      }
    },
    [getAccessTokenSilently]
  );

  const selected = cities?.find((c) => c.city_id === cityId) ?? null;

  if (cities && cities.length === 0) {
    return (
      <div className={styles.root}>
        <p className={styles.note}>No cities are available on this desk.</p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        {/* The city select is the title: the page already says "Feed" above. */}
        <div className={styles.toolbar}>
          {cities && cities.length > 0 && (
            <select
              className={styles.metricSelect}
              value={cityId ?? ""}
              onChange={(e) => setCityId(e.target.value ? Number(e.target.value) : null)}
              aria-label="City"
            >
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c.city_id} value={c.city_id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              className={days === p.days ? styles.presetBtnActive : styles.presetBtn}
              onClick={() => setDays(p.days)}
            >
              {p.label}
            </button>
          ))}
          {isAdmin && (
            <label
              className={styles.filterLabel}
              title={
                evalSettings?.auto_correct_env_override != null
                  ? "Pinned by STORY_EVAL_AUTO_CORRECT. The stored setting is ignored until that variable is removed."
                  : "When a judged story fails on accuracy, Seymour fixes the flagged claims and the story is re-judged."
              }
            >
              <input
                type="checkbox"
                checked={!!evalSettings?.auto_correct}
                disabled={
                  !evalSettings ||
                  savingEvalSettings ||
                  evalSettings.auto_correct_env_override != null
                }
                onChange={(e) => void handleToggleAutoCorrect(e.target.checked)}
              />
              Auto-correct
            </label>
          )}
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => setRefreshToken((n) => n + 1)}
          >
            ↻ Refresh
          </button>
        </div>
        {selected && !selected.can_manage && <div className={styles.subtitle}>View only</div>}
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {(cityId == null || selected) && (
        <OpsStoriesTab
          cityId={cityId}
          cityName={selected?.name ?? "All cities"}
          canManage={selected?.can_manage ?? false}
          canManageCity={(id) =>
            !!cities?.some((c) => c.city_id === id && c.can_manage)
          }
          generateCities={
            cityId == null
              ? (cities ?? [])
                  .filter((c) => c.can_manage)
                  .map((c) => ({ city_id: c.city_id, name: c.name }))
              : undefined
          }
          isAdmin={isAdmin}
          days={days}
          refreshToken={refreshToken}
          onViewJob={onViewJob}
        />
      )}
    </div>
  );
}
