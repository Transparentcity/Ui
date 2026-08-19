"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getDbUserProfile,
  listInbox,
  shareWeekReplay,
  type ComparisonType,
  type InboxItem,
} from "@/lib/apiClient";
import type { CityLeader } from "@/lib/apiClient";
import type { BoundarySketch } from "@/lib/publicApiClient";
import MiniScopeMap from "@/components/MiniScopeMap";
import WeekReplayMap from "@/components/WeekReplayMap";
import { weekReplayScopePhrase } from "@/lib/weekReplay";
import { emitOpenAddPlace, emitOpenEditPlace } from "@/lib/uiEvents";
import { getImpersonationCacheKey } from "@/lib/impersonation";
import { feedKeys, useFeedStories, type FeedStory } from "@/lib/hooks/useFeed";
import {
  appendImageTheme,
  enrichStories,
  type EnrichedFeedStory,
} from "@/lib/feed/mockFeedData";
import { resolveCanonicalUrl } from "@/lib/feed/canonicalUrl";
import { useTheme } from "@/contexts/ThemeContext";
import { pickCitywideLeader } from "@/lib/publicLeadersPick";
import FeedStoryModal from "@/components/feed/FeedStoryModal";
import type { MoverMetricInput } from "@/lib/metrics/rankMetricMovers";
import MoversList from "@/components/MoversList";
import InboxCard from "@/components/InboxCard";
import InboxItemView from "@/components/InboxItemView";
import Loader from "@/components/Loader";
import styles from "./BriefingHome.module.css";

const STORIES_INITIAL_LIMIT = 5;
const EDITIONS_INITIAL_LIMIT = 3;

interface BriefingHomeProps {
  cityId: number;
  /** Scope title for the hero card, e.g. "San Francisco", "District 2", "Bay St". */
  scopeLabel: string;
  /** Context line under the title, e.g. "San Francisco · Russian Hill · 300m". */
  scopeContext?: string | null;
  selectedDistrict: number | null;
  selectedPlaceId: number | null;
  /** District containing the selected place (resolved from shapefiles), so
   *  place-scope briefings can show the district rep in Accountable here. */
  placeDistrict?: number | null;
  /** Simplified district boundary rings for the mini-map. */
  sketch?: BoundarySketch | null;
  /** Saved place lat for the mini-map circle. */
  placeLat?: number | null;
  /** Saved place lng for the mini-map circle. */
  placeLng?: number | null;
  /** Saved place radius in metres for the mini-map circle. */
  placeRadiusM?: number | null;
  metrics: MoverMetricInput[];
  /** Comparisons for the current scope keyed by metric id (batch response shape). */
  comparisonsMap: Record<number, Partial<Record<ComparisonType, import("@/lib/apiClient").ComparisonResponse>> | undefined>;
  comparisonsLoading: boolean;
  comparisonType: ComparisonType;
  onComparisonTypeChange: (type: ComparisonType) => void;
  leaders: CityLeader[];
  isFollowing?: boolean;
  followPending?: boolean;
  /** Toggle follow for the current scope (hero chip). */
  onFollowToggle?: () => void;
  /** City emoji/favicon shown in the hero when at citywide scope. */
  cityEmoji?: string | null;
  /** Ward vs District vs Neighborhood wording for badges and leader subtitles. */
  geographicUnitLabel?: string;
  /** At-large council cities navigate by neighborhood instead of district rep. */
  neighborhoodNavMode?: boolean;
  /** Open the official/place selector (hero title chevron). */
  onOpenScopeSelector?: () => void;
  /** Open the selector from the personalize nudge: the next district the user
   *  picks is followed for them (with a toast). */
  onOpenScopeSelectorToFollow?: () => void;
  /** True while the selected place's metrics job is still running. */
  placeJobRunning?: boolean;
  /** When set, show the onboarding "your place is loading" banner with this label. */
  placeLoadingLabel?: string | null;
  onMetricClick?: (metricId: number) => void;
  /** User's saved places (id + label) so place-scoped story rows can name the place. */
  userPlaces?: { id: number; label: string }[];
  /** Whether the section shows the full ordered metrics table vs movers. */
  browseAllExpanded: boolean;
  onBrowseAllChange: (expanded: boolean) => void;
  /** Open the dashboard for a leader's scope (district N, or 0 for citywide). */
  onDistrictSelect?: (district: number) => void;
  /** Full metrics table, shown when "All metrics" is selected in the header.
   *  Parent owns the element (mount/visibility) so it isn't mounted twice. */
  fullDashboardSlot?: React.ReactNode;
  /** Global platform admin. Week Replay is feature-flagged to admins only
   *  while it's still being validated (data-correctness and perf fixes are
   *  recent) — everyone else keeps the static MiniScopeMap hero. */
  isAdmin?: boolean;
}

