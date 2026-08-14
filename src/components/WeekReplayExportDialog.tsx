/**
 * WeekReplayExportDialog — turn a week replay into a shareable video.
 *
 * Every destination wants its own frame, so the viewer picks a format first
 * (story, feed square, wide) and sees a still preview of that exact frame
 * before committing to an encode. Rendering happens locally via WebCodecs:
 * no upload, no server round trip, and the file that comes out is the file
 * that gets shared.
 *
 * The sound is the same synthesized track the live replay plays, rendered
 * offline and muxed in, so the video carries the audio even where the browser
 * would have blocked autoplay.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { BoundarySketch } from "@/lib/publicApiClient";
import type { WeekEventsResponse } from "@/lib/weekReplay";
import { buildAudioSchedule, renderReplayAudio } from "@/lib/weekReplayAudio";
import {
  EXPORT_FORMATS,
  DEFAULT_EXPORT_FORMAT_ID,
  buildExportLayout,
  getExportFormat,
  type ExportFormat,
  type ExportFormatId,
} from "@/lib/weekReplayExport/formats";
import { buildExportScene, type ExportScene } from "@/lib/weekReplayExport/scene";
import { renderExportFrame } from "@/lib/weekReplayExport/renderer";
import {
  OUTRO_MS,
  encodeReplayVideo,
  isVideoExportSupported,
  type EncodeReplayResult,
} from "@/lib/weekReplayExport/encode";
import Loader from "@/components/Loader";
import styles from "./WeekReplayExportDialog.module.css";

/** Preview scale relative to the full export frame. */
const PREVIEW_SCALE = 0.3;
/**
 * Playback fraction the still preview is drawn at. Late enough that the map is
 * dense and the chart has built up, early enough to usually catch a callout.
 */
const PREVIEW_AT = 0.72;

type Status = "picking" | "preparing" | "encoding" | "ready" | "error";

export interface WeekReplayExportDialogProps {
  onClose: () => void;
  data: WeekEventsResponse;
  sketch: BoundarySketch | null | undefined;
  /** 0 = citywide, >0 = district scope. */
  selectedDistrict: number;
  isPlaceScope: boolean;
  placeDistrict?: number | null;
  placeLat?: number | null;
  placeLng?: number | null;
  placeRadiusM?: number | null;
  /** "the Mission", "District 6", "San Francisco". */
  scopeLabel: string;
  theme: "light" | "dark";
  /** Resolves the public permalink, for the "Copy link" action. */
  getShareUrl?: () => Promise<string | null>;
}

