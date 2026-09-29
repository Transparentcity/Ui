"use client";

/**
 * GenerateStoryModal — prompt-driven story generation for a city.
 *
 * Opens from the Stories tab. The user types a detailed brief; the feed
 * producer runs in the background and the story lands in the Stories list
 * once the job finishes and the judge approves it.
 */

import { useCallback, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { opsGenerateCityStory } from "@/lib/apiClient";
import styles from "./GenerateStoryModal.module.css";

const EXAMPLES = [
  "How has street sweeping complaint response time changed in the past three months? Focus on neighborhoods that have seen the biggest delays.",
  "Write a story about pothole closure rates in Oakland, comparing District 2 and District 5. Highlight any trends in the data.",
  "What are the most recent 911 response time statistics? Compare to last year and note anything unexpected.",
  "Summarize progress on affordable housing permits issued this year versus the city's stated goals.",
];

interface GenerateCityOption {
  city_id: number;
  name: string;
}

interface GenerateStoryModalProps {
  cityId: number;
  cityName: string;
  /** When set, the modal asks which city to generate for. */
  cities?: GenerateCityOption[];
  onClose: () => void;
  onStarted: (jobId: string | null) => void;
}

export default function GenerateStoryModal({
  cityId,
  cityName,
  cities,
  onClose,
  onStarted,
}: GenerateStoryModalProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [pickedId, setPickedId] = useState(cityId);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exampleOpen, setExampleOpen] = useState(false);
  const activeId = cities ? pickedId : cityId;
  const activeName = cities?.find((c) => c.city_id === pickedId)?.name ?? cityName;

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await opsGenerateCityStory(activeId, trimmed, token);
      onStarted(res.job_id);
      onClose();
    } catch (e: unknown) {
      if (e instanceof Response && e.status === 429) {
        setError("Daily generation cap reached for this city. Try again tomorrow.");
      } else {
        setError(e instanceof Error ? e.message : "Failed to start story generation.");
      }
      setLoading(false);
    }
  }, [prompt, activeId, getAccessTokenSilently, onStarted, onClose]);

  const remaining = EXAMPLES.filter((ex) => !prompt.includes(ex.slice(0, 20)));

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal aria-label="Generate story">
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Generate a story for {activeName}</h2>
            <p className={styles.subtitle}>
              Describe what you want Seymour to investigate. The more specific the better —
              name metrics, time periods, districts, or comparisons you care about.
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {cities && cities.length > 0 && (
          <label className={styles.cityField}>
            City
            <select
              className={styles.citySelect}
              value={pickedId}
              onChange={(e) => setPickedId(Number(e.target.value))}
              disabled={loading}
            >
              {cities.map((c) => (
                <option key={c.city_id} value={c.city_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Prompt textarea */}
        <textarea
          className={styles.textarea}
          placeholder={`e.g. "How has 311 response time changed this year in District 3? Compare to citywide average and highlight any spikes."`}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          autoFocus
          disabled={loading}
        />

        {/* Example prompts */}
        <div className={styles.examples}>
          <button
            type="button"
            className={styles.examplesToggle}
            onClick={() => setExampleOpen((v) => !v)}
          >
            {exampleOpen ? "▼" : "▶"} Example prompts
          </button>
          {exampleOpen && (
            <div className={styles.exampleList}>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className={styles.exampleChip}
                  onClick={() => { setPrompt(ex); setExampleOpen(false); }}
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tips */}
        <div className={styles.tips}>
          <p className={styles.tipsTitle}>Tips for a great brief</p>
          <ul className={styles.tipsList}>
            <li>Name the metric or topic: "311 response time", "pothole closures", "violent crime incidents"</li>
            <li>Specify a time period: "past 3 months", "year-over-year", "since January"</li>
            <li>Add a comparison: "District 2 vs. District 5", "compare to the citywide average"</li>
            <li>Mention what you want highlighted: "anything unexpected", "progress toward the 2025 goal"</li>
          </ul>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.footerNote}>
            Seymour will research the data and write a draft. Stories appear in this tab
            once the job finishes and the judge scores them.
          </span>
          <div className={styles.footerActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.submitBtn}
              onClick={() => void handleSubmit()}
              disabled={loading || !prompt.trim()}
            >
              {loading ? "Starting…" : "✦ Generate story"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
