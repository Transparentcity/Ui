"use client";

import { useState, useMemo } from "react";
import { buildStaticMapUrl, DEFAULT_PLACE_RADIUS_M } from "@/lib/mapUtils";
import styles from "./LocationMapSave.module.css";

export interface LocationMapSaveProps {
  /** City ID for the place (used by parent when calling createPlace). */
  cityId: number;
  lat: number;
  lng: number;
  /** Default label for the place (e.g. "My block"). */
  defaultLabel?: string;
  /** Default radius in meters. */
  defaultRadiusM?: number;
  /** Controlled label (when parent provides the main CTA, e.g. Continue). */
  valueLabel?: string;
  /** Controlled radius in meters. */
  valueRadiusM?: number;
  /** Notify parent when label or radius changes (for controlled use). */
  onLabelChange?: (label: string) => void;
  onRadiusChange?: (radiusM: number) => void;
  /** Called when user saves; parent should create place and then close or navigate. Omit when parent handles save (e.g. Continue). */
  onSave?: (opts: { label: string; radius_m: number }) => Promise<void>;
  /** When true, disable the save button and show loading. */
  saving?: boolean;
  /** Label for the save button (e.g. "Save as my block"). If omitted, no button is shown (parent provides it). */
  saveButtonLabel?: string;
  /** Optional cancel/skip action. */
  onCancel?: () => void;
  /** Optional class for the container. */
  className?: string;
}

/**
 * Shared map + label + radius experience for saving a personalized location.
 * Used in onboarding (leader step), sidebar city search, and official selector (Find your district).
 */
export default function LocationMapSave({
  cityId,
  lat,
  lng,
  defaultLabel = "My Block",
  defaultRadiusM = DEFAULT_PLACE_RADIUS_M,
  valueLabel,
  valueRadiusM,
  onLabelChange,
  onRadiusChange,
  onSave,
  saving = false,
  saveButtonLabel,
  onCancel,
  className,
}: LocationMapSaveProps) {
  const [internalLabel, setInternalLabel] = useState(defaultLabel);
  const [internalRadius, setInternalRadius] = useState(defaultRadiusM);

  const isControlledLabel = valueLabel !== undefined;
  const isControlledRadius = valueRadiusM !== undefined;
  const label = isControlledLabel ? valueLabel : internalLabel;
  const radiusM = isControlledRadius ? valueRadiusM : internalRadius;

  const setLabel = (v: string) => {
    if (!isControlledLabel) setInternalLabel(v);
    onLabelChange?.(v);
  };
  const setRadiusM = (v: number) => {
    if (!isControlledRadius) setInternalRadius(v);
    onRadiusChange?.(v);
  };

  const mapUrl = useMemo(
    () => buildStaticMapUrl(lat, lng, radiusM),
    [lat, lng, radiusM]
  );

  const handleSave = async () => {
    if (onSave) await onSave({ label: label.trim() || defaultLabel, radius_m: radiusM });
  };

  return (
    <div className={`${styles.container} ${className ?? ""}`}>
      <div className={styles.toolbar}>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. My block)"
          className={styles.labelInput}
          aria-label="Place label"
        />
        <span className={styles.radiusWrap}>
          <input
            type="range"
            min={10}
            max={500}
            step={10}
            value={radiusM}
            onChange={(e) => setRadiusM(Number(e.target.value))}
            className={styles.slider}
            aria-label="Radius in meters"
          />
          {radiusM} m
        </span>
      </div>
      {mapUrl ? (
        <img
          src={mapUrl}
          alt="Your location and radius"
          className={styles.mapImg}
        />
      ) : (
        <div className={styles.mapPlaceholder}>
          Map (set NEXT_PUBLIC_MAPBOX_TOKEN to show)
        </div>
      )}
      {(saveButtonLabel != null || onCancel != null) && (
        <div className={styles.actions}>
          {saveButtonLabel != null && (
            <button
              type="button"
              className={styles.saveButton}
              onClick={handleSave}
              disabled={saving}
              aria-busy={saving}
            >
              {saving ? "Saving…" : saveButtonLabel}
            </button>
          )}
          {onCancel != null && (
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onCancel}
              disabled={saving}
            >
              Skip
            </button>
          )}
        </div>
      )}
    </div>
  );
}