export default function WeekReplayExportDialog({
  onClose,
  data,
  sketch,
  selectedDistrict,
  isPlaceScope,
  placeDistrict,
  placeLat,
  placeLng,
  placeRadiusM,
  scopeLabel,
  theme,
  getShareUrl,
}: WeekReplayExportDialogProps) {
  const [formatId, setFormatId] = useState<ExportFormatId>(DEFAULT_EXPORT_FORMAT_ID);
  const [withSound, setWithSound] = useState(true);
  const [status, setStatus] = useState<Status>("picking");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EncodeReplayResult | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [linkState, setLinkState] = useState<"idle" | "copied" | "error">("idle");
  const [previewReady, setPreviewReady] = useState(false);

  const [scene, setScene] = useState<ExportScene | null>(null);

  const previewRef = useRef<HTMLCanvasElement | null>(null);
  /** Scenes are expensive (basemap + photo fetches); keep one per format. */
  const sceneCacheRef = useRef(new Map<string, ExportScene>());
  const abortRef = useRef<AbortController | null>(null);

  const supported = useMemo(() => isVideoExportSupported(), []);
  const format = getExportFormat(formatId);
  const layout = useMemo(() => buildExportLayout(format), [format]);

  /** Length of the finished clip: the replay plus its closing card. */
  const clipSeconds = scene
    ? Math.round((scene.timeline.durationMs + OUTRO_MS) / 1000)
    : null;

  // ── Scene ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const cacheKey = `${formatId}:${theme}`;
    const cached = sceneCacheRef.current.get(cacheKey);
    if (cached) {
      setScene(cached);
      return;
    }

    setScene(null);
    void (async () => {
      try {
        const built = await buildExportScene({
          data,
          layout,
          sketch,
          selectedDistrict,
          isPlaceScope,
          placeDistrict,
          placeLat,
          placeLng,
          placeRadiusM,
          scopeLabel,
          theme,
        });
        if (cancelled) return;
        if (!built) {
          setError("There aren't enough mapped events this week to make a video.");
          setStatus("error");
          return;
        }
        sceneCacheRef.current.set(cacheKey, built);
        setScene(built);
      } catch {
        if (!cancelled) {
          setError("Couldn't prepare the video. Please try again.");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    formatId,
    layout,
    theme,
    data,
    sketch,
    selectedDistrict,
    isPlaceScope,
    placeDistrict,
    placeLat,
    placeLng,
    placeRadiusM,
    scopeLabel,
  ]);

  /**
   * Still preview of the chosen frame.
   *
   * Keyed on status as well as the scene: the canvas unmounts while the
   * finished video is on screen, so coming back to the picker hands us a fresh,
   * unpainted element that has to be redrawn.
   */
  useEffect(() => {
    if (status === "ready") return;
    const canvas = previewRef.current;
    if (!scene || !canvas) {
      setPreviewReady(false);
      return;
    }
    canvas.width = Math.round(scene.layout.width * PREVIEW_SCALE);
    canvas.height = Math.round(scene.layout.height * PREVIEW_SCALE);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    ctx.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
    renderExportFrame(ctx, scene, scene.timeline.durationMs * PREVIEW_AT);
    setPreviewReady(true);
  }, [scene, status]);

  // Blob URLs outlive the component unless revoked.
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = status === "preparing" || status === "encoding";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // ── Encode ──────────────────────────────────────────────────────────────
  const create = useCallback(async () => {
    if (!scene || busy) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setProgress(0);
    setStatus("preparing");

    try {
      let audio: AudioBuffer | null = null;
      if (withSound) {
        const schedule = buildAudioSchedule(
          scene.events.map((e) => ({
            playMs: e.playMs,
            panX: Math.min(1, Math.max(0, e.x / scene.layout.map.w)),
            posY: Math.min(1, Math.max(0, e.y / scene.layout.map.h)),
            color: e.color,
          })),
          scene.keyMoments.map((m) => ({
            playStartMs: m.playStartMs,
            isPhoto: !!m.photo,
          })),
          scene.timeline,
        );
        try {
          audio = await renderReplayAudio(schedule, scene.timeline.durationMs, OUTRO_MS);
        } catch {
          // A silent video still shares fine; don't lose the whole export.
          audio = null;
        }
      }
      if (controller.signal.aborted) return;

      setStatus("encoding");
      const encoded = await encodeReplayVideo({
        scene,
        audio,
        onProgress: setProgress,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      setResult(encoded);
      setVideoUrl(URL.createObjectURL(encoded.blob));
      setStatus("ready");
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") {
        setStatus("picking");
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't render the video.");
      setStatus("error");
    } finally {
      abortRef.current = null;
    }
  }, [scene, busy, withSound]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus("picking");
    setProgress(0);
  }, []);

  const startOver = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setResult(null);
    setProgress(0);
    setError(null);
    setStatus("picking");
  }, [videoUrl]);

  const download = useCallback(() => {
    if (!result || !videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = result.filename;
    a.click();
  }, [result, videoUrl]);

  /**
   * Native share sheet with the file attached — the path that lands the video
   * straight into Instagram, TikTok, or Messages on mobile. Desktop browsers
   * mostly refuse files, so fall back to saving it.
   */
  const shareFile = useCallback(async () => {
    if (!result) return;
    const file = new File([result.blob], result.filename, { type: "video/mp4" });
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Your week in ${scopeLabel}`,
        });
        return;
      } catch {
        // Cancelled or rejected — saving is the next best thing.
      }
    }
    download();
  }, [result, scopeLabel, download]);

  const copyLink = useCallback(async () => {
    if (!getShareUrl) return;
    try {
      const pathOrUrl = await getShareUrl();
      if (!pathOrUrl) return;
      const full = pathOrUrl.startsWith("http")
        ? pathOrUrl
        : `${window.location.origin}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
      await navigator.clipboard.writeText(full);
      setLinkState("copied");
      window.setTimeout(() => setLinkState("idle"), 2000);
    } catch {
      setLinkState("error");
      window.setTimeout(() => setLinkState("idle"), 2500);
    }
  }, [getShareUrl]);

  const canShareFiles =
    typeof navigator !== "undefined" && typeof navigator.canShare === "function";

  const dialog = (
    <div
      className={styles.overlay}
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Share your week replay as a video"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>Share as video</h3>
            <p className={styles.subtitle}>
              Rendered on this device, at the size each place expects.
            </p>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {!supported ? (
          <div className={styles.body}>
            <p className={styles.notice}>
              Video recording needs Chrome, Edge, or Safari 17 and newer. You can
              still copy a link to the replay from here.
            </p>
            {getShareUrl && (
              <button type="button" className={styles.secondaryBtn} onClick={copyLink}>
                {linkState === "copied" ? "Link copied" : "Copy link"}
              </button>
            )}
          </div>
        ) : (
          <div className={styles.body}>
            <div className={styles.stage}>
              <div className={styles.previewWrap} data-format={formatId}>
                {status === "ready" && videoUrl ? (
                  <video
                    className={styles.preview}
                    src={videoUrl}
                    controls
                    loop
                    autoPlay
                    playsInline
                    aria-label="Exported week replay video"
                  />
                ) : (
                  <>
                    <canvas
                      ref={previewRef}
                      className={styles.preview}
                      data-dim={previewReady ? undefined : "true"}
                      aria-label={`${format.label} preview`}
                    />
                    {!previewReady && (
                      <span className={styles.previewLoader}>
                        <Loader size="md" color={theme === "dark" ? "white" : "purple"} />
                      </span>
                    )}
                  </>
                )}
              </div>

              <div className={styles.controls}>
                {status === "ready" ? (
                  <>
                    <p className={styles.readyNote}>
                      {format.label} · {format.aspect} ·{" "}
                      {Math.round((result?.durationMs ?? 0) / 1000)}s
                      {result?.hasAudio ? " · with sound" : " · silent"}
                    </p>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        onClick={canShareFiles ? () => void shareFile() : download}
                      >
                        {canShareFiles ? "Share video" : "Save video"}
                      </button>
                      {canShareFiles && (
                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          onClick={download}
                        >
                          Save
                        </button>
                      )}
                      {getShareUrl && (
                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          onClick={() => void copyLink()}
                        >
                          {linkState === "copied"
                            ? "Link copied"
                            : linkState === "error"
                              ? "Couldn't copy"
                              : "Copy link"}
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        onClick={startOver}
                      >
                        Pick another format
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <fieldset className={styles.formats} disabled={busy}>
                      <legend className={styles.legend}>Format</legend>
                      {EXPORT_FORMATS.map((f: ExportFormat) => (
                        <label
                          key={f.id}
                          className={styles.formatOption}
                          data-active={f.id === formatId ? "true" : undefined}
                        >
                          <input
                            type="radio"
                            name="week-replay-format"
                            value={f.id}
                            checked={f.id === formatId}
                            onChange={() => setFormatId(f.id)}
                            disabled={busy}
                          />
                          <span
                            className={styles.formatSwatch}
                            data-format={f.id}
                            aria-hidden="true"
                          />
                          <span className={styles.formatText}>
                            <span className={styles.formatLabel}>
                              {f.label}
                              <span className={styles.formatAspect}>{f.aspect}</span>
                            </span>
                            <span className={styles.formatDest}>{f.destinations}</span>
                          </span>
                        </label>
                      ))}
                    </fieldset>

                    <label className={styles.soundToggle}>
                      <input
                        type="checkbox"
                        checked={withSound}
                        onChange={(e) => setWithSound(e.target.checked)}
                        disabled={busy}
                      />
                      Include the replay soundtrack
                    </label>

                    {error && <p className={styles.error}>{error}</p>}

                    {busy ? (
                      <div className={styles.progressBlock}>
                        <div className={styles.progressTrack}>
                          <div
                            className={styles.progressFill}
                            data-indeterminate={
                              status === "preparing" ? "true" : undefined
                            }
                            style={
                              status === "encoding"
                                ? { width: `${Math.round(progress * 100)}%` }
                                : undefined
                            }
                          />
                        </div>
                        <span className={styles.progressLabel}>
                          {status === "preparing"
                            ? "Mixing the sound…"
                            : `Rendering video — ${Math.round(progress * 100)}%`}
                        </span>
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          onClick={cancel}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.primaryBtn}
                          onClick={() => void create()}
                          disabled={!previewReady}
                        >
                          Create video
                        </button>
                        <span className={styles.hint}>
                          {clipSeconds ? `${clipSeconds}s clip · ` : ""}
                          usually renders in under 30 seconds. Keep this tab open.
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
