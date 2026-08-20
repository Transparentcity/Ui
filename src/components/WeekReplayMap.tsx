/**
 * WeekReplayMap — "Your Week Replay" animated hero unit.
 *
 * Stacked layout: the map (Mapbox Static basemap + purple boundary overlay,
 * same projection as MiniScopeMap) is a full-width banner on top. For place
 * scope the crop is zoomed in and shifted right so the left third can hold
 * the date slug and event labels without covering the dots. The row below
 * holds the control panel: key-event ticker, a bar chart of events per
 * metric subcategory that builds up as dots land, and the play/pause +
 * scrubber controls.
 *
 * Before playback the map already carries the finished frame — every event of
 * the week, all at once — with the play button and its caption parked in the
 * label gutter, so the unit shows what there is to watch before asking for the
 * click.
 *
 * Playing compresses the last 7 days of geolocated events into ~25s, and is
 * built so the whole picture reads at once:
 *
 * - routine dots and the bar chart build up quickly as background texture;
 * - the handful of key events each pause playback for a couple of seconds
 *   with a callout on the map, then fade out before the next one;
 * - the map dims through the night and warms over weekends, and the scrubber
 *   carries the same day/night/weekend ribbon, so time of day and day of week
 *   are readable without looking away from the dots.
 *
 * Sound is synthesized in the browser from the same event list (see
 * weekReplayAudio): dots land as soft struck notes placed east to west in the
 * stereo field and pitched by category and how far north they are, key moments
 * ring as bells, and a pad tracks the same night and weekend signals the map is
 * already showing. It is off until the viewer turns it on, and that choice is
 * remembered across visits.
 *
 * After playback the unit stays interactive: scrub the week, tap pins/dots
 * for details, replay, share, or export the whole thing as a video sized for
 * stories and feeds (see WeekReplayExportDialog). Watching through lands on
 * the same closing card the exported clip ends on — final count, scope, and
 * branding — with a share call to action beneath it.
 *
 * Events come from GET /api/user/week-events (persona-boosted ranking,
 * never persona-filtered) and are fetched lazily on mount.
 */

"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery } from "@tanstack/react-query";

import { getWeekEvents } from "@/lib/apiClient";
import { mixHex } from "@/lib/layerColors";
import type { BoundarySketch } from "@/lib/publicApiClient";
import { getImpersonationCacheKey } from "@/lib/impersonation";
import { buildBasemapStaticUrl, biasViewForLeftLabels, type MapBbox } from "@/lib/mapUtils";
import {
  getMediaStatusVersion,
  getMediaUrlStatus,
  preloadMediaUrl,
  subscribeMediaUrlStatus,
} from "@/lib/mediaPreload";
import {
  SketchOverlay,
  computeScopeViewBbox,
  project,
} from "@/components/MiniScopeMap";
import {
  buildAudioSchedule,
  createReplayAudioEngine,
  type ReplayAudioEngine,
} from "@/lib/weekReplayAudio";
import { isVideoExportSupported } from "@/lib/weekReplayExport/encode";
import WeekReplayExportDialog from "@/components/WeekReplayExportDialog";
import {
  buildDayNightBands,
  buildEventCallout,
  buildPlaybackTimeline,
  buildSubcategoryColors,
  eventDateKey,
  eventTimeMs,
  formatClockTime,
  formatClockWeekday,
  formatPlaybackClock,
  formatWindowRange,
  isNightAt,
  isWeekendAt,
  metricDisplayName,
  metricIcon,
  weekendness,
  weekReplayScopePhrase,
  windowDateMs,
  windowDayLabels,
  type PlaybackTimeline,
  type WeekEvent,
  type WeekEventsResponse,
} from "@/lib/weekReplay";
import { useTheme } from "@/contexts/ThemeContext";
import Loader from "@/components/Loader";
import styles from "./WeekReplayMap.module.css";

/** Wide-view map frame height; width follows the measured banner aspect. */
const MAP_WIDE_H = 384;
/** Wide-view fallback aspect until the banner is first measured (see CSS). */
const MAP_WIDE_DEFAULT_ASPECT = 2.5;
/** Mobile map frame (4:3, top of the unit). */
const MAP_TOP_W = 480;
const MAP_TOP_H = 360;
const STACKED_MQ = "(max-width: 640px)";

/** Remembers the sound choice, so turning it on carries to next week. */
const SOUND_PREF_KEY = "tc.weekReplay.sound";

/** Stand-in for cities we have no shapes for, so the place still draws. */
const EMPTY_SKETCH: BoundarySketch = { districts: [], outline: null, bbox: null };

interface WeekReplayMapProps {
  cityId: number;
  sketch: BoundarySketch | null | undefined;
  /** 0 = citywide, >0 = district scope. */
  selectedDistrict: number;
  isPlaceScope: boolean;
  placeDistrict?: number | null;
  placeLat?: number | null;
  placeLng?: number | null;
  placeRadiusM?: number | null;
  selectedPlaceId?: number | null;
  /** Label drawn next to the place marker on the map (e.g. "Seth's Place"). */
  placeName?: string | null;
  /**
   * What this replay covers, in words ("the Mission", "District 6",
   * "San Francisco"). Titles the exported video; falls back to the place name
   * or district number.
   */
  scopeLabel?: string | null;
  /** Map-body click in idle state (matches MiniScopeMap behavior). */
  onOpenScopeSelector?: () => void;
  /** Optional: open the metric behind a tapped event. */
  onEventMetricClick?: (metricId: number) => void;
  /** Start playback automatically once events load (?replay=1 deep link). */
  autoPlay?: boolean;
  /**
   * Pre-resolved events (shared /w/{hash} snapshots). When set, the
   * component never calls the authenticated week-events API.
   */
  presetData?: WeekEventsResponse | null;
  /**
   * Enables the Share button. Returns the absolute URL to share (creating
   * the public permalink server-side when needed), or null to abort.
   */
  getShareUrl?: () => Promise<string | null>;
  /** Title passed to the native share sheet. */
  shareTitle?: string;
  className?: string;
}

type Phase = "idle" | "playing" | "paused" | "ended";

interface PreparedEvent extends WeekEvent {
  weekMs: number;
  playMs: number;
  x: number;
  y: number;
}

/** Frame cap for React state updates during playback (~30fps). */
const FRAME_MS = 33;
/** Playback window after a dot appears during which its pulse ring shows. */
const PULSE_WINDOW_MS = 900;
/**
 * Most key events to pause on. The API already spaces its key events across
 * the week and caps them; this only guards against an older snapshot with
 * more, which would stretch playback well past its ~25s budget.
 */
const MAX_KEY_MOMENTS = 6;
/** Fade-out tail after a key moment's hold ends, before it unmounts. */
const KEY_FADE_MS = 320;
/** Gold ring for 311 points with a loadable photo (matches CityMetricsMap). */
const MEDIA_GOLD = "#FFD700";
/**
 * Peak dimming while a key moment holds the screen.
 *
 * Dimming earns its keep as a spotlight rather than as a clock: it darkens the
 * basemap and pushes back the routine dots so the event being called out is the
 * one bright thing on the map. Time of day is carried by the clock's own
 * sun/moon glyph and the scrubber's night ribbon, which say it without
 * strobing the map seven times a replay.
 */
const SPOTLIGHT_SCRIM_MAX = 0.34;
/**
 * Radius left completely clear around the held event, in map units. Matched to
 * the reach of the pulse ring a dot throws when it lands (see pulseRing), so
 * the lit area is the same size as the gesture the eye already knows.
 */
const SPOTLIGHT_CLEAR_R = 20;
/** Peak warmth of the weekend wash. */
const WEEKEND_WASH_MAX = 0.1;