function storyTimestamp(story: EnrichedFeedStory): number {
  const raw = story.published_at ?? story.story_date ?? story.created_at;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function storyExcerpt(story: EnrichedFeedStory): string {
  const raw =
    story.cleaned_description || story.summary || story.description || "";
  return raw.replace(/\s+/g, " ").trim();
}

function leaderInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function PlacePinIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/** Which geographic actor a story belongs to: city, district, or saved place. */
type StoryActorScope = "city" | "district" | "place";

function storyActorScope(story: EnrichedFeedStory): StoryActorScope {
  if (story.user_place_id != null) return "place";
  const rawPlaceIds = (story.metadata ?? {}).user_place_ids;
  if (Array.isArray(rawPlaceIds) && rawPlaceIds.length > 0) return "place";
  if ((story.district ?? 0) > 0) return "district";
  return "city";
}

/** Small circular avatar attributing the story to the city, a district, or a place. */
function StoryActorBadge({
  story,
  cityEmoji,
  geographicUnitLabel,
  placeLabelById,
}: {
  story: EnrichedFeedStory;
  cityEmoji?: string | null;
  geographicUnitLabel: string;
  placeLabelById?: Map<number, string>;
}) {
  const scope = storyActorScope(story);
  let avatar: React.ReactNode;
  let label: string;
  if (scope === "place") {
    avatar = <PlacePinIcon size={12} />;
    const placeLabel =
      story.user_place_id != null
        ? placeLabelById?.get(story.user_place_id)
        : undefined;
    label = placeLabel?.trim() || "My place";
  } else if (scope === "district") {
    avatar = (
      <span className={styles.storyActorDistrict}>D{story.district}</span>
    );
    label = `${geographicUnitLabel} ${story.district}`;
  } else {
    avatar = <span className={styles.storyActorEmoji}>{cityEmoji || "🏛️"}</span>;
    label = story.city_name?.trim() || "Citywide";
  }
  return (
    <span className={styles.storyActor}>
      <span className={styles.storyActorAvatar} aria-hidden="true">
        {avatar}
      </span>
      <span className={styles.storyActorName}>{label}</span>
    </span>
  );
}

/** Compact story row: actor badge, headline + date, excerpt, and thumbnail when the story has an image. */
function StoryRowItem({
  story,
  isNew,
  onOpen,
  cityEmoji,
  geographicUnitLabel,
  placeLabelById,
}: {
  story: EnrichedFeedStory;
  isNew: boolean;
  onOpen: (story: EnrichedFeedStory) => void;
  cityEmoji?: string | null;
  geographicUnitLabel: string;
  placeLabelById?: Map<number, string>;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const { theme } = useTheme();
  const excerpt = storyExcerpt(story);
  const imageUrl = appendImageTheme(
    story.image_url_resolved || story.image_url || null,
    theme,
  );
  const showImage = !!imageUrl && !imgFailed;
  return (
    <li>
      <Link
        href={resolveCanonicalUrl(story)}
        className={styles.storyRow}
        prefetch={false}
        onClick={(e) => {
          // Plain clicks open the story modal; modified clicks (cmd/ctrl/
          // middle-click) keep normal link behavior for a new tab.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          onOpen(story);
        }}
      >
        <StoryActorBadge
          story={story}
          cityEmoji={cityEmoji}
          geographicUnitLabel={geographicUnitLabel}
          placeLabelById={placeLabelById}
        />
        <span className={styles.storyTitleRow}>
          <span className={styles.storyHeadline}>
            {isNew && <span className={styles.storyNewDot} aria-label="New" />}
            {story.headline}
          </span>
          <span className={styles.storyDate}>
            {formatShortDate(story.published_at ?? story.story_date)}
          </span>
        </span>
        {excerpt && <span className={styles.storyExcerpt}>{excerpt}</span>}
        {showImage && (
          // eslint-disable-next-line @next/next/no-img-element -- feed images are proxied, sizes vary
          <img
            className={styles.storyImage}
            src={imageUrl}
            alt={story.image_alt_resolved || story.image_alt || ""}
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        )}
      </Link>
    </li>
  );
}

/** Transparent City corner braces framing the hero scope icon (BRAND_KIT logomark). */
function HeroBraces({ children }: { children: React.ReactNode }) {
  const uid = useId().replace(/:/g, "");
  const maskBl = `briefing-brace-bl-${uid}`;
  const maskTr = `briefing-brace-tr-${uid}`;
  return (
    <span className={styles.heroBraces}>
      <svg
        className={styles.heroBracesSvg}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: "visible" }}
        aria-hidden="true"
      >
        <defs>
          <mask
            id={maskBl}
            x="-400"
            y="-400"
            width="1200"
            height="1200"
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
          >
            <rect x="-400" y="-400" width="1200" height="1200" fill="white" />
            <rect x="8.333" y="8.333" width="83.333" height="83.333" rx="3" ry="3" fill="black" />
            <rect
              x="16.666"
              y="-33.333"
              width="66.666"
              height="166.666"
              fill="black"
              transform="rotate(-45 50 50)"
            />
            <rect
              x="50"
              y="-400"
              width="1200"
              height="1200"
              fill="black"
              transform="rotate(-45 50 50)"
            />
          </mask>
          <mask
            id={maskTr}
            x="-400"
            y="-400"
            width="1200"
            height="1200"
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
          >
            <rect x="-400" y="-400" width="1200" height="1200" fill="white" />
            <rect x="8.333" y="8.333" width="83.333" height="83.333" rx="3" ry="3" fill="black" />
            <rect
              x="16.666"
              y="-33.333"
              width="66.666"
              height="166.666"
              fill="black"
              transform="rotate(-45 50 50)"
            />
            <rect
              x="-1150"
              y="-400"
              width="1200"
              height="1200"
              fill="black"
              transform="rotate(-45 50 50)"
            />
          </mask>
        </defs>
        <rect className={styles.heroBrace} x="0" y="0" width="100" height="100" rx="3" ry="3" mask={`url(#${maskBl})`} />
        <rect className={styles.heroBrace} x="0" y="0" width="100" height="100" rx="3" ry="3" mask={`url(#${maskTr})`} />
      </svg>
      <span className={styles.heroBracesContent}>{children}</span>
    </span>
  );
}

