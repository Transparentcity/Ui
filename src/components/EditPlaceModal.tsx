"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth0 } from "@auth0/auth0-react";
import LocationMapSave from "@/components/LocationMapSave";
import {
  updatePlace,
  runPlaceMetricsAndAnomaliesAsJob,
  type UserPlace,
} from "@/lib/apiClient";
import { emitSavedCitiesChanged } from "@/lib/uiEvents";
import { usePlaceOnboarding } from "@/contexts/PlaceOnboardingContext";
import searchStyles from "./SidebarCitySearch.module.css";

export interface EditPlaceModalProps {
  open: boolean;
  /** The place being edited (full record, so we can seed name/point/radius). */
  place: UserPlace | null;
  onClose: () => void;
  /** Called with the updated place after a successful save. */
  onSaved?: (place: UserPlace) => void;
}

/** Coordinates equal within ~1cm — ignore float noise from map panning. */
const COORD_EPS = 1e-7;

/**
 * Shared modal to edit a saved place: rename it, move the center point on the
 * map, and/or change the radius. Reuses the same map experience as the create
 * flow. Moving the point or changing the radius kicks off a background refresh
 * so the dashboard and stories reflect the new scope.
 */
export default function EditPlaceModal({
  open,
  place,
  onClose,
  onSaved,
}: EditPlaceModalProps) {
  const { getAccessTokenSilently } = useAuth0();
  const { startJob } = usePlaceOnboarding();
  const [mounted, setMounted] = useState(false);
  const [label, setLabel] = useState("");
  const [radiusM, setRadiusM] = useState(0);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  // Seed editable fields from the place whenever the modal opens for a place.
  useEffect(() => {
    if (open && place) {
      setLabel(place.label);
      setRadiusM(place.radius_m);
      setLat(place.lat);
      setLng(place.lng);
      setError(null);
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed when the target place changes
  }, [open, place?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted || !place || lat == null || lng == null) return null;

  const handleSave = async (opts: { label: string; radius_m: number }) => {
    if (!place) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const nextLabel = opts.label.trim() || place.label;
      const coordsChanged =
        Math.abs(lat - place.lat) > COORD_EPS ||
        Math.abs(lng - place.lng) > COORD_EPS;
      const radiusChanged = opts.radius_m !== place.radius_m;

      const updated = await updatePlace(place.id, token, {
        label: nextLabel,
        lat,
        lng,
        radius_m: opts.radius_m,
      });

      // When the geographic scope changes, refresh metrics/anomalies in the
      // background so the dashboard and neighborhood stories stay accurate.
      if (coordsChanged || radiusChanged) {
        try {
          const { job_id } = await runPlaceMetricsAndAnomaliesAsJob(
            place.id,
            token
          );
          startJob(place.id, job_id);
        } catch {
          // Non-blocking: the place is still updated even if refresh can't start.
        }
      }

      emitSavedCitiesChanged();
      onSaved?.(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save place");
    } finally {
      setSaving(false);
    }
  };

  const modalContent = (
    <div className={searchStyles.modalOverlay} onClick={onClose}>
      <div
        className={searchStyles.modalContent}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={searchStyles.modalHeader}>
          <h2 className={searchStyles.modalTitle}>Edit place</h2>
          <button
            type="button"
            className={searchStyles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ padding: "16px 20px" }}>
          <p
            style={{
              margin: "0 0 12px",
              color: "var(--text-secondary)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Rename this place, drag the map to move the center point, or adjust
            the radius.
          </p>
          {error && (
            <div className={searchStyles.resultError} style={{ marginBottom: 12 }}>
              <span>{error}</span>
            </div>
          )}
          <LocationMapSave
            cityId={place.city_id}
            lat={lat}
            lng={lng}
            valueLabel={label}
            valueRadiusM={radiusM}
            onLabelChange={setLabel}
            onRadiusChange={setRadiusM}
            defaultLabel={place.label}
            draggablePin
            onPinChange={(nextLat, nextLng) => {
              setLat(nextLat);
              setLng(nextLng);
            }}
            onSave={handleSave}
            saving={saving}
            saveButtonLabel="Save changes"
            onCancel={onClose}
            cancelButtonLabel="Cancel"
          />
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
