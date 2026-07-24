"use client";

import { useState } from "react";
import {
  MAX_PERSONA_SELECTIONS,
  NEWSLETTER_PERSONA_PRESETS,
  type PersonaSelection,
} from "@/lib/newsletterPersonaPresets";
import styles from "./NewsletterPromptBuilder.module.css";

export type { PersonaSelection };

interface NewsletterPromptBuilderProps {
  /** Free-text "Anything else?" note — maps to newsletterDescription. */
  value: string;
  onChange: (text: string) => void;
  personaSelections: PersonaSelection[];
  onPersonaSelectionsChange: (selections: PersonaSelection[]) => void;
  /** Unique prefix for input ids — prevents collisions when the same component
   *  appears in both a modal and the settings page simultaneously. */
  idPrefix?: string;
  /** Tighter spacing for use inside the onboarding modal. */
  compact?: boolean;
}

/**
 * Persona picker for newsletter personalization.
 *
 * Captures structured selections (up to 3 persona pills + per-pill details)
 * and an optional free-text note.  The backend renders the actual prompt from
 * this structured data at generation time — nothing is compiled here.
 */
export default function NewsletterPromptBuilder({
  value,
  onChange,
  personaSelections,
  onPersonaSelectionsChange,
  idPrefix = "npb",
  compact = false,
}: NewsletterPromptBuilderProps) {
  const togglePersona = (id: string) => {
    const exists = personaSelections.find((s) => s.id === id);
    if (exists) {
      onPersonaSelectionsChange(personaSelections.filter((s) => s.id !== id));
    } else {
      if (personaSelections.length >= MAX_PERSONA_SELECTIONS) return;
      onPersonaSelectionsChange([...personaSelections, { id, detail: "" }]);
    }
  };

  const updateDetail = (id: string, detail: string) => {
    onPersonaSelectionsChange(
      personaSelections.map((s) => (s.id === id ? { ...s, detail } : s))
    );
  };

  const [showNote, setShowNote] = useState(false);

  const atMax = personaSelections.length >= MAX_PERSONA_SELECTIONS;
  const hasSelections = personaSelections.length > 0;

  return (
    <div className={`${styles.root} ${compact ? styles.compact : ""}`}>
      <p className={styles.intro}>
        Which of these sounds like you?{" "}
        <span className={styles.introSub}>Pick up to {MAX_PERSONA_SELECTIONS}.</span>
      </p>

      {/* Persona pill grid */}
      <div className={styles.pillGrid} role="group" aria-label="Persona types">
        {NEWSLETTER_PERSONA_PRESETS.map((preset) => {
          const isSelected = !!personaSelections.find((s) => s.id === preset.id);
          const isDisabled = !isSelected && atMax;
          return (
            <button
              key={preset.id}
              type="button"
              className={`${styles.pill} ${isSelected ? styles.pillActive : ""} ${isDisabled ? styles.pillDisabled : ""}`}
              onClick={() => togglePersona(preset.id)}
              disabled={isDisabled}
              aria-pressed={isSelected}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Per-persona detail inputs */}
      {hasSelections && (
        <div className={styles.detailRows}>
          {personaSelections.map((sel) => {
            const preset = NEWSLETTER_PERSONA_PRESETS.find((p) => p.id === sel.id);
            if (!preset) return null;
            const inputId = `${idPrefix}-detail-${sel.id}`;
            return (
              <div key={sel.id} className={styles.detailRow}>
                <label className={styles.detailLabel} htmlFor={inputId}>
                  {preset.label}
                </label>
                <input
                  id={inputId}
                  type="text"
                  className={styles.detailInput}
                  value={sel.detail}
                  onChange={(e) => updateDetail(sel.id, e.target.value)}
                  placeholder={preset.detailPlaceholder}
                  autoComplete="off"
                />
              </div>
            );
          })}
        </div>
      )}

      {/* "Anything else?" — collapsed by default, expands on click */}
      <div className={styles.noteSection}>
        {!showNote ? (
          <button
            type="button"
            className={styles.noteToggle}
            onClick={() => setShowNote(true)}
          >
            + Anything else?
          </button>
        ) : (
          <textarea
            id={`${idPrefix}-note`}
            className={styles.noteTextarea}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. anything specific you want covered each week, topics to avoid, or how you like it written."
            rows={2}
            autoFocus={!value}
          />
        )}
      </div>
    </div>
  );
}