/** A key event and the playback window it holds the screen for. */
interface KeyMoment {
  playStartMs: number;
  playEndMs: number;
  event: PreparedEvent;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** True when the unit stacks vertically (map on top, panel below). */
function useStackedLayout(): boolean {
  const [stacked, setStacked] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(STACKED_MQ);
    setStacked(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setStacked(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return stacked;
}

export default function WeekReplayMap({
  cityId,
  sketch,
  selectedDistrict,
  isPlaceScope,
  placeDistrict,
  placeLat,
  placeLng,
  placeRadiusM,
  selectedPlaceId,
  placeName,
  scopeLabel,
  onOpenScopeSelector,
  onEventMetricClick,
  autoPlay,
  presetData,
  getShareUrl,
  shareTitle,
  className,
}: WeekReplayMapProps) {
  const { theme } = useTheme();
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const mapTheme = theme === "dark" ? "dark" : "light";
  const prefersReducedMotion = usePrefersReducedMotion();
  const stacked = useStackedLayout();

  // Wide view: the banner's aspect drifts with the card width (and its
  // max-height clamp), so measure it and fetch a matching basemap crop (no
  // distortion). Quantized to 0.05 steps so resizes don't spam Mapbox.
  const mapPanelRef = useRef<HTMLDivElement | null>(null);
  /** Inner frame locked to the fetched crop's aspect (geo-registered layers). */
  const mapFrameRef = useRef<HTMLDivElement | null>(null);
  const [measuredAspect, setMeasuredAspect] = useState<number | null>(null);
  useEffect(() => {
    if (stacked) return;
    const el = mapPanelRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        // Upper clamp keeps the static-basemap request under Mapbox's
        // 1280px width limit at MAP_WIDE_H.
        const q = Math.min(
          3.2,
          Math.max(1.2, Math.round((r.width / r.height) * 20) / 20),
        );
        setMeasuredAspect((prev) => (prev === q ? prev : q));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stacked]);

  const mapAspect = stacked
    ? MAP_TOP_W / MAP_TOP_H
    : (measuredAspect ?? MAP_WIDE_DEFAULT_ASPECT);
  const mapH = stacked ? MAP_TOP_H : MAP_WIDE_H;
  const mapW = stacked ? MAP_TOP_W : Math.round(mapH * mapAspect);

  const highlightDistrict = isPlaceScope
    ? (placeDistrict ?? null)
    : selectedDistrict > 0
      ? selectedDistrict
      : null;

  const viewBbox = useMemo((): MapBbox | null => {
    const base = computeScopeViewBbox({
      sketch,
      highlightDistrict,
      isPlaceScope,
      placeLat,
      placeLng,
      placeRadiusM,
      aspect: mapAspect,
    });
    // Place week-replay: cheat the crop right + zoom in so the left third
    // can hold the date slug and event labels without covering the dots.
    if (!base || !isPlaceScope) return base;
    return biasViewForLeftLabels(base, mapAspect, {
      leftGutter: stacked ? 0.26 : 0.3,
      // Lower = tighter crop = the place square reads larger on the right.
      zoom: stacked ? 0.62 : 0.52,
    });
  }, [
    sketch,
    highlightDistrict,
    isPlaceScope,
    placeLat,
    placeLng,
    placeRadiusM,
    mapAspect,
    stacked,
  ]);

  const basemapUrl = useMemo(
    () => (viewBbox ? buildBasemapStaticUrl(viewBbox, mapW, mapH, mapTheme, 0) : null),
    [viewBbox, mapW, mapH, mapTheme],
  );

  // ── Events ────────────────────────────────────────────────────────────
  const {
    data: fetchedData,
    isLoading: queryLoading,
    isError: queryError,
    refetch,
  } = useQuery<WeekEventsResponse>({
    queryKey: [
      "week-events",
      cityId,
      isPlaceScope ? `p${selectedPlaceId}` : `d${selectedDistrict}`,
      getImpersonationCacheKey(),
    ],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return getWeekEvents(token, {
        cityId,
        district: isPlaceScope ? null : selectedDistrict,
        placeId: isPlaceScope ? selectedPlaceId : null,
      });
    },
    enabled:
      !presetData &&
      isAuthenticated &&
      cityId > 0 &&
      (!isPlaceScope || selectedPlaceId != null),
    staleTime: 30 * 60 * 1000,
    // First fetch per scope can take ~30s server-side (Socrata fan-out);
    // never re-trigger it just because the window regained focus.
    refetchOnWindowFocus: false,
    // Cold caches return partial snapshots with progress; poll until the
    // server-side fan-out completes so the replay builds up live.
    refetchInterval: (query) =>
      (query.state.data as WeekEventsResponse | undefined)?.partial ? 1500 : false,
    retry: 1,
  });
  const data = presetData ?? fetchedData;
  const isPartial = !presetData && !!data?.partial;
  const isLoading = !presetData && (queryLoading || isPartial);
  const isError = !presetData && queryError;
  const loadProgress = !presetData ? data?.progress : undefined;

  // Preload 311 photo URLs so we only gold-ring / slide images that load.
  const mediaVersion = useSyncExternalStore(
    subscribeMediaUrlStatus,
    getMediaStatusVersion,
    () => 0,
  );
  useEffect(() => {
    for (const e of data?.events ?? []) {
      if (e.media_url) preloadMediaUrl(e.media_url);
    }
  }, [data]);

  const mediaIsOk = useCallback(
    (url: string | null | undefined) => {
      void mediaVersion;
      if (!url) return false;
      return getMediaUrlStatus(url) === "ok";
    },
    [mediaVersion],
  );
  /** Has a photo URL that hasn't failed yet (gold ring while loading/ok). */
  const mediaIsPendingOrOk = useCallback(
    (url: string | null | undefined) => {
      void mediaVersion;
      if (!url) return false;
      return getMediaUrlStatus(url) !== "failed";
    },
    [mediaVersion],
  );

  const windowRange = data?.window
    ? formatWindowRange(data.window.start, data.window.end)
    : "";

  const prepared = useMemo((): {
    timeline: PlaybackTimeline;
    events: PreparedEvent[];
    keyMoments: KeyMoment[];
  } | null => {
    if (!data || !viewBbox || !data.events.length) return null;
    const startKey = (data.window?.start || "").slice(0, 10);
    const endKey = (data.window?.end || "").slice(0, 10);
    const weekStartMs = windowDateMs(startKey);
    const weekEndMs = windowDateMs(endKey) + 24 * 60 * 60 * 1000;
    if (!Number.isFinite(weekStartMs) || !Number.isFinite(weekEndMs)) return null;

    const inWindow = data.events.filter((e) => {
      const key = eventDateKey(e.ts);
      return key >= startKey && key <= endKey;
    });
    if (!inWindow.length) return null;

    // Place every event first: which key events get a hold depends on which
    // ones actually land inside the crop, and the timeline needs their times.
    const placed: Array<WeekEvent & { weekMs: number; x: number; y: number }> = [];
    for (const e of inWindow) {
      const weekMs = eventTimeMs(e.ts);
      if (!weekMs) continue;
      // Clamp slightly out-of-range epochs (UTC midnight vs local) onto the window.
      const clamped = Math.min(weekEndMs, Math.max(weekStartMs, weekMs));
      const [x, y] = project(e.lon, e.lat, viewBbox, mapW, mapH);
      // Skip points far outside the crop (spatial filter is bbox-based, so a
      // handful of edge points can land outside the aspect-fitted view).
      if (x < -40 || x > mapW + 40 || y < -40 || y > mapH + 40) continue;
      placed.push({ ...e, weekMs: clamped, x, y });
    }
    if (!placed.length) return null;
    placed.sort((a, b) => a.weekMs - b.weekMs);

    // Prefer photo-bearing events as slides (they drop into the left panel
    // with the image), then fill remaining slots from API-ranked key events.
    const photoPicks = placed
      .filter((e) => e.media_url)
      .sort((a, b) => a.weekMs - b.weekMs);
    const rankedKeys = placed
      .filter((e) => e.is_key)
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    const keyPicks: typeof placed = [];
    const seen = new Set<number>();
    for (const e of [...photoPicks, ...rankedKeys]) {
      if (seen.has(e.id)) continue;
      keyPicks.push(e);
      seen.add(e.id);
      if (keyPicks.length >= MAX_KEY_MOMENTS) break;
    }
    keyPicks.sort((a, b) => a.weekMs - b.weekMs);

    const timeline = buildPlaybackTimeline(
      weekStartMs,
      weekEndMs,
      keyPicks.map((e) => e.weekMs),
    );

    const events: PreparedEvent[] = placed.map((e) => ({
      ...e,
      playMs: timeline.playTimeAt(e.weekMs),
    }));

    // Holds are keyed by the exact week time they were built from, so they
    // map straight back onto their prepared event (with playMs). Picks that
    // merged into an earlier hold produce no hold and stay ordinary dots.
    const eventsByWeekMs = new Map(
      events.map((e) => [e.weekMs, e] as const),
    );
    const keyMoments: KeyMoment[] = [];
    for (const hold of timeline.holds) {
      const event = eventsByWeekMs.get(hold.weekMs);
      if (!event) continue;
      keyMoments.push({
        playStartMs: hold.playStartMs,
        playEndMs: hold.playEndMs,
        event,
      });
    }

    return { timeline, events, keyMoments };
  }, [data, viewBbox, mapW, mapH]);

  /**
   * Metric → color, assigned by descending event count.
   *
   * Keyed on the metric rather than its dashboard section, so a bar, the dots
   * it stands for, and that metric's note in the soundtrack (which reads its
   * palette index) all belong to the same thing.
   */
  const subcatColors = useMemo(
    () => buildSubcategoryColors(prepared?.events ?? [], (e) => String(e.metric_id)),
    [prepared],
  );
  const eventColor = useCallback(
    (e: WeekEvent) => subcatColors.get(String(e.metric_id)) ?? "#94a3b8",
    [subcatColors],
  );

  // ── Sound ─────────────────────────────────────────────────────────────
  /**
   * Note schedule for the whole week: pitch comes from the event's category
   * and how far north it is, stereo position from where it sits east to west.
   * The audio is another reading of the same frame rather than a soundtrack
   * over it.
   */
  const audioSchedule = useMemo(() => {
    if (!prepared) return null;
    return buildAudioSchedule(
      prepared.events.map((e) => ({
        playMs: e.playMs,
        panX: mapW > 0 ? e.x / mapW : 0.5,
        posY: mapH > 0 ? e.y / mapH : 0.5,
        color: eventColor(e),
      })),
      prepared.keyMoments.map((m) => ({
        playStartMs: m.playStartMs,
        isPhoto: !!m.event.media_url,
      })),
      prepared.timeline,
    );
  }, [prepared, mapW, mapH, eventColor]);

  /**
   * Off until asked for. Sound arriving unbidden is worse than sound missed,
   * and starting muted also means no AudioContext is created at all for the
   * viewers who never want one.
   */
  const [soundOn, setSoundOn] = useState(false);
  const audioRef = useRef<ReplayAudioEngine | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SOUND_PREF_KEY) === "on") setSoundOn(true);
    } catch {
      // Private mode / blocked storage: stays off.
    }
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SOUND_PREF_KEY, next ? "on" : "off");
      } catch {
        // Preference just won't persist.
      }
      return next;
    });
  }, []);

  // The engine closes over its schedule, so a new event set needs a new engine.
  useEffect(
    () => () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    },
    [audioSchedule],
  );

  const stopAudio = useCallback(() => audioRef.current?.pause(), []);

  // ── Playback state ────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("idle");
  const [playMs, setPlayMs] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  /** 311 photo opened full-screen, or null when the lightbox is closed. */
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  /** Chart selection: the metric whose events are highlighted on the map. */
  const [highlightMetricId, setHighlightMetricId] = useState<number | null>(null);
  /**
   * True when the viewer jumped to the end via a chart click instead of
   * watching playback — the control button then keeps its play affordance
   * (purple) rather than switching to "replay", and the closing card stays
   * off so the map stays free to explore.
   */
  const [skippedToEnd, setSkippedToEnd] = useState(false);
  /**
   * Viewer dismissed the closing card to dig into the finished map. Reset on
   * the next play so a watched-through ending always gets its landing again.
   */
  const [endCardDismissed, setEndCardDismissed] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "sharing" | "copied" | "error">(
    "idle",
  );
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const playMsRef = useRef(0);
  const playMsRefLastSet = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;
  const autoPlayedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const duration = prepared?.timeline.durationMs ?? 0;

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const tick = useCallback(
    (now: number) => {
      if (phaseRef.current !== "playing") return;
      const dt = now - lastFrameRef.current;
      lastFrameRef.current = now;
      const next = Math.min(playMsRef.current + dt, duration);
      playMsRef.current = next;
      // Throttle React updates to ~30fps; rAF keeps exact time in the ref.
      if (next >= duration) {
        setPlayMs(duration);
        setPhase("ended");
        return;
      }
      if (next - playMsRefLastSet.current >= FRAME_MS) {
        playMsRefLastSet.current = next;
        setPlayMs(next);
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [duration],
  );

  const play = useCallback(() => {
    if (!prepared) return;
    if (prefersReducedMotion) {
      playMsRef.current = duration;
      setPlayMs(duration);
      setPhase("ended");
      return;
    }
    if (phaseRef.current === "ended" || playMsRef.current >= duration) {
      playMsRef.current = 0;
      playMsRefLastSet.current = 0;
      setPlayMs(0);
    }
    setSelectedEventId(null);
    setSkippedToEnd(false);
    setEndCardDismissed(false);
    setPhase("playing");
    lastFrameRef.current = performance.now();
    stopRaf();
    rafRef.current = requestAnimationFrame(tick);
  }, [prepared, prefersReducedMotion, duration, stopRaf, tick]);

  const pause = useCallback(() => {
    stopRaf();
    stopAudio();
    setPlayMs(playMsRef.current);
    setPhase("paused");
  }, [stopRaf, stopAudio]);

  /**
   * Jump straight to the finished state (all dots on the map, interactive).
   * Used when the viewer starts exploring the bar chart without pressing
   * play — the map should show the data, not sit behind the play overlay.
   */
  const revealEndState = useCallback(() => {
    if (!prepared || phaseRef.current !== "idle") return;
    stopRaf();
    stopAudio();
    playMsRef.current = duration;
    playMsRefLastSet.current = duration;
    setPlayMs(duration);
    setSkippedToEnd(true);
    setPhase("ended");
  }, [prepared, duration, stopRaf, stopAudio]);

  const share = useCallback(async () => {
    if (!getShareUrl || shareState === "sharing") return;
    setShareState("sharing");
    try {
      const pathOrUrl = await getShareUrl();
      if (!pathOrUrl) {
        setShareState("idle");
        return;
      }
      const fullUrl = pathOrUrl.startsWith("http")
        ? pathOrUrl
        : `${window.location.origin}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
      const title = shareTitle || "My Week Replay";
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title, url: fullUrl });
          setShareState("idle");
          return;
        } catch {
          // Cancelled or unsupported — fall through to clipboard.
        }
      }
      await navigator.clipboard.writeText(fullUrl);
      setShareState("copied");
      window.setTimeout(() => setShareState("idle"), 2000);
    } catch {
      setShareState("error");
      window.setTimeout(() => setShareState("idle"), 2500);
    }
  }, [getShareUrl, shareState, shareTitle]);

  useEffect(() => () => stopRaf(), [stopRaf]);

  /**
   * Drive the audio engine from playback state rather than from the play
   * handler, so muting mid-replay, unmuting mid-replay, and starting playback
   * all take the same path.
   *
   * The AudioContext is built here, one tick after the click that started
   * playback. That still counts as user-activated (activation is sticky once
   * the page has been interacted with), so nothing plays unprompted: with no
   * gesture the context stays suspended and the replay is simply silent.
   *
   * A watched-through ending must not call pause(): that fades the closing
   * swell off mid-breath. release() stops scheduling and lets the same exhale
   * the exported video ends on ring out under the closing card.
   */
  useEffect(() => {
    if (!soundOn || prefersReducedMotion || !audioSchedule) {
      audioRef.current?.setMuted(true);
      audioRef.current?.pause();
      return;
    }
    if (phase === "playing") {
      if (!audioRef.current) {
        audioRef.current = createReplayAudioEngine(audioSchedule);
      }
      audioRef.current.setMuted(false);
      audioRef.current.start(playMsRef.current);
      return;
    }
    if (phase === "ended" && !skippedToEnd) {
      audioRef.current?.release();
      return;
    }
    audioRef.current?.pause();
  }, [soundOn, phase, prefersReducedMotion, audioSchedule, skippedToEnd]);

  // Deep-link auto-play once events are fully loaded (not mid-fill).
  useEffect(() => {
    if (
      autoPlay &&
      prepared &&
      !isPartial &&
      !autoPlayedRef.current &&
      phase === "idle"
    ) {
      autoPlayedRef.current = true;
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      play();
    }
  }, [autoPlay, prepared, isPartial, phase, play]);

  // Reset when the scope (and therefore the event set) changes.
  const scopeKey = `${cityId}:${isPlaceScope ? `p${selectedPlaceId}` : `d${selectedDistrict}`}`;
  const prevScopeKeyRef = useRef(scopeKey);
  useEffect(() => {
    if (prevScopeKeyRef.current !== scopeKey) {
      prevScopeKeyRef.current = scopeKey;
      stopRaf();
      stopAudio();
      playMsRef.current = 0;
      playMsRefLastSet.current = 0;
      setPlayMs(0);
      setPhase("idle");
      setSelectedEventId(null);
      setHighlightMetricId(null);
      setSkippedToEnd(false);
    }
  }, [scopeKey, stopRaf, stopAudio]);

  // Keep the fixed-position event popover glued to its dot: it renders in a
  // portal (to escape the hero card's overflow clipping), so reposition on
  // scroll/resize while open.
  const [, setRelayoutTick] = useState(0);
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);
  useEffect(() => {
    if (selectedEventId == null) return;
    const bump = () => setRelayoutTick((t) => t + 1);
    window.addEventListener("scroll", bump, true);
    window.addEventListener("resize", bump);
    return () => {
      window.removeEventListener("scroll", bump, true);
      window.removeEventListener("resize", bump);
    };
  }, [selectedEventId]);

  // ── Scrubbing ─────────────────────────────────────────────────────────
  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const scrubbingRef = useRef(false);

  const scrubTo = useCallback(
    (clientX: number) => {
      const el = scrubberRef.current;
      if (!el || !duration) return;
      const rect = el.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const next = f * duration;
      playMsRef.current = next;
      playMsRefLastSet.current = next;
      setPlayMs(next);
    },
    [duration],
  );

  const onScrubPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      scrubbingRef.current = true;
      if (phaseRef.current === "playing") pause();
      // Digging into the timeline leaves the closing card behind.
      if (phaseRef.current === "ended") setEndCardDismissed(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      scrubTo(e.clientX);
    },
    [pause, scrubTo],
  );
  const onScrubPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (scrubbingRef.current) scrubTo(e.clientX);
    },
    [scrubTo],
  );
  const onScrubPointerUp = useCallback(() => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    if (playMsRef.current >= duration) setPhase("ended");
    else setPhase("paused");
  }, [duration]);

  // ── Derived frame data ────────────────────────────────────────────────
  const timeline = prepared?.timeline ?? null;
  const currentWeekMs = timeline ? timeline.weekTimeAt(playMs) : 0;

  /**
   * Idle shows the finished frame — every event that landed all week — so the
   * unit reads as "here is your week, press play to watch it happen" rather
   * than as an empty map. During a partial load the same frame fills in as
   * each source reports back.
   */
  const visibleEvents = useMemo(() => {
    if (!prepared) return [];
    if (phase === "idle") return prepared.events;
    return prepared.events.filter((e) => e.playMs <= playMs);
  }, [prepared, phase, playMs]);

  /** Playback is under way (running or parked mid-week). */
  const isRunning = phase === "playing" || phase === "paused";

  /**
   * The key event currently holding the screen, if any. Everything else
   * lands as a dot without interrupting: naming all ~250 events would flash
   * one every few frames and read as noise. Between key moments this is
   * null and the callout fades away.
   */
  const activeKeyMoment = useMemo(() => {
    if (!prepared || !isRunning) return null;
    // The fade-out tail only exists while playing. Scrubbing into it would
    // otherwise park on a fully transparent callout and blank the row.
    const tail = phase === "playing" ? KEY_FADE_MS : 0;
    return (
      prepared.keyMoments.find(
        (m) => playMs >= m.playStartMs && playMs <= m.playEndMs + tail,
      ) ?? null
    );
  }, [prepared, isRunning, phase, playMs]);

  /** True once the hold is over: drives the fade-out before unmount. */
  const keyMomentLeaving =
    activeKeyMoment != null && playMs > activeKeyMoment.playEndMs;

  /** Callout for the key moment holding the screen (see buildEventCallout). */
  const keyCallout = useMemo(() => {
    if (!activeKeyMoment) return null;
    const e = activeKeyMoment.event;
    return {
      ...buildEventCallout(e),
      mediaUrl: mediaIsOk(e.media_url) ? e.media_url! : null,
    };
  }, [activeKeyMoment, mediaIsOk]);

  /** Weekend warmth still washes the map; night no longer dims it. */
  const weekendLevel = isRunning ? weekendness(currentWeekMs) : 0;

  /** Unique per instance so two replays on a page don't share a gradient. */
  const spotlightGradientId = `${useId()}spot`;
  /** Gradient reach: covers the frame from wherever the held event sits. */
  const spotlightOuterR = Math.max(mapW, mapH);

  /**
   * Spotlight strength: rises as a key moment takes hold and falls as it
   * releases, so the map darkens around the callout instead of cutting to it.
   */
  const spotlightLevel = useMemo(() => {
    if (!activeKeyMoment) return 0;
    const enter = Math.min(1, (playMs - activeKeyMoment.playStartMs) / 260);
    const leave = Math.min(
      1,
      Math.max(0, (activeKeyMoment.playEndMs - playMs) / KEY_FADE_MS),
    );
    return Math.max(0, Math.min(enter, leave));
  }, [activeKeyMoment, playMs]);

  const selectedEvent = useMemo(
    () =>
      selectedEventId == null
        ? null
        : (prepared?.events.find((e) => e.id === selectedEventId) ?? null),
    [selectedEventId, prepared],
  );

  /** Callout for a tapped dot, composed exactly like the key-moment one. */
  const selectionCallout = useMemo(
    () => (selectedEvent ? buildEventCallout(selectedEvent) : null),
    [selectedEvent],
  );

  /**
   * A 311 photo inside a callout, as a button that opens it full-screen.
   *
   * Thumbnails are cropped to the callout's width, which is exactly where the
   * detail that made the report worth looking at gets lost — so the small
   * version is an invitation to the whole frame. Playback pauses on the way
   * out, since the replay would otherwise run on behind the lightbox.
   */
  const renderCalloutPhoto = useCallback(
    (url: string, imgClassName: string, label?: string | null) => (
      <button
        type="button"
        className={styles.photoButton}
        onClick={(ev) => {
          ev.stopPropagation();
          if (phaseRef.current === "playing") pause();
          setLightboxUrl(url);
        }}
        aria-label={label ? `Enlarge photo: ${label}` : "Enlarge photo"}
        title="Enlarge photo"
      >
        <img src={url} alt="" className={imgClassName} />
        <span className={styles.photoZoomHint} aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <line x1="15.5" y1="15.5" x2="21" y2="21" />
            <line x1="10.5" y1="7.5" x2="10.5" y2="13.5" />
            <line x1="7.5" y1="10.5" x2="13.5" y2="10.5" />
          </svg>
        </span>
      </button>
    ),
    [pause],
  );

  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);

  const dayLabels = useMemo(() => {
    if (!timeline) return [];
    const dayMs = 24 * 60 * 60 * 1000;
    return windowDayLabels(timeline.weekStartMs).map((label, i) => ({
      label,
      isWeekend: isWeekendAt(timeline.weekStartMs + i * dayMs),
    }));
  }, [timeline]);

  /** The week's day/night/weekend rhythm, drawn under the scrubber track. */
  const dayNightBands = useMemo(
    () => (timeline ? buildDayNightBands(timeline) : []),
    [timeline],
  );

  /** Scrubber day-boundary positions as fractions of playback duration. */
  const dayBoundaries = useMemo(() => {
    if (!timeline || !duration) return [];
    const dayMs = 24 * 60 * 60 * 1000;
    const out: number[] = [];
    for (let i = 1; i < 7; i++) {
      out.push(timeline.playTimeAt(timeline.weekStartMs + i * dayMs) / duration);
    }
    return out;
  }, [timeline, duration]);

  /** Day-label centers: midpoints of the (hold-stretched) day segments. */
  const dayLabelCenters = useMemo(() => {
    const edges = [0, ...dayBoundaries, 1];
    const centers: number[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
      centers.push((edges[i] + edges[i + 1]) / 2);
    }
    return centers;
  }, [dayBoundaries]);

  // ── Bar chart: metrics, busiest first ─────────────────────────────────
  /**
   * One row per metric, ranked by how much of the week it accounts for.
   *
   * Flat rather than grouped by dashboard section: the sections were an extra
   * level to open before reaching anything specific, and "Public Safety: 38"
   * says less than "Assaults: 12". Each row carries the same icon and color
   * the metric's events wear on the map.
   */
  const chartRows = useMemo(() => {
    if (!prepared) return [];
    const totals = new Map<number, { name: string; total: number }>();
    for (const e of prepared.events) {
      const current = totals.get(e.metric_id);
      if (current) current.total += 1;
      else totals.set(e.metric_id, { name: e.metric_name, total: 1 });
    }
    return [...totals.entries()]
      .map(([metricId, v]) => ({
        metricId,
        label: metricDisplayName(v.name),
        icon: metricIcon(v.name),
        total: v.total,
        color: subcatColors.get(String(metricId)) ?? "#94a3b8",
      }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  }, [prepared, subcatColors]);

  /** Live counts that build up as events land (full counts when ended). */
  const liveChartCounts = useMemo(() => {
    const counts = new Map<number, number>();
    if (!prepared) return counts;
    const source =
      phase === "playing" || phase === "paused" ? visibleEvents : prepared.events;
    for (const e of source) {
      counts.set(e.metric_id, (counts.get(e.metric_id) ?? 0) + 1);
    }
    return counts;
  }, [prepared, phase, visibleEvents]);

  /** Does an event belong to the metric row the viewer picked? */
  const eventMatchesHighlight = useCallback(
    (e: WeekEvent) => highlightMetricId != null && e.metric_id === highlightMetricId,
    [highlightMetricId],
  );

  const chartMax = useMemo(
    () => Math.max(1, ...chartRows.map((r) => r.total)),
    [chartRows],
  );

  const eventCount = prepared?.events.length ?? 0;
  /**
   * Markers answer clicks in any still frame — paused, ended, and the end
   * frame the unit shows before playback. Only mid-playback are they inert,
   * where a tap would land on a dot that has already moved on.
   */
  const interactive = phase !== "playing" && visibleEvents.length > 0;

  const hasDistrictShapes = (sketch?.districts.length ?? 0) > 0;
  const hasPlacePoint = isPlaceScope && placeLat != null && placeLng != null;

  /** Base a marker disc is tinted toward, so the icon on it stays readable. */
  const markerFace = mapTheme === "dark" ? "#0f172a" : "#ffffff";

  /**
   * One event on the map.
   *
   * Drawn as the metric's own icon when it has one, so a glance reads as
   * "graffiti, permit, assault" rather than as anonymous color. Metrics without
   * an emoji keep the dot, and the dot also stays as the shape under the icon
   * for the two states that need a crisp outline: the held key moment and a
   * tapped selection.
   */
  const renderEvent = useCallback(
    (e: PreparedEvent) => {
      const isRecent =
        phase === "playing" && playMs - e.playMs <= PULSE_WINDOW_MS;
      const isSelected = selectedEventId === e.id;
      const emphasized = eventMatchesHighlight(e);
      const dimmed = highlightMetricId != null && !emphasized;
      const isKeyNow = activeKeyMoment?.event.id === e.id;
      const hasPhoto = mediaIsPendingOrOk(e.media_url);
      const color = eventColor(e);
      const icon = metricIcon(e.metric_name);
      // The disc carries the metric's color; the icon rides on top of it. Sized
      // so a ring of color still shows around the glyph — the color is the only
      // thing tying a marker back to its row in the chart.
      const r = isKeyNow ? 13 : isSelected ? 11 : emphasized ? 10 : e.is_key || hasPhoto ? 9.5 : 8.5;
      const size = r * 1.35;
      const opacity = dimmed ? 0.18 : isKeyNow || isRecent || emphasized ? 1 : 0.88;

      return (
        <g key={e.id}>
          {isKeyNow && !dimmed && (
            <circle
              className={styles.keyHalo}
              cx={e.x}
              cy={e.y}
              r={13}
              fill="none"
              stroke={hasPhoto ? MEDIA_GOLD : "#ad35fa"}
              strokeWidth={1.5}
            />
          )}
          {isRecent && (
            <circle
              className={styles.pulseRing}
              cx={e.x}
              cy={e.y}
              r={4}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
            />
          )}
          <circle
            className={styles.dot}
            cx={e.x}
            cy={e.y}
            r={r}
            fill={icon ? mixHex(color, markerFace, 0.22) : color}
            stroke={hasPhoto ? MEDIA_GOLD : color}
            strokeWidth={hasPhoto || isKeyNow ? 3 : 2}
            opacity={opacity}
          />
          {icon && (
            <text
              className={styles.eventIcon}
              x={e.x}
              y={e.y}
              fontSize={size}
              opacity={opacity}
              textAnchor="middle"
              dominantBaseline="central"
              aria-hidden="true"
            >
              {icon}
            </text>
          )}
          {interactive && !dimmed && (
            <circle
              className={styles.hitTarget}
              cx={e.x}
              cy={e.y}
              r={11}
              fill="transparent"
              onClick={(ev) => {
                ev.stopPropagation();
                setSelectedEventId(isSelected ? null : e.id);
              }}
            />
          )}
        </g>
      );
    },
    [
      phase,
      playMs,
      selectedEventId,
      eventMatchesHighlight,
      highlightMetricId,
      activeKeyMoment,
      mediaIsPendingOrOk,
      eventColor,
      interactive,
      markerFace,
    ],
  );

  /** The held key event is painted above the veil; everything else below it. */
  const heldEvent = activeKeyMoment?.event ?? null;
  const routineEvents = useMemo(
    () => visibleEvents.filter((e) => e.id !== heldEvent?.id),
    [visibleEvents, heldEvent],
  );

  // ── Video export ──────────────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  /** WebCodecs only; hide the entry point rather than offer a dead end. */
  const canExport = useMemo(
    () => isVideoExportSupported() && eventCount > 0,
    [eventCount],
  );
  /**
   * Share and export are offered on the resting frames — the landing state
   * before anyone presses play, and again once the replay ends. Someone who
   * arrives already knowing they want to send their week on shouldn't have to
   * watch it through first. They stay hidden mid-playback so the chrome keeps
   * off the thing being watched. While the closing card carries the share
   * CTA, the top-right cluster still exposes Video export.
   */
  const showShareCluster =
    !!prepared &&
    eventCount > 0 &&
    (phase === "idle" || phase === "ended") &&
    (!!getShareUrl || canExport);

  /**
   * Closing card after a watched-through (or scrubbed-to) ending — same count,
   * scope line, and branding as the exported video outro. Skipped-to-end via
   * the chart and an explicit dismiss leave the map clear to explore.
   */
  const showEndCard =
    phase === "ended" &&
    !skippedToEnd &&
    !endCardDismissed &&
    eventCount > 0;
  /** Names the replay in the video's title card and filename. */
  const resolvedScopeLabel =
    (scopeLabel || "").trim() ||
    (isPlaceScope ? (placeName || "").trim() : "") ||
    (selectedDistrict > 0 ? `District ${selectedDistrict}` : "") ||
    "your city";

  /**
   * Headline for the unit. A place is somewhere you are ("at Bay"), a district
   * or city is somewhere things happen ("in San Francisco").
   */
  const scopePhrase = weekReplayScopePhrase(resolvedScopeLabel, isPlaceScope);
  const headline = `Last week ${scopePhrase}`;

  /**
   * The play button says what pressing it plays, since the panel that carries
   * the headline is still held back at this point: what the replay covers, how
   * much is in it, and how long it runs.
   */
  const playMeta = useMemo(
    () =>
      [
        windowRange,
        eventCount > 0 ? `${eventCount} events` : null,
        duration > 0 ? `${Math.round(duration / 1000)}s` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    [windowRange, eventCount, duration],
  );

  /**
   * One line under the headline. It reports where playback is while running,
   * and what the week added up to once it isn't — never restating the headline,
   * since the two sit directly on top of each other.
   */
  const subline = useMemo(() => {
    if (isError) return "Couldn't load the last 7 days.";
    if (isRunning) {
      return `${visibleEvents.length} of ${eventCount} events so far`;
    }
    if (eventCount === 0) {
      return windowRange
        ? `No mapped events between ${windowRange}.`
        : "No mapped events in the last 7 days.";
    }
    const counted =
      data && data.total_before_cap > eventCount
        ? `${eventCount} of ${data.total_before_cap} events mapped`
        : `${eventCount} events mapped`;
    const categories =
      chartRows.length > 1 ? `${chartRows.length} categories` : null;
    return [windowRange, counted, categories].filter(Boolean).join(" · ");
  }, [
    isError,
    isRunning,
    visibleEvents.length,
    eventCount,
    windowRange,
    data,
    chartRows.length,
  ]);
  /** No events for this scope: keep the map with a small note instead of a
      mostly empty control panel. */
  const emptyTile = !isLoading && !isError && eventCount === 0;

  // ── Render ────────────────────────────────────────────────────────────
  if (!viewBbox) {
    return (
      <div
        className={`${styles.placeholder} ${className ?? ""}`}
        aria-hidden="true"
      />
    );
  }

  const idleClickable = phase === "idle" && !!onOpenScopeSelector;

  /**
   * Idle map body: with a marker's card open, the click that dismisses it is
   * the one anywhere else on the map — sending that to the scope selector
   * would answer a "close this" with a modal.
   */
  const onIdleMapClick = () => {
    if (selectedEventId != null) {
      setSelectedEventId(null);
      return;
    }
    onOpenScopeSelector?.();
  };

  return (
    <div
      ref={containerRef}
      className={`${styles.root} ${className ?? ""}`}
      data-phase={phase}
      data-empty={emptyTile ? "true" : undefined}
    >
      {/* ── Map banner (top row): dots + pins only ── */}
      <div
        ref={mapPanelRef}
        className={styles.mapPanel}
        onClick={idleClickable ? onIdleMapClick : undefined}
        role={idleClickable ? "button" : undefined}
        aria-label={idleClickable ? "View on map" : undefined}
      >
        {/* Geo-registered layers live in a frame locked to the fetched
            crop's aspect: it covers the cell at uniform scale (tiny crop
            instead of stretch), so circles stay circles. The clip is its own
            element so the panel itself can stay unclipped — callout cards
            (photos especially) then spill over the chart below instead of
            being cut off at the bottom of the map. */}
        <div className={styles.mapClip}>
        <div
          ref={mapFrameRef}
          className={styles.mapFrame}
          style={{ aspectRatio: `${mapW} / ${mapH}` }}
        >
        {basemapUrl && (
          <img src={basemapUrl} alt="" className={styles.basemap} aria-hidden="true" />
        )}
        {/* The overlay carries the place marker and its capture square as well
            as the district shapes, so it has to render for a place even when
            the city has no shapes at all — otherwise "your place" vanishes
            from its own replay in every city we haven't drawn yet. */}
        {(hasDistrictShapes || hasPlacePoint) && (
          <SketchOverlay
            sketch={sketch ?? EMPTY_SKETCH}
            viewBbox={viewBbox}
            highlightDistrict={highlightDistrict}
            showCityOutline={highlightDistrict == null && !isPlaceScope}
            isPlaceScope={isPlaceScope}
            placeLat={placeLat}
            placeLng={placeLng}
            placeRadiusM={placeRadiusM}
            fillDistricts={!basemapUrl}
            mapW={mapW}
            mapH={mapH}
            muted
            mutedDark={mapTheme === "dark"}
            placeName={placeName}
          />
        )}

        {/* Weekend warmth sits under the events. */}
        {isRunning && (
          <div
            className={styles.weekendWash}
            style={{ opacity: weekendLevel * WEEKEND_WASH_MAX }}
            aria-hidden="true"
          />
        )}

        {/* Animated event layer. Routine events, then the spotlight veil, then
            the event being called out — so the veil pushes back everything
            except the one thing the callout is naming. */}
        {prepared && visibleEvents.length > 0 && (
          <svg
            className={styles.eventLayer}
            viewBox={`0 0 ${mapW} ${mapH}`}
            preserveAspectRatio="none"
            style={{ pointerEvents: interactive ? "auto" : "none" }}
          >
            {routineEvents.map(renderEvent)}

            {spotlightLevel > 0.01 && activeKeyMoment && (
              <>
                <defs>
                  <radialGradient
                    id={spotlightGradientId}
                    gradientUnits="userSpaceOnUse"
                    cx={activeKeyMoment.event.x}
                    cy={activeKeyMoment.event.y}
                    r={spotlightOuterR}
                  >
                    {/* Clear out to the pulse ring's own reach, then fall away
                        quickly: a pool of light, not a vignette. */}
                    <stop offset={SPOTLIGHT_CLEAR_R / spotlightOuterR} stopColor="#020617" stopOpacity="0" />
                    <stop offset={(SPOTLIGHT_CLEAR_R * 2.6) / spotlightOuterR} stopColor="#020617" stopOpacity="0.7" />
                    <stop offset={(SPOTLIGHT_CLEAR_R * 6) / spotlightOuterR} stopColor="#020617" stopOpacity="0.95" />
                    <stop offset="1" stopColor="#020617" stopOpacity="1" />
                  </radialGradient>
                </defs>
                <rect
                  x={0}
                  y={0}
                  width={mapW}
                  height={mapH}
                  fill={`url(#${spotlightGradientId})`}
                  opacity={spotlightLevel * SPOTLIGHT_SCRIM_MAX}
                  pointerEvents="none"
                />
              </>
            )}

            {heldEvent ? renderEvent(heldEvent) : null}
          </svg>
        )}
        </div>
        </div>

        {/* Idle: loader, then the play button and what it plays. Everything the
            load has to say is said here, on the map, so the unit stays a single
            quiet object until it is asked to run.

            Wide place view: parked in the left gutter the crop already reserves
            for labels, so it never sits on the place marker or its name — and
            it steps aside entirely while a tapped marker's card is open, since
            the card lands in that same column. */}
        {phase === "idle" && !selectedEvent && (isLoading || eventCount > 0) && (
          <div
            className={styles.idleOverlay}
            data-align={!stacked && isPlaceScope ? "left" : undefined}
          >
            {isLoading ? (
              <span className={styles.mapLoaderChip}>
                <Loader size="md" color={theme === "dark" ? "white" : "purple"} />
                <span className={styles.loaderCaption}>
                  Preparing your weekly replay
                  {loadProgress ? (
                    <span className={styles.loaderProgress}>
                      Loading {loadProgress.done} of {loadProgress.total} sources
                    </span>
                  ) : null}
                </span>
              </span>
            ) : (
              <button
                type="button"
                className={styles.playButton}
                onClick={(e) => {
                  e.stopPropagation();
                  play();
                }}
              >
                <span className={styles.playButtonIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    <path d="M8 5v14l11-7z" fill="currentColor" />
                  </svg>
                </span>
                <span className={styles.playButtonCopy}>
                  <span className={styles.playButtonTitle}>
                    Play last week {scopePhrase}
                  </span>
                  {playMeta ? (
                    <span className={styles.playButtonMeta}>{playMeta}</span>
                  ) : null}
                </span>
              </button>
            )}
          </div>
        )}
        {/* Empty state: small note at the bottom of the full-width map */}
        {emptyTile && data && (
          <span className={styles.emptyNote}>
            No mapped events here in the last 7 days
            {windowRange ? ` (${windowRange})` : ""}
          </span>
        )}

        {/* Live clock (top-left) with key-event callout dropping out beneath
            it; share sits separately at top-right. In idle the column carries
            nothing but a tapped marker's card — there is no playback position
            for the clock to report yet. Hidden under the closing card so the
            ending reads as one composition. */}
        {prepared && timeline && (phase !== "idle" || selectedEvent) && !showEndCard && (
            <div className={styles.mapChromeLeft}>
              {phase !== "idle" && (
              <div className={styles.clock} aria-hidden="true">
                <span
                  className={styles.clockDaypart}
                  data-night={isNightAt(currentWeekMs) ? "true" : undefined}
                  title={isNightAt(currentWeekMs) ? "Night" : "Day"}
                >
                  {isNightAt(currentWeekMs) ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                      <path
                        d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z"
                        fill="currentColor"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                      <circle cx="12" cy="12" r="4" fill="currentColor" />
                      <g
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        fill="none"
                      >
                        <line x1="12" y1="2" x2="12" y2="4.5" />
                        <line x1="12" y1="19.5" x2="12" y2="22" />
                        <line x1="2" y1="12" x2="4.5" y2="12" />
                        <line x1="19.5" y1="12" x2="22" y2="12" />
                        <line x1="4.9" y1="4.9" x2="6.7" y2="6.7" />
                        <line x1="17.3" y1="17.3" x2="19.1" y2="19.1" />
                        <line x1="4.9" y1="19.1" x2="6.7" y2="17.3" />
                        <line x1="17.3" y1="6.7" x2="19.1" y2="4.9" />
                      </g>
                    </svg>
                  )}
                </span>
                <span
                  className={styles.clockDay}
                  data-weekend={isWeekendAt(currentWeekMs) ? "true" : undefined}
                >
                  {formatClockWeekday(currentWeekMs)}
                </span>
                <span className={styles.clockTime}>
                  {formatClockTime(currentWeekMs)}
                </span>
              </div>
              )}

              {activeKeyMoment && (
                <div
                  key={activeKeyMoment.event.id}
                  className={styles.keyCallout}
                  data-leaving={keyMomentLeaving ? "true" : undefined}
                  data-photo={keyCallout?.mediaUrl ? "true" : undefined}
                >
                  {keyCallout?.mediaUrl
                    ? renderCalloutPhoto(
                        keyCallout.mediaUrl,
                        styles.keyCalloutPhoto,
                        keyCallout.title,
                      )
                    : null}
                  <span className={styles.keyCalloutLabel}>
                    {keyCallout?.icon ? (
                      <span aria-hidden="true">{keyCallout.icon} </span>
                    ) : null}
                    {keyCallout?.title}
                  </span>
                  {keyCallout?.detail ? (
                    <span className={styles.keyCalloutMeta}>{keyCallout.detail}</span>
                  ) : null}
                </div>
              )}

              {/* Clicked datapoint — same left label column (wide place view).
                  Mobile keeps the bottom sheet via the portal below. */}
              {selectedEvent && interactive && !stacked && isPlaceScope && (
                <div
                  className={styles.selectionCallout}
                  data-photo={
                    mediaIsOk(selectedEvent.media_url) ? "true" : undefined
                  }
                  role="dialog"
                  aria-label="Event details"
                >
                  <button
                    type="button"
                    className={styles.popoverClose}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEventId(null);
                    }}
                    aria-label="Close"
                  >
                    ×
                  </button>
                  {mediaIsOk(selectedEvent.media_url)
                    ? renderCalloutPhoto(
                        selectedEvent.media_url!,
                        styles.keyCalloutPhoto,
                        selectionCallout?.title,
                      )
                    : null}
                  <span className={styles.keyCalloutLabel}>
                    {selectionCallout?.icon ? (
                      <span aria-hidden="true">{selectionCallout.icon} </span>
                    ) : null}
                    {selectionCallout?.title}
                  </span>
                  {selectionCallout?.detail ? (
                    <span className={styles.keyCalloutMeta}>
                      {selectionCallout.detail}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
        )}

        {/* Closing card — mirrors the exported video outro: final count, scope,
            branding. Share is the primary action; tapping the veil dismisses
            so the finished map can still be explored. */}
        {showEndCard && (
          <div
            className={styles.endOverlay}
            data-theme={mapTheme}
            onClick={(e) => {
              e.stopPropagation();
              setEndCardDismissed(true);
            }}
            role="presentation"
          >
            <div
              className={styles.endCard}
              role="status"
              aria-live="polite"
              onClick={(e) => e.stopPropagation()}
            >
              <span className={styles.endCount}>{eventCount}</span>
              <span className={styles.endCaption}>
                events mapped {scopePhrase}
              </span>
              <span className={styles.endBrand}>
                {[windowRange, "transparent.city"].filter(Boolean).join(" · ")}
              </span>
              {getShareUrl ? (
                <button
                  type="button"
                  className={styles.endShareButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    void share();
                  }}
                  disabled={shareState === "sharing"}
                  aria-label="Share this week replay"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  {shareState === "sharing"
                    ? "Sharing…"
                    : shareState === "copied"
                      ? "Link copied"
                      : shareState === "error"
                        ? "Couldn't share"
                        : "Share this week"}
                </button>
              ) : null}
              <button
                type="button"
                className={styles.endDismiss}
                onClick={(e) => {
                  e.stopPropagation();
                  setEndCardDismissed(true);
                }}
              >
                Explore the map
              </button>
            </div>
          </div>
        )}

        {/* Share and video export, top-right. Share hides while the closing
            card carries the prominent CTA; Video stays available. */}
        {showShareCluster && (canExport || (getShareUrl && !showEndCard)) && (
          <div className={styles.mapShare}>
            {canExport && (
              <button
                type="button"
                className={styles.headerShareButton}
                onClick={(e) => {
                  e.stopPropagation();
                  setExportOpen(true);
                }}
                aria-label="Save this week replay as a video"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="11"
                  height="11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="2" y="5" width="14" height="14" rx="2.5" />
                  <path d="M16 10l6-3.5v11L16 14z" />
                </svg>
                Video
              </button>
            )}
            {getShareUrl && !showEndCard && (
              <button
                type="button"
                className={styles.headerShareButton}
                onClick={(e) => {
                  e.stopPropagation();
                  void share();
                }}
                disabled={shareState === "sharing"}
                aria-label="Share this week replay"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="11"
                  height="11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                {shareState === "sharing"
                  ? "…"
                  : shareState === "copied"
                    ? "Copied!"
                    : shareState === "error"
                      ? "Failed"
                      : "Share"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Control panel ──
          Held back until the viewer presses play. Before that the unit is a
          map with one affordance on it, so it sits quietly next to the rest of
          the page instead of competing with it. An error is the exception: it
          needs somewhere to offer a retry. */}
      {!emptyTile && (phase !== "idle" || isError) && (
      <div className={styles.panel}>
        <div className={styles.panelLead}>
          <span className={styles.panelHeadline}>{headline}</span>
          <span className={styles.panelSubline}>
            {subline}
            {isError && phase === "idle" && (
              <button
                type="button"
                className={styles.idleRetry}
                onClick={() => void refetch()}
              >
                Try again
              </button>
            )}
          </span>
        </div>

        {/* Metrics, busiest first. Clicking one highlights its events on the
            map; the list scrolls past the first few rather than growing. */}
        {chartRows.length > 0 && (
          <div className={styles.chart} aria-label="Events by metric">
            {chartRows.map((row) => {
              const live = liveChartCounts.get(row.metricId) ?? 0;
              const isActive = highlightMetricId === row.metricId;
              const isMuted = highlightMetricId != null && !isActive;
              return (
                <button
                  key={row.metricId}
                  type="button"
                  className={`${styles.chartRow}${isActive ? ` ${styles.chartRowActive}` : ""}${isMuted ? ` ${styles.chartRowMuted}` : ""}`}
                  onClick={() => {
                    revealEndState();
                    setHighlightMetricId(isActive ? null : row.metricId);
                  }}
                  aria-pressed={isActive}
                  title={
                    isActive
                      ? "Clear highlight"
                      : `Highlight ${row.label} on the map`
                  }
                >
                  <span className={styles.chartLabel}>
                    {row.icon && (
                      <span className={styles.chartIcon} aria-hidden="true">
                        {row.icon}
                      </span>
                    )}
                    {row.label}
                  </span>
                  <span className={styles.chartTrack}>
                    <span
                      className={styles.chartBar}
                      style={{
                        width: `${(live / chartMax) * 100}%`,
                        background: row.color,
                      }}
                    />
                  </span>
                  <span className={styles.chartCount}>{live}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Controls: play/pause + scrubber (hidden until fully loaded) */}
        {prepared && !isLoading && duration > 0 && (
          <div className={styles.controls}>
            <button
              type="button"
              className={`${styles.controlButton}${phase === "ended" && skippedToEnd ? ` ${styles.controlButtonAccent}` : ""}`}
              onClick={phase === "playing" ? pause : play}
              aria-label={
                phase === "playing"
                  ? "Pause"
                  : phase === "ended" && !skippedToEnd
                    ? "Replay"
                    : "Play"
              }
            >
              {phase === "playing" ? (
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor" />
                </svg>
              ) : phase === "ended" && !skippedToEnd ? (
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path
                    d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"
                    fill="currentColor"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path d="M8 5v14l11-7z" fill="currentColor" />
                </svg>
              )}
            </button>

            {/* Sound toggle. Visible whether or not playback has started, so
                the choice is made before the first blip rather than after. */}
            <button
              type="button"
              className={styles.controlButton}
              onClick={toggleSound}
              aria-pressed={soundOn}
              aria-label={soundOn ? "Mute replay sound" : "Unmute replay sound"}
              title={soundOn ? "Sound on" : "Sound off"}
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M11 5 6.5 9H3v6h3.5L11 19z" fill="currentColor" stroke="none" />
                {soundOn ? (
                  <>
                    <path d="M15.5 8.5a4.5 4.5 0 0 1 0 7" />
                    <path d="M18.5 5.5a8.5 8.5 0 0 1 0 13" />
                  </>
                ) : (
                  <>
                    <line x1="16" y1="9" x2="21" y2="15" />
                    <line x1="21" y1="9" x2="16" y2="15" />
                  </>
                )}
              </svg>
            </button>

            <div
              ref={scrubberRef}
              className={styles.scrubber}
              onPointerDown={onScrubPointerDown}
              onPointerMove={onScrubPointerMove}
              onPointerUp={onScrubPointerUp}
              onPointerCancel={onScrubPointerUp}
              role="slider"
              aria-label="Week timeline"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={duration ? Math.round((playMs / duration) * 100) : 0}
              aria-valuetext={`${formatPlaybackClock(playMs)} of ${formatPlaybackClock(duration)}`}
            >
              <div className={styles.scrubberTrack}>
                <div
                  className={styles.scrubberFill}
                  style={{ width: `${duration ? (playMs / duration) * 100 : 0}%` }}
                />
              </div>
              {/* Day/night/weekend ribbon: the same rhythm the map washes
                  itself with, laid out across the whole week. */}
              <div
                className={styles.scrubberRibbon}
                role="img"
                aria-label="Nights are shaded dark and weekends purple"
              >
                {dayNightBands.map((band, i) => (
                  <span
                    key={i}
                    className={styles.scrubberBand}
                    data-night={band.isNight ? "true" : undefined}
                    data-weekend={band.isWeekend ? "true" : undefined}
                    style={{
                      left: `${band.startF * 100}%`,
                      width: `${(band.endF - band.startF) * 100}%`,
                    }}
                  />
                ))}
              </div>
              <div className={styles.scrubberDays} aria-hidden="true">
                {dayLabels.map((day, i) => (
                  <span
                    key={i}
                    className={styles.scrubberDayLabel}
                    data-weekend={day.isWeekend ? "true" : undefined}
                    style={{ left: `${(dayLabelCenters[i] ?? 0) * 100}%` }}
                  >
                    {day.label}
                  </span>
                ))}
              </div>
            </div>

            {/* How far in, and how long the whole thing runs — so the length is
                known before committing to it. The slider carries the same
                reading in aria-valuetext, so this stays out of the a11y tree
                rather than being announced on every frame. */}
            <span className={styles.timeReadout} aria-hidden="true">
              {formatPlaybackClock(playMs)}
              <span className={styles.timeReadoutTotal}>
                {" / "}
                {formatPlaybackClock(duration)}
              </span>
            </span>
          </div>
        )}
      </div>
      )}

      {exportOpen && data && (
        <WeekReplayExportDialog
          onClose={() => setExportOpen(false)}
          data={data}
          sketch={sketch}
          selectedDistrict={selectedDistrict}
          isPlaceScope={isPlaceScope}
          placeDistrict={placeDistrict}
          placeLat={placeLat}
          placeLng={placeLng}
          placeRadiusM={placeRadiusM}
          scopeLabel={resolvedScopeLabel}
          theme={mapTheme}
          getShareUrl={getShareUrl}
        />
      )}

      {/* ── Selected event details.
          Place + wide: already rendered in the left label column above.
          Mobile: bottom sheet. Non-place wide: fixed popover on the dot. ── */}
      {portalReady &&
        selectedEvent &&
        interactive &&
        (stacked || !isPlaceScope) &&
        createPortal(
          stacked ? (
            <div className={styles.sheet} role="dialog" aria-label="Event details">
              <button
                type="button"
                className={styles.popoverClose}
                onClick={() => setSelectedEventId(null)}
                aria-label="Close"
              >
                ×
              </button>
              {mediaIsOk(selectedEvent.media_url) ? (
                renderCalloutPhoto(
                  selectedEvent.media_url!,
                  styles.sheetPhoto,
                  selectionCallout?.title,
                )
              ) : selectionCallout?.icon ? (
                <span className={styles.sheetIcon} aria-hidden="true">
                  {selectionCallout.icon}
                </span>
              ) : (
                <span
                  className={styles.sheetDot}
                  style={{ background: eventColor(selectedEvent) }}
                />
              )}
              <span className={styles.popoverLabel}>{selectionCallout?.title}</span>
              {selectionCallout?.detail ? (
                <span className={styles.popoverMeta}>{selectionCallout.detail}</span>
              ) : null}
              {onEventMetricClick && (
                <button
                  type="button"
                  className={styles.popoverLink}
                  onClick={() => onEventMetricClick(selectedEvent.metric_id)}
                >
                  View metric
                </button>
              )}
            </div>
          ) : (
            (() => {
              const rect = mapFrameRef.current?.getBoundingClientRect();
              if (!rect) return null;
              const left = rect.left + (selectedEvent.x / mapW) * rect.width;
              const top = rect.top + (selectedEvent.y / mapH) * rect.height;
              const below = top < 150;
              return (
                <div
                  className={styles.popoverFixed}
                  data-below={below ? "true" : undefined}
                  style={{ left, top }}
                  role="dialog"
                  aria-label="Event details"
                >
                  <button
                    type="button"
                    className={styles.popoverClose}
                    onClick={() => setSelectedEventId(null)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                  <span className={styles.popoverLabel}>
                    {selectionCallout?.icon ? (
                      <span aria-hidden="true">{selectionCallout.icon} </span>
                    ) : null}
                    {selectionCallout?.title}
                  </span>
                  {selectionCallout?.detail ? (
                    <span className={styles.popoverMeta}>
                      {selectionCallout.detail}
                    </span>
                  ) : null}
                  {onEventMetricClick && (
                    <button
                      type="button"
                      className={styles.popoverLink}
                      onClick={() => onEventMetricClick(selectedEvent.metric_id)}
                    >
                      View metric
                    </button>
                  )}
                </div>
              );
            })()
          ),
          document.body,
        )}

      {/* Full-screen 311 photo. Portaled to <body> so it clears the hero
          card's clipping, and dismissed by anything that reads as "out":
          the backdrop, the close button, or Escape. */}
      {portalReady &&
        lightboxUrl &&
        createPortal(
          <div
            className={styles.lightbox}
            role="dialog"
            aria-modal="true"
            aria-label="Report photo"
            onClick={() => setLightboxUrl(null)}
          >
            <button
              type="button"
              className={styles.lightboxClose}
              onClick={() => setLightboxUrl(null)}
              aria-label="Close photo"
            >
              ×
            </button>
            <img
              src={lightboxUrl}
              alt=""
              className={styles.lightboxImage}
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