/**
 * Unified briefing home — the default landing for every scope (city,
 * district, saved place). The hero card is the page header: it names the
 * scope and opens the official/place selector. Organized around the weekly
 * email: accountable officials, what changed since your last briefing
 * (movers, then stories), then the archive of prior editions.
 */
export default function BriefingHome({
  cityId,
  scopeLabel,
  scopeContext,
  selectedDistrict,
  selectedPlaceId,
  placeDistrict = null,
  sketch = null,
  placeLat = null,
  placeLng = null,
  placeRadiusM = null,
  metrics,
  comparisonsMap,
  comparisonsLoading,
  comparisonType,
  onComparisonTypeChange,
  leaders,
  isFollowing = false,
  followPending = false,
  onFollowToggle,
  cityEmoji,
  geographicUnitLabel = "District",
  neighborhoodNavMode = false,
  onOpenScopeSelector,
  onOpenScopeSelectorToFollow,
  placeJobRunning = false,
  placeLoadingLabel,
  onMetricClick,
  userPlaces,
  browseAllExpanded,
  onBrowseAllChange,
  onDistrictSelect,
  fullDashboardSlot,
  isAdmin = false,
}: BriefingHomeProps) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const queryClient = useQueryClient();
  const [storiesExpanded, setStoriesExpanded] = useState(false);
  const [editionsExpanded, setEditionsExpanded] = useState(false);
  const [selectedEdition, setSelectedEdition] = useState<InboxItem | null>(null);
  const [detailStoryId, setDetailStoryId] = useState<number | null>(null);

  /** Prime the detail cache from list data so the modal renders immediately. */
  const openStoryDetail = useCallback(
    (s: EnrichedFeedStory) => {
      queryClient.setQueryData(feedKeys.detail(s.id), {
        story: s as FeedStory,
      });
      setDetailStoryId(s.id);
    },
    [queryClient],
  );

  // ── Recency anchor ────────────────────────────────────────────────────
  const { data: profile } = useQuery({
    queryKey: ["user-profile-recency", getImpersonationCacheKey()],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return getDbUserProfile(token);
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
  const recencyAnchor = profile?.recency_anchor_at ?? null;
  const anchorTime = useMemo(() => {
    if (!recencyAnchor) return null;
    const t = new Date(recencyAnchor).getTime();
    return Number.isFinite(t) ? t : null;
  }, [recencyAnchor]);

  // ── Stories (scoped) ──────────────────────────────────────────────────
  // Citywide: every story in the city (citywide + district + the viewer's own
  // place stories — place privacy is enforced server-side), with a scope
  // filter above the list. District: that district's stories only. Place:
  // only stories tagged to the selected place.
  const isPlaceScope = selectedPlaceId != null;
  const district = selectedDistrict ?? 0;
  const isCitywideScope = !isPlaceScope && district === 0;

  // ?replay=1 (newsletter hero deep link) auto-plays the Week Replay once
  // events load. Read once on mount; client component, so window is safe here.
  const [replayAutoPlay] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("replay") === "1",
  );

  const getWeekReplayShareUrl = useCallback(async (): Promise<string | null> => {
    if (isPlaceScope) {
      const ok = window.confirm(
        "Sharing creates a public link that shows this week's events near your place (exact address is not shown). Continue?",
      );
      if (!ok) return null;
    }
    const token = await getAccessTokenSilently();
    const res = await shareWeekReplay(token, {
      cityId,
      district: isPlaceScope ? null : district,
      placeId: isPlaceScope ? selectedPlaceId : null,
    });
    return res.url_path;
  }, [
    cityId,
    district,
    getAccessTokenSilently,
    isPlaceScope,
    selectedPlaceId,
  ]);

  const weekReplayShareTitle = useMemo(
    () => `My week ${weekReplayScopePhrase(scopeLabel, isPlaceScope)}`,
    [scopeLabel, isPlaceScope],
  );

  const { data: storiesData, isLoading: storiesLoading } = useFeedStories(
    isPlaceScope
      ? {
          user_place_id: selectedPlaceId,
          limit: 25,
          order_by: "created_at",
          enabled: isAuthenticated,
        }
      : district > 0
        ? {
            city_id: cityId,
            district,
            limit: 25,
            order_by: "published_at",
            enabled: isAuthenticated,
          }
        : {
            city_id: cityId,
            limit: 25,
            order_by: "published_at",
            enabled: isAuthenticated,
          },
  );

  // On district/place overviews, also fetch the citywide feed so the header
  // tabs can surface the remainder of the city's stories (citywide + other
  // districts) without leaving the current scope.
  const { data: cityStoriesData, isLoading: cityStoriesLoading } =
    useFeedStories({
      city_id: cityId,
      limit: 25,
      order_by: "published_at",
      enabled: isAuthenticated && !isCitywideScope,
    });

  const placeLabelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of userPlaces ?? []) map.set(p.id, p.label);
    return map;
  }, [userPlaces]);

  const stories = useMemo(() => {
    const raw = storiesData?.stories ?? [];
    return enrichStories(raw, undefined, undefined, { skipInterleave: true }).sort(
      (a, b) => storyTimestamp(b) - storyTimestamp(a),
    );
  }, [storiesData?.stories]);

  const cityStories = useMemo(() => {
    const raw = cityStoriesData?.stories ?? [];
    return enrichStories(raw, undefined, undefined, { skipInterleave: true }).sort(
      (a, b) => storyTimestamp(b) - storyTimestamp(a),
    );
  }, [cityStoriesData?.stories]);

  // New stories across every scope visible from this overview (current scope
  // plus, on district/place overviews, the rest of the city's feed).
  const newStories = useMemo(() => {
    if (anchorTime == null) return [];
    const seen = new Set<number>();
    return [...stories, ...(isCitywideScope ? [] : cityStories)]
      .filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return storyTimestamp(s) > anchorTime;
      })
      .sort((a, b) => storyTimestamp(b) - storyTimestamp(a));
  }, [stories, cityStories, isCitywideScope, anchorTime]);
  const newStoriesCount = newStories.length;

  // ── "N new" badge doubles as a filter — on by default ─────────────────
  const [newOnlyFilter, setNewOnlyFilter] = useState(true);
  useEffect(() => {
    setNewOnlyFilter(true);
  }, [cityId, district, isPlaceScope, selectedPlaceId]);
  const newFilterActive = newOnlyFilter && newStoriesCount > 0;

  // ── Story scope filter (citywide overview only) ───────────────────────
  const [storyScopeFilter, setStoryScopeFilter] = useState<
    "all" | StoryActorScope
  >("all");
  useEffect(() => {
    setStoryScopeFilter("all");
  }, [cityId, district, isPlaceScope]);

  const storyScopeCounts = useMemo(() => {
    const counts: Record<StoryActorScope, number> = {
      city: 0,
      district: 0,
      place: 0,
    };
    for (const s of stories) counts[storyActorScope(s)] += 1;
    return counts;
  }, [stories]);

  // ── Story scope tabs (district / place overviews) ─────────────────────
  // The current scope is the selected tab; the remainder of the city's
  // stories (citywide + the other districts + the viewer's saved places)
  // sit behind greyed-out tabs.
  const [storyScopeTab, setStoryScopeTab] = useState<
    "current" | "city" | "district" | "place"
  >("current");
  useEffect(() => {
    setStoryScopeTab("current");
  }, [cityId, district, isPlaceScope, selectedPlaceId]);

  const remainderCityStories = useMemo(
    () => cityStories.filter((s) => storyActorScope(s) === "city"),
    [cityStories],
  );
  const remainderDistrictStories = useMemo(
    () =>
      cityStories.filter(
        (s) =>
          storyActorScope(s) === "district" &&
          (isPlaceScope || (s.district ?? 0) !== district),
      ),
    [cityStories, isPlaceScope, district],
  );
  const remainderPlaceStories = useMemo(
    () =>
      cityStories.filter((s) => {
        if (storyActorScope(s) !== "place") return false;
        if (!isPlaceScope || selectedPlaceId == null) return true;
        // On a place overview, the current place's stories live in the
        // "current" tab — only other saved places belong here.
        if (s.user_place_id === selectedPlaceId) return false;
        const ids = (s.metadata ?? {}).user_place_ids;
        return !(Array.isArray(ids) && ids.includes(selectedPlaceId));
      }),
    [cityStories, isPlaceScope, selectedPlaceId],
  );

  const filteredStories = useMemo(() => {
    if (newFilterActive) return newStories;
    if (isCitywideScope) {
      if (storyScopeFilter === "all") return stories;
      return stories.filter((s) => storyActorScope(s) === storyScopeFilter);
    }
    if (storyScopeTab === "city") return remainderCityStories;
    if (storyScopeTab === "district") return remainderDistrictStories;
    if (storyScopeTab === "place") return remainderPlaceStories;
    return stories;
  }, [
    stories,
    newStories,
    newFilterActive,
    isCitywideScope,
    storyScopeFilter,
    storyScopeTab,
    remainderCityStories,
    remainderDistrictStories,
    remainderPlaceStories,
  ]);

  const activeStoriesLoading =
    !isCitywideScope && (newFilterActive || storyScopeTab !== "current")
      ? storiesLoading || cityStoriesLoading
      : storiesLoading;

  const visibleStories = storiesExpanded
    ? filteredStories.slice(0, 15)
    : filteredStories.slice(0, STORIES_INITIAL_LIMIT);

  // ── Prior editions (inline inbox) ─────────────────────────────────────
  const {
    data: inboxData,
    refetch: refetchInbox,
  } = useQuery({
    queryKey: ["inbox-list", getImpersonationCacheKey()],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return listInbox(token, { limit: 50 });
    },
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000,
  });

  const scopedEditions = useMemo(() => {
    const all = (inboxData?.items ?? []).filter((i) => i.city_id === cityId);
    if (isPlaceScope) {
      // Place editions are user-specific; never fall back to the city's editions,
      // otherwise an empty place scope would surface unrelated (e.g. other users')
      // newsletters. Show only editions actually tied to this place.
      return all.filter((i) => i.place_id === selectedPlaceId);
    }
    let scoped: InboxItem[];
    if (district > 0) {
      scoped = all.filter(
        (i) => i.district != null && Number(i.district) === district,
      );
    } else {
      scoped = all;
    }
    // Fallback: an empty narrow (district) scope still shows the city's editions.
    return scoped.length > 0 ? scoped : all;
  }, [inboxData?.items, cityId, isPlaceScope, selectedPlaceId, district]);

  const visibleEditions = editionsExpanded
    ? scopedEditions
    : scopedEditions.slice(0, EDITIONS_INITIAL_LIMIT);

  // ── Leaders for this scope ────────────────────────────────────────────
  // Place → mayor + the place's district rep; district → mayor + that rep;
  // citywide → none (the citywide briefing IS the mayor's view).
  const accountableLeaders = useMemo(() => {
    const repDistrict = isPlaceScope ? placeDistrict ?? 0 : district;
    if (!isPlaceScope && repDistrict === 0) return [];
    if (!isPlaceScope && neighborhoodNavMode && repDistrict > 0) {
      const mayor = pickCitywideLeader(leaders);
      return mayor ? [mayor] : [];
    }
    const mayor = pickCitywideLeader(leaders);
    const rep =
      repDistrict > 0 ? leaders.find((l) => l.district === repDistrict) : null;
    const rows: CityLeader[] = [];
    if (rep) rows.push(rep);
    if (mayor) rows.push(mayor);
    return rows;
  }, [leaders, district, isPlaceScope, placeDistrict, neighborhoodNavMode]);

  // ── Recency date (only shown inside the "N new" chip) ────────────────
  const recencyDateLabel = useMemo(() => {
    if (!recencyAnchor) return null;
    return new Date(recencyAnchor).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }, [recencyAnchor]);

  // Edition detail replaces the briefing content (with a back button).
  if (selectedEdition) {
    return (
      <div className={styles.container}>
        <InboxItemView
          id={selectedEdition.id}
          cachedItem={selectedEdition}
          onBack={() => {
            setSelectedEdition(null);
            void refetchInbox();
          }}
        />
      </div>
    );
  }

  const heroIcon = isPlaceScope ? (
    <PlacePinIcon />
  ) : district > 0 ? (
    neighborhoodNavMode ? (
      <PlacePinIcon />
    ) : (
      <span className={styles.heroDistrictBadge}>D{district}</span>
    )
  ) : (
    <span className={styles.heroEmoji}>{cityEmoji || "🏛️"}</span>
  );

  return (
    <div className={styles.container}>
      {/* ── Hero: page header + scope selector trigger ───────────────── */}
      <section className={styles.hero}>
        <button
          type="button"
          className={styles.heroScopeButton}
          onClick={onOpenScopeSelector}
          aria-label="Change city, district, or place"
        >
          <HeroBraces>{heroIcon}</HeroBraces>
          <span className={styles.heroTitles}>
            <span className={styles.heroTitleRow}>
              <span className={styles.heroTitle}>{scopeLabel}</span>
              <svg
                className={styles.heroChevron}
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
            {scopeContext ? (
              <span className={styles.heroContext}>{scopeContext}</span>
            ) : null}
          </span>
        </button>

        {isPlaceScope && selectedPlaceId != null && (
          <button
            type="button"
            className={styles.heroEditButton}
            onClick={() => emitOpenEditPlace(selectedPlaceId)}
            aria-label="Edit this place"
            title="Edit place"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        )}

        {/* Full-width scope map. Place scope gets the Week Replay animation
            (play button → 7-day time-lapse); city/district scopes keep the
            lightweight static scope map — no week-events fan-out — unless a
            ?replay=1 deep link explicitly asks for the replay. Feature-flagged
            to admins only for now — everyone else always gets MiniScopeMap.
            Show a shimmer skeleton immediately while sketch is loading so
            the map slot is visible right away rather than suddenly popping in. */}
        {isPlaceScope ? (
          /* Place scope: render as soon as we have coordinates */
          (placeLat != null && placeLng != null) && (
            isAdmin && (isPlaceScope || replayAutoPlay) ? (
              <WeekReplayMap
                cityId={cityId}
                sketch={sketch}
                selectedDistrict={district}
                isPlaceScope={isPlaceScope}
                placeDistrict={placeDistrict}
                placeLat={placeLat}
                placeLng={placeLng}
                placeRadiusM={placeRadiusM}
                selectedPlaceId={selectedPlaceId}
                placeName={isPlaceScope ? scopeLabel : null}
                scopeLabel={scopeLabel}
                onOpenScopeSelector={onOpenScopeSelector}
                onEventMetricClick={onMetricClick}
                autoPlay={replayAutoPlay}
                getShareUrl={getWeekReplayShareUrl}
                shareTitle={weekReplayShareTitle}
                className={styles.heroMapBanner}
              />
            ) : (
              <MiniScopeMap
                sketch={sketch}
                selectedDistrict={district}
                isPlaceScope
                placeDistrict={placeDistrict}
                placeLat={placeLat}
                placeLng={placeLng}
                placeRadiusM={placeRadiusM}
                onClick={onOpenScopeSelector}
                className={styles.heroMapBanner}
              />
            )
          )
        ) : (
          /* City / district scope: show skeleton immediately, swap in real map once sketch arrives */
          sketch && sketch.districts.length > 0 ? (
            isAdmin && replayAutoPlay ? (
              <WeekReplayMap
                cityId={cityId}
                sketch={sketch}
                selectedDistrict={district}
                isPlaceScope={false}
                placeDistrict={placeDistrict}
                placeLat={placeLat}
                placeLng={placeLng}
                placeRadiusM={placeRadiusM}
                selectedPlaceId={selectedPlaceId}
                placeName={null}
                scopeLabel={scopeLabel}
                onOpenScopeSelector={onOpenScopeSelector}
                onEventMetricClick={onMetricClick}
                autoPlay={replayAutoPlay}
                getShareUrl={getWeekReplayShareUrl}
                shareTitle={weekReplayShareTitle}
                className={styles.heroMapBanner}
              />
            ) : (
              <MiniScopeMap
                sketch={sketch}
                selectedDistrict={district}
                isPlaceScope={false}
                placeDistrict={placeDistrict}
                placeLat={placeLat}
                placeLng={placeLng}
                placeRadiusM={placeRadiusM}
                onClick={onOpenScopeSelector}
                className={styles.heroMapBanner}
              />
            )
          ) : (
            /* Skeleton: shows immediately while boundary-sketch is fetching */
            <div className={styles.skeletonMapBanner} aria-hidden="true" />
          )
        )}

        <div className={styles.heroChips}>
          {newStoriesCount > 0 && (
            <span className={`${styles.heroChip} ${styles.heroChipNew}`}>
              {newStoriesCount} new{recencyDateLabel ? ` since ${recencyDateLabel}` : ""}
            </span>
          )}
          {onFollowToggle ? (
            <button
              type="button"
              className={`${styles.heroChip} ${styles.heroChipFollow}${isFollowing ? ` ${styles.heroChipFollowing}` : ""}`}
              onClick={onFollowToggle}
              disabled={followPending}
            >
              {isFollowing ? "Following" : "Follow"}
            </button>
          ) : (
            isFollowing && <span className={styles.heroChip}>Following</span>
          )}
        </div>

        {/* ── Accountable here — integrated into hero ──────────────── */}
        {/* Show section for district or place scope; skeleton while leaders load */}
        {(accountableLeaders.length > 0 || ((isPlaceScope || district > 0) && leaders.length === 0)) && (
          <div className={styles.heroAccountable} aria-label="Accountable here">
            <span className={styles.heroAccountableLabel}>Accountable here</span>
            {accountableLeaders.length > 0 ? (
              <ul className={styles.heroAccountableList}>
                {accountableLeaders.map((leader) => {
                  const d = leader.district ?? 0;
                  const subtitle =
                    d > 0
                      ? `${leader.title || "Representative"} · ${geographicUnitLabel} ${d}`
                      : leader.title || "Mayor";
                  const targetScope = d > 0 ? d : 0;
                  const alreadyThere =
                    !isPlaceScope && (selectedDistrict ?? 0) === targetScope;
                  const clickable = !!onDistrictSelect && !alreadyThere;
                  return (
                    <li key={`${leader.name}-${d}`}>
                      <button
                        type="button"
                        className={`${styles.heroAccountableRow}${clickable ? "" : ` ${styles.heroAccountableRowStatic}`}`}
                        onClick={clickable ? () => onDistrictSelect?.(targetScope) : undefined}
                        disabled={!clickable}
                      >
                        <span className={styles.heroAccountableAvatar} aria-hidden="true">
                          {leaderInitials(leader.name)}
                        </span>
                        <span className={styles.heroAccountableName}>{leader.name}</span>
                        <span className={styles.heroAccountableTitle}>{subtitle}</span>
                        {clickable && (
                          <span className={styles.heroAccountableChevron} aria-hidden="true">›</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className={styles.heroAccountableSkeleton} aria-hidden="true" />
            )}
          </div>
        )}
      </section>

      {/* ── Personalize nudge: city/district members without a saved place ── */}
      {isAuthenticated &&
      !isPlaceScope &&
      !placeLoadingLabel &&
      (userPlaces?.length ?? 0) === 0 ? (
        <div className={styles.personalizeBanner} role="note">
          <span className={styles.personalizeIcon} aria-hidden="true">
            <PlacePinIcon size={16} />
          </span>
          <p className={styles.personalizeText}>
            {district > 0 ? (
              "Add a place near you to personalize your data for your block."
            ) : (
              <>
                Make this page yours —{" "}
                {(onOpenScopeSelectorToFollow ?? onOpenScopeSelector) ? (
                  <button
                    type="button"
                    className={styles.personalizeInlineLink}
                    onClick={onOpenScopeSelectorToFollow ?? onOpenScopeSelector}
                  >
                    pick your {geographicUnitLabel.toLowerCase()}
                  </button>
                ) : (
                  <>pick your {geographicUnitLabel.toLowerCase()}</>
                )}{" "}
                or add a place near you to personalize your data.
              </>
            )}
          </p>
          <button
            type="button"
            className={styles.personalizeAction}
            onClick={emitOpenAddPlace}
          >
            Add a place
          </button>
        </div>
      ) : null}

      {/* ── Place-loading banner (onboarding) ───────────────────────── */}
      {placeLoadingLabel ? (
        <div className={styles.placeLoadingBanner} role="status" aria-live="polite">
          <Loader size="sm" color="purple" />
          <p className={styles.placeLoadingText}>
            Your local place is loading — showing citywide updates while we
            pull data for <strong>{placeLoadingLabel}</strong>.
          </p>
        </div>
      ) : null}

      {/* ── What moved / All metrics (header toggle switches the view) ─ */}
      <section
        className={styles.section}
        aria-label={browseAllExpanded ? "All metrics" : "What moved"}
      >
        <div
          className={styles.metricsViewToggle}
          role="radiogroup"
          aria-label="Metrics view"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!browseAllExpanded}
            className={`${styles.metricsViewTab}${!browseAllExpanded ? ` ${styles.metricsViewTabActive}` : ""}`}
            onClick={() => onBrowseAllChange(false)}
          >
            What moved
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={browseAllExpanded}
            className={`${styles.metricsViewTab}${browseAllExpanded ? ` ${styles.metricsViewTabActive}` : ""}`}
            onClick={() => onBrowseAllChange(true)}
          >
            All metrics
          </button>
        </div>
        {!browseAllExpanded ? (
          isPlaceScope && placeJobRunning ? (
            <div className={styles.calculatingRow} role="status" aria-live="polite">
              <Loader size="sm" color="purple" />
              <p className={styles.calculatingText}>
                Calculating your biggest movers — pulling public data for{" "}
                <strong>{scopeLabel}</strong>. This can take a few minutes for a
                new place.
              </p>
            </div>
          ) : (
            <MoversList
              metrics={metrics}
              comparisonsMap={comparisonsMap}
              comparisonType={comparisonType}
              onComparisonTypeChange={onComparisonTypeChange}
              recencyAnchor={recencyAnchor}
              loading={comparisonsLoading}
              scopeLabel={scopeLabel}
              onMetricClick={onMetricClick}
            />
          )
        ) : null}
        {fullDashboardSlot}
      </section>

      {/* ── New stories (Block Brief) ───────────────────────────────── */}
      <section className={styles.section} aria-label="New stories">
        <h3 className={styles.sectionTitle}>
          New stories
          {newStoriesCount > 0 && (
            <button
              type="button"
              className={`${styles.sectionBadge} ${styles.sectionBadgeButton}${newFilterActive ? "" : ` ${styles.sectionBadgeInactive}`}`}
              aria-pressed={newFilterActive}
              title={
                newFilterActive
                  ? "Showing new stories only — click to show all"
                  : "Show new stories only"
              }
              onClick={() => {
                setNewOnlyFilter((v) => !v);
                setStoriesExpanded(false);
              }}
            >
              {newStoriesCount} new
            </button>
          )}
        </h3>
        {/* Scope tabs — district/place overviews: current scope selected,
            the remainder of the city's stories behind greyed-out tabs. */}
        {!isCitywideScope && (
          <div
            className={styles.storyFilterRow}
            role="radiogroup"
            aria-label="Story scope"
          >
            {(
              [
                {
                  key: "current" as const,
                  label: scopeLabel,
                  count: stories.length,
                },
                {
                  key: "city" as const,
                  label: "Citywide",
                  count: remainderCityStories.length,
                },
                {
                  key: "district" as const,
                  label: isPlaceScope
                    ? `${geographicUnitLabel}s`
                    : `Other ${geographicUnitLabel.toLowerCase()}s`,
                  count: remainderDistrictStories.length,
                },
                {
                  key: "place" as const,
                  label: isPlaceScope ? "My other places" : "My places",
                  count: remainderPlaceStories.length,
                },
              ]
            )
              // Saved-place tab is personal — only offer it when the viewer
              // actually has place stories elsewhere in the city.
              .filter((tab) => tab.key !== "place" || tab.count > 0)
              .map((tab) => {
              const active = !newFilterActive && storyScopeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`${styles.storyFilterChip}${active ? ` ${styles.storyFilterChipActive}` : ` ${styles.storyFilterChipMuted}`}`}
                  onClick={() => {
                    setNewOnlyFilter(false);
                    setStoryScopeTab(tab.key);
                    setStoriesExpanded(false);
                  }}
                >
                  {tab.label}
                  {(tab.key === "current" || !cityStoriesLoading) && (
                    <span className={styles.storyFilterCount}>{tab.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {/* Scope filter — citywide overview only; district/place feeds are
            already scoped to a single actor. */}
        {isCitywideScope && !storiesLoading && stories.length > 0 && (
          <div
            className={styles.storyFilterRow}
            role="radiogroup"
            aria-label="Filter stories by scope"
          >
            {(
              [
                { key: "all", label: "All", count: stories.length },
                { key: "city", label: "Citywide", count: storyScopeCounts.city },
                {
                  key: "district",
                  label: `${geographicUnitLabel}s`,
                  count: storyScopeCounts.district,
                },
                { key: "place", label: "My places", count: storyScopeCounts.place },
              ] as const
            )
              .filter((f) => f.key === "all" || f.count > 0)
              .map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="radio"
                  aria-checked={!newFilterActive && storyScopeFilter === f.key}
                  className={`${styles.storyFilterChip}${!newFilterActive && storyScopeFilter === f.key ? ` ${styles.storyFilterChipActive}` : ""}`}
                  onClick={() => {
                    setNewOnlyFilter(false);
                    setStoryScopeFilter(f.key);
                  }}
                >
                  {f.label}
                  <span className={styles.storyFilterCount}>{f.count}</span>
                </button>
              ))}
          </div>
        )}
        {activeStoriesLoading ? (
          <div className={styles.storiesLoading}>
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonRow} />
          </div>
        ) : visibleStories.length === 0 ? (
          <p className={styles.emptyText}>
            No stories for{" "}
            {!isCitywideScope && storyScopeTab === "city"
              ? "the rest of the city"
              : !isCitywideScope && storyScopeTab === "district"
                ? `other ${geographicUnitLabel.toLowerCase()}s`
                : !isCitywideScope && storyScopeTab === "place"
                  ? "your places"
                  : scopeLabel}{" "}
            yet — new editions arrive weekly.
          </p>
        ) : (
          <ul className={styles.storyList}>
            {visibleStories.map((story) => (
              <StoryRowItem
                key={story.id}
                story={story}
                isNew={anchorTime != null && storyTimestamp(story) > anchorTime}
                onOpen={openStoryDetail}
                cityEmoji={cityEmoji}
                geographicUnitLabel={geographicUnitLabel}
                placeLabelById={placeLabelById}
              />
            ))}
          </ul>
        )}
        {!activeStoriesLoading && filteredStories.length > STORIES_INITIAL_LIMIT && !storiesExpanded && (
          <button
            type="button"
            className={styles.showMoreBtn}
            onClick={() => setStoriesExpanded(true)}
          >
            More stories
          </button>
        )}
      </section>

      {/* ── Prior newsletters ───────────────────────────────────────── */}
      <section className={styles.section} aria-label="Prior newsletters">
        <h3 className={styles.sectionLabelCaps}>
          Prior newsletters
          {(inboxData?.unread_count ?? 0) > 0 && (
            <span className={styles.unreadDot} aria-label="Unread newsletters" />
          )}
        </h3>
        {visibleEditions.length === 0 ? (
          <p className={styles.emptyText}>
            No prior newsletters yet — your first edition arrives Sunday.
          </p>
        ) : (
          <div className={styles.editionList}>
            {visibleEditions.map((item) => (
              <InboxCard
                key={item.id}
                item={item}
                onClick={() => setSelectedEdition(item)}
              />
            ))}
          </div>
        )}
        {scopedEditions.length > EDITIONS_INITIAL_LIMIT && !editionsExpanded && (
          <button
            type="button"
            className={styles.showMoreBtn}
            onClick={() => setEditionsExpanded(true)}
          >
            Show all newsletters ({scopedEditions.length})
          </button>
        )}
      </section>

      <FeedStoryModal
        storyId={detailStoryId}
        open={detailStoryId != null}
        onOpenChange={(next) => {
          if (!next) setDetailStoryId(null);
        }}
        onSelectRelatedStory={(id) => setDetailStoryId(id)}
      />
    </div>
  );
}
