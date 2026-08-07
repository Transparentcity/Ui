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
 * After playback the unit stays interactive: scrub the week, tap pins/dots
 * for details, replay, share.
 *
 * Events come from GET /api/user/week-events (persona-boosted ranking,
 * never persona-filtered) and are fetched lazily on mount.
 */

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery } from "@tanstack/react-query";

import { getWeekEvents } from "@/lib/apiClient";
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
  buildDayNightBands,
  buildPlaybackTimeline,
  buildSubcategoryColors,
  eventDashCategoryKey,
  eventDateKey,
  eventTimeMs,
  formatClockTime,
  formatClockWeekday,
  formatEventTime,
  formatWindowRange,
  isNightAt,
  isWeekendAt,
  metricDisplayName,
  metricIcon,
  nightness,
  weekendness,
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

/** Max distinct bars in the chart; the rest aggregate into "Other". */
const MAX_CHART_ROWS = 8;

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
 * Peak darkening of the map at deep night. Kept low on purpose: a day passes
 * in DAY_PLAYBACK_MS, so this cycles seven times during playback and a
 * heavier scrim reads as flashing rather than as nightfall.
 */
const NIGHT_SCRIM_MAX = 0.24;
/** Peak warmth of the weekend wash. */
const WEEKEND_WASH_MAX = 0.1;

/** A key event and the playback window it holds the screen for. */
interface KeyMoment {
  playStartMs: number;
  playEndMs: number;
  event: PreparedEvent;
}

/**
 * Icon + label for an event callout.
 *
 * Events with no descriptive text of their own fall back to the metric name
 * server-side, which carries the metric's emoji — so the label is stripped of
 * any leading icon and the icon is always rendered as its own element,
 * instead of showing up twice.
 */
function calloutParts(e: WeekEvent): { icon: string | null; label: string } {
  return {
    icon: metricIcon(e.metric_name) ?? metricIcon(e.label),
    label: metricDisplayName(e.label),
  };
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

  /** Scope phrase for loading copy: block / district / city. */
  const scopePhrase = isPlaceScope
    ? "near your place"
    : selectedDistrict > 0
      ? "in your district"
      : "across the city";

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

  /** Dashboard section → color for dots and chart bars (kept in sync so a
      bar and its dots always share a hue). */
  const subcatColors = useMemo(
    () => buildSubcategoryColors(prepared?.events ?? [], eventDashCategoryKey),
    [prepared],
  );
  const eventColor = useCallback(
    (e: WeekEvent) => subcatColors.get(eventDashCategoryKey(e)) ?? "#94a3b8",
    [subcatColors],
  );

  // ── Playback state ────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("idle");
  const [playMs, setPlayMs] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  /**
   * Chart selection: a subcategory row key, or "m:<metricId>" for a child
   * metric row. Highlights the matching dots on the map.
   */
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  /** Subcategory rows expanded into their child metric rows. */
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  /**
   * True when the viewer jumped to the end via a chart click instead of
   * watching playback — the control button then keeps its play affordance
   * (purple) rather than switching to "replay".
   */
  const [skippedToEnd, setSkippedToEnd] = useState(false);
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
    setPhase("playing");
    lastFrameRef.current = performance.now();
    stopRaf();
    rafRef.current = requestAnimationFrame(tick);
  }, [prepared, prefersReducedMotion, duration, stopRaf, tick]);

  const pause = useCallback(() => {
    stopRaf();
    setPlayMs(playMsRef.current);
    setPhase("paused");
  }, [stopRaf]);

  /**
   * Jump straight to the finished state (all dots on the map, interactive).
   * Used when the viewer starts exploring the bar chart without pressing
   * play — the map should show the data, not sit behind the play overlay.
   */
  const revealEndState = useCallback(() => {
    if (!prepared || phaseRef.current !== "idle") return;
    stopRaf();
    playMsRef.current = duration;
    playMsRefLastSet.current = duration;
    setPlayMs(duration);
    setSkippedToEnd(true);
    setPhase("ended");
  }, [prepared, duration, stopRaf]);

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
      playMsRef.current = 0;
      playMsRefLastSet.current = 0;
      setPlayMs(0);
      setPhase("idle");
      setSelectedEventId(null);
      setHighlightKey(null);
      setExpandedKeys(new Set());
      setSkippedToEnd(false);
    }
  }, [scopeKey, stopRaf]);

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

  const visibleEvents = useMemo(() => {
    if (!prepared) return [];
    if (phase === "idle") return [];
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

  /**
   * Callout text shared by the map card and the ticker. The map card gets the
   * glanceable version; the ticker adds the metric, unless the event had no
   * description of its own and is already named after it.
   */
  const keyCallout = useMemo(() => {
    if (!activeKeyMoment) return null;
    const e = activeKeyMoment.event;
    const { icon, label } = calloutParts(e);
    const metric = metricDisplayName(e.metric_name);
    const when = formatEventTime(e.ts);
    const mediaUrl = mediaIsOk(e.media_url) ? e.media_url! : null;
    return {
      icon,
      label,
      mediaUrl,
      onMap: [when, e.address].filter(Boolean).join(" · "),
      inTicker: [metric === label ? null : metric, e.address, when]
        .filter(Boolean)
        .join(" · "),
    };
  }, [activeKeyMoment, mediaIsOk]);

  /** Continuous time-of-day / weekend signals for the map overlays. */
  const nightLevel = isRunning ? nightness(currentWeekMs) : 0;
  const weekendLevel = isRunning ? weekendness(currentWeekMs) : 0;

  const selectedEvent = useMemo(
    () =>
      selectedEventId == null
        ? null
        : (prepared?.events.find((e) => e.id === selectedEventId) ?? null),
    [selectedEventId, prepared],
  );

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

  // ── Bar chart (dashboard sections → metrics) ──────────────────────────
  /** Fixed row set: the dashboard's sections in dashboard order (then by
      count for unordered ones), top rows + "Other". */
  const chartRows = useMemo(() => {
    if (!prepared) return [];
    const finalCounts = new Map<string, number>();
    const minOrder = new Map<string, number>();
    for (const e of prepared.events) {
      const key = eventDashCategoryKey(e);
      finalCounts.set(key, (finalCounts.get(key) ?? 0) + 1);
      const order = e.dash_category_order ?? 1000;
      minOrder.set(key, Math.min(minOrder.get(key) ?? Infinity, order));
    }
    const ordered = [...finalCounts.entries()].sort((a, b) => {
      const orderA = minOrder.get(a[0]) ?? 1000;
      const orderB = minOrder.get(b[0]) ?? 1000;
      if (orderA !== orderB) return orderA - orderB;
      return b[1] - a[1] || a[0].localeCompare(b[0]);
    });
    const rows = ordered.slice(0, MAX_CHART_ROWS).map(([key, total]) => ({
      key,
      total,
      color: subcatColors.get(key) ?? "#94a3b8",
      isOther: false,
    }));
    const overflow = ordered.slice(MAX_CHART_ROWS);
    if (overflow.length > 0) {
      rows.push({
        key: "Other",
        total: overflow.reduce((n, [, c]) => n + c, 0),
        color: "#94a3b8",
        isOther: true,
      });
    }
    return rows;
  }, [prepared, subcatColors]);

  /** Named chart rows (everything else folds into "Other"). */
  const namedRowKeys = useMemo(
    () => new Set(chartRows.filter((r) => !r.isOther).map((r) => r.key)),
    [chartRows],
  );

  /** Chart-row key for an event (its dashboard section, or "Other"). */
  const rowKeyFor = useCallback(
    (e: WeekEvent) => {
      const key = eventDashCategoryKey(e);
      return namedRowKeys.has(key) ? key : "Other";
    },
    [namedRowKeys],
  );

  /** Live counts that build up as dots land (full counts when idle/ended). */
  const liveChartCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!prepared) return counts;
    const source =
      phase === "playing" || phase === "paused" ? visibleEvents : prepared.events;
    for (const e of source) {
      const rowKey = rowKeyFor(e);
      counts.set(rowKey, (counts.get(rowKey) ?? 0) + 1);
    }
    return counts;
  }, [prepared, phase, visibleEvents, rowKeyFor]);

  /**
   * Second chart level: the metrics inside the subcategory, each with its
   * own icon (crime → 📦 Property / 🚨 Violent / 💊 Drug…). Which metrics
   * exist here is editorially curated server-side via the per-metric
   * ``show_on_week_replay`` flag, so no catch-all breakdown is needed.
   */
  const chartChildren = useMemo(() => {
    const out = new Map<
      string,
      Array<{ key: string; label: string; total: number; icon: string | null }>
    >();
    if (!prepared) return out;
    const byRow = new Map<string, Map<number, { name: string; total: number }>>();
    for (const e of prepared.events) {
      const rowKey = rowKeyFor(e);
      let metricsMap = byRow.get(rowKey);
      if (!metricsMap) {
        metricsMap = new Map();
        byRow.set(rowKey, metricsMap);
      }
      const cur = metricsMap.get(e.metric_id);
      if (cur) cur.total += 1;
      else metricsMap.set(e.metric_id, { name: e.metric_name, total: 1 });
    }
    for (const [rowKey, metricsMap] of byRow) {
      out.set(
        rowKey,
        [...metricsMap.entries()]
          .map(([metricId, v]) => ({
            key: `${rowKey}::m${metricId}`,
            label: metricDisplayName(v.name),
            icon: metricIcon(v.name),
            total: v.total,
          }))
          .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)),
      );
    }
    return out;
  }, [prepared, rowKeyFor]);

  /** Child-row key for an event (its metric within its subcategory row). */
  const childKeyFor = useCallback(
    (e: WeekEvent) => `${rowKeyFor(e)}::m${e.metric_id}`,
    [rowKeyFor],
  );

  /** Live per-metric counts (for expanded child rows). */
  const liveChildCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!prepared) return counts;
    const source =
      phase === "playing" || phase === "paused" ? visibleEvents : prepared.events;
    for (const e of source) {
      const key = childKeyFor(e);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [prepared, phase, visibleEvents, childKeyFor]);

  /** Does an event match the current chart selection (subcat or type)? */
  const eventMatchesHighlight = useCallback(
    (e: WeekEvent) => {
      if (highlightKey == null) return false;
      if (highlightKey.startsWith("l:")) {
        return childKeyFor(e) === highlightKey.slice(2);
      }
      return rowKeyFor(e) === highlightKey;
    },
    [highlightKey, rowKeyFor, childKeyFor],
  );

  const chartMax = useMemo(
    () => Math.max(1, ...chartRows.map((r) => r.total)),
    [chartRows],
  );

  const eventCount = prepared?.events.length ?? 0;
  const interactive = phase === "paused" || phase === "ended";
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
        onClick={idleClickable ? onOpenScopeSelector : undefined}
        role={idleClickable ? "button" : undefined}
        aria-label={idleClickable ? "View on map" : undefined}
      >
        {/* Geo-registered layers live in a frame locked to the fetched
            crop's aspect: it covers the cell at uniform scale (tiny crop
            instead of stretch), so circles stay circles. */}
        <div
          ref={mapFrameRef}
          className={styles.mapFrame}
          style={{ aspectRatio: `${mapW} / ${mapH}` }}
        >
        {basemapUrl && (
          <img src={basemapUrl} alt="" className={styles.basemap} aria-hidden="true" />
        )}
        {sketch && sketch.districts.length > 0 && (
          <SketchOverlay
            sketch={sketch}
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

        {/* Time-of-day wash: night dims the basemap, weekends warm it. Both
            sit under the dots so events stay at full contrast. */}
        {isRunning && (
          <>
            <div
              className={styles.nightScrim}
              style={{ opacity: nightLevel * NIGHT_SCRIM_MAX }}
              aria-hidden="true"
            />
            <div
              className={styles.weekendWash}
              style={{ opacity: weekendLevel * WEEKEND_WASH_MAX }}
              aria-hidden="true"
            />
          </>
        )}

        {/* Animated event layer */}
        {prepared && phase !== "idle" && (
          <svg
            className={styles.eventLayer}
            viewBox={`0 0 ${mapW} ${mapH}`}
            preserveAspectRatio="none"
            style={{ pointerEvents: interactive ? "auto" : "none" }}
          >
            {visibleEvents.map((e) => {
              const isRecent =
                phase === "playing" && playMs - e.playMs <= PULSE_WINDOW_MS;
              const isSelected = selectedEventId === e.id;
              const emphasized = eventMatchesHighlight(e);
              const dimmed = highlightKey != null && !emphasized;
              const isKeyNow = activeKeyMoment?.event.id === e.id;
              const hasPhoto = mediaIsPendingOrOk(e.media_url);
              const color = eventColor(e);
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
                    r={
                      isKeyNow
                        ? 6
                        : isSelected
                          ? 5
                          : emphasized
                            ? 4.5
                            : e.is_key || hasPhoto
                              ? 4
                              : 3
                    }
                    fill={color}
                    stroke={
                      hasPhoto
                        ? MEDIA_GOLD
                        : isKeyNow || isSelected || emphasized || e.is_key
                          ? "#fff"
                          : "none"
                    }
                    strokeWidth={
                      hasPhoto
                        ? 2
                        : isKeyNow
                          ? 2
                          : isSelected
                            ? 1.5
                            : emphasized
                              ? 0.75
                              : e.is_key
                                ? 1
                                : 0
                    }
                    opacity={
                      dimmed
                        ? 0.12
                        : isKeyNow || isRecent || emphasized
                          ? 0.95
                          : 0.65
                    }
                  />
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
            })}
          </svg>
        )}
        </div>

        {/* Idle: centered play button (spinner while sources still load) */}
        {phase === "idle" && (isLoading || eventCount > 0) && (
          <div className={styles.idleOverlay}>
            {isLoading ? (
              <span className={styles.mapLoaderChip} aria-hidden="true">
                <Loader size="md" color={theme === "dark" ? "white" : "purple"} />
              </span>
            ) : (
              <button
                type="button"
                className={styles.playButton}
                onClick={(e) => {
                  e.stopPropagation();
                  play();
                }}
                aria-label="Replay the last 7 days"
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                  <path d="M8 5v14l11-7z" fill="currentColor" />
                </svg>
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
            it; share sits separately at top-right when playback ends. */}
        {prepared && phase !== "idle" && timeline && (
          <>
            <div className={styles.mapChromeLeft}>
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

              {activeKeyMoment && (
                <div
                  key={activeKeyMoment.event.id}
                  className={styles.keyCallout}
                  data-leaving={keyMomentLeaving ? "true" : undefined}
                  data-photo={keyCallout?.mediaUrl ? "true" : undefined}
                >
                  {keyCallout?.mediaUrl ? (
                    <img
                      src={keyCallout.mediaUrl}
                      alt=""
                      className={styles.keyCalloutPhoto}
                    />
                  ) : null}
                  <span className={styles.keyCalloutLabel}>
                    {keyCallout?.icon ? (
                      <span aria-hidden="true">{keyCallout.icon} </span>
                    ) : null}
                    {keyCallout?.label}
                  </span>
                  <span className={styles.keyCalloutMeta}>{keyCallout?.onMap}</span>
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
                  {mediaIsOk(selectedEvent.media_url) ? (
                    <img
                      src={selectedEvent.media_url!}
                      alt=""
                      className={styles.keyCalloutPhoto}
                    />
                  ) : null}
                  <span className={styles.keyCalloutLabel}>
                    {metricIcon(selectedEvent.metric_name) ? (
                      <span aria-hidden="true">
                        {metricIcon(selectedEvent.metric_name)}{" "}
                      </span>
                    ) : null}
                    {selectedEvent.label}
                  </span>
                  {selectedEvent.address && (
                    <span className={styles.keyCalloutMeta}>
                      {selectedEvent.address}
                    </span>
                  )}
                  <span className={styles.keyCalloutMeta}>
                    {formatEventTime(selectedEvent.ts)} ·{" "}
                    {metricDisplayName(selectedEvent.metric_name)}
                  </span>
                  {onEventMetricClick && (
                    <button
                      type="button"
                      className={styles.popoverLink}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventMetricClick(selectedEvent.metric_id);
                      }}
                    >
                      View metric
                    </button>
                  )}
                </div>
              )}
            </div>

            {phase === "ended" && getShareUrl ? (
              <div className={styles.mapShare}>
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
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* ── Control panel (row below the map; hidden when empty) ── */}
      {!emptyTile && (
      <div className={styles.panel}>
        {/* Idle / error header — the live clock lives on the map instead. */}
        {(phase === "idle" || isError) && (
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>
            {isLoading
              ? "Preparing your replay…"
              : eventCount > 0
                ? `Last 7 days — ${eventCount} events`
                : isError
                  ? "Couldn't load the last 7 days"
                  : "No mapped events in the last 7 days"}
            {!isLoading && eventCount > 0 && data && data.total_before_cap > eventCount
              ? ` (of ${data.total_before_cap})`
              : ""}
            {!isLoading && windowRange ? (
              <span className={styles.panelTitleRange}> · {windowRange}</span>
            ) : null}
          </span>

          <span className={styles.panelHeaderSpacer} />

          {isError && phase === "idle" && (
            <button
              type="button"
              className={styles.idleRetry}
              onClick={() => void refetch()}
            >
              Try again
            </button>
          )}
        </div>
        )}

        {/* Ticker: the key event currently holding the screen */}
        <div className={styles.ticker}>
          {activeKeyMoment ? (
            <div
              className={styles.eventCard}
              key={activeKeyMoment.event.id}
              data-leaving={keyMomentLeaving ? "true" : undefined}
            >
              {keyCallout?.icon ? (
                <span className={styles.eventCardEmoji} aria-hidden="true">
                  {keyCallout.icon}
                </span>
              ) : (
                <span
                  className={styles.eventCardDot}
                  style={{ background: eventColor(activeKeyMoment.event) }}
                />
              )}
              <span className={styles.eventCardBody}>
                <span className={styles.eventCardLabel}>{keyCallout?.label}</span>
                <span className={styles.eventCardMeta}>{keyCallout?.inTicker}</span>
              </span>
            </div>
          ) : isRunning ? (
            // Between key moments: a quiet running tally so the row keeps its
            // height and the build-up still reads as progress.
            <span className={styles.tickerCount}>
              {visibleEvents.length} of {eventCount} events so far
            </span>
          ) : phase === "idle" && isLoading ? (
            <div className={styles.loadingBlock}>
              <span className={styles.tickerHint}>
                Building an animated replay of every event mapped {scopePhrase}{" "}
                over the last 7 days{windowRange ? ` (${windowRange})` : ""}…
              </span>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  data-indeterminate={loadProgress ? undefined : "true"}
                  style={
                    loadProgress
                      ? {
                          width: `${
                            (loadProgress.done / Math.max(1, loadProgress.total)) * 100
                          }%`,
                        }
                      : undefined
                  }
                />
              </div>
              {loadProgress && (
                <span className={styles.progressLabel}>
                  {loadProgress.done} of {loadProgress.total} data sources
                  {eventCount > 0 ? ` · ${eventCount} events so far` : ""}
                </span>
              )}
            </div>
          ) : phase === "idle" && eventCount > 0 ? (
            <span className={styles.tickerHint}>
              Press play to watch the last 7 days unfold.
            </span>
          ) : null}
        </div>

        {/* Bar chart: subcategory (level 1) → request/incident type (level 2).
            Children stay collapsed until their subcategory is clicked;
            clicking also highlights those dots on the map. */}
        {chartRows.length > 0 && (
          <div className={styles.chart} aria-label="Events by category">
            {chartRows.map((row) => {
              const live = liveChartCounts.get(row.key) ?? 0;
              const isActive = highlightKey === row.key;
              const children = chartChildren.get(row.key) ?? [];
              const isExpanded = expandedKeys.has(row.key);
              const childActive = highlightKey?.startsWith(`l:${row.key}::`);
              const isMuted =
                highlightKey != null && !isActive && !childActive;
              return (
                <div key={row.key} className={styles.chartGroup}>
                  <button
                    type="button"
                    className={`${styles.chartRow}${isActive ? ` ${styles.chartRowActive}` : ""}${isMuted ? ` ${styles.chartRowMuted}` : ""}`}
                    onClick={() => {
                      revealEndState();
                      setExpandedKeys((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.key)) next.delete(row.key);
                        else next.add(row.key);
                        return next;
                      });
                      // Collapsing clears the highlight; expanding sets it.
                      setHighlightKey(isExpanded ? null : row.key);
                    }}
                    aria-pressed={isActive}
                    aria-expanded={isExpanded}
                    title={
                      isExpanded
                        ? "Collapse and clear highlight"
                        : `Highlight ${row.key} events and show its metrics`
                    }
                  >
                    <span className={styles.chartLabel}>
                      {children.length > 0 && (
                        <span className={styles.chartCaret} aria-hidden="true">
                          {isExpanded ? "▾" : "▸"}
                        </span>
                      )}
                      {row.key}
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

                  {isExpanded &&
                    children.map((child) => {
                      const childKey = `l:${child.key}`;
                      const childLive = liveChildCounts.get(child.key) ?? 0;
                      const childIsActive = highlightKey === childKey;
                      return (
                        <button
                          key={child.key}
                          type="button"
                          className={`${styles.chartChildRow}${childIsActive ? ` ${styles.chartRowActive}` : ""}${isMuted && !childIsActive ? ` ${styles.chartRowMuted}` : ""}`}
                          onClick={() => {
                            revealEndState();
                            setHighlightKey(childIsActive ? null : childKey);
                          }}
                          aria-pressed={childIsActive}
                          title={
                            childIsActive
                              ? "Clear highlight"
                              : `Highlight only ${child.label}`
                          }
                        >
                          <span className={styles.chartChildLabel}>
                            {child.icon && (
                              <span
                                className={styles.chartChildIcon}
                                aria-hidden="true"
                              >
                                {child.icon}
                              </span>
                            )}
                            {child.label}
                          </span>
                          <span className={styles.chartTrack}>
                            <span
                              className={`${styles.chartBar} ${styles.chartChildBar}`}
                              style={{
                                width: `${(childLive / chartMax) * 100}%`,
                                background: row.color,
                              }}
                            />
                          </span>
                          <span className={styles.chartCount}>{childLive}</span>
                        </button>
                      );
                    })}
                </div>
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
          </div>
        )}
      </div>
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
                <img
                  src={selectedEvent.media_url!}
                  alt=""
                  className={styles.sheetPhoto}
                />
              ) : metricIcon(selectedEvent.metric_name) ? (
                <span className={styles.sheetIcon} aria-hidden="true">
                  {metricIcon(selectedEvent.metric_name)}
                </span>
              ) : (
                <span
                  className={styles.sheetDot}
                  style={{ background: eventColor(selectedEvent) }}
                />
              )}
              <span className={styles.popoverLabel}>{selectedEvent.label}</span>
              {selectedEvent.address && (
                <span className={styles.popoverMeta}>{selectedEvent.address}</span>
              )}
              <span className={styles.popoverMeta}>
                {formatEventTime(selectedEvent.ts)} ·{" "}
                {metricDisplayName(selectedEvent.metric_name)}
              </span>
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
                    {metricIcon(selectedEvent.metric_name) ? (
                      <span aria-hidden="true">
                        {metricIcon(selectedEvent.metric_name)}{" "}
                      </span>
                    ) : null}
                    {selectedEvent.label}
                  </span>
                  {selectedEvent.address && (
                    <span className={styles.popoverMeta}>
                      {selectedEvent.address}
                    </span>
                  )}
                  <span className={styles.popoverMeta}>
                    {formatEventTime(selectedEvent.ts)} ·{" "}
                    {metricDisplayName(selectedEvent.metric_name)}
                  </span>
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
    </div>
  );
}
