"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery } from "@tanstack/react-query";

import {
  getDbUserProfile,
  listInbox,
  type ComparisonType,
  type InboxItem,
} from "@/lib/apiClient";
import type { CityLeader } from "@/lib/apiClient";
import type { BoundarySketch } from "@/lib/publicApiClient";
import MiniScopeMap from "@/components/MiniScopeMap";
import { useFeedStories } from "@/lib/hooks/useFeed";
import { enrichStories, type EnrichedFeedStory } from "@/lib/feed/mockFeedData";
import { resolveCanonicalUrl } from "@/lib/feed/canonicalUrl";
import type { MoverMetricInput } from "@/lib/metrics/rankMetricMovers";
import MoversList from "@/components/MoversList";
import InboxCard from "@/components/InboxCard";
import InboxItemView from "@/components/InboxItemView";
import Loader from "@/components/Loader";
import styles from "./BriefingHome.module.css";

const STORIES_INITIAL_LIMIT = 3;
const EDITIONS_INITIAL_LIMIT = 5;

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
  /** Ward vs District wording for badges and leader subtitles. */
  geographicUnitLabel?: string;
  /** Open the official/place selector (hero title chevron). */
  onOpenScopeSelector?: () => void;
  /** When set, show the onboarding "your place is loading" banner with this label. */
  placeLoadingLabel?: string | null;
  onMetricClick?: (metricId: number) => void;
  /** "Browse all metrics" expand — the parent mounts the full table below. */
  browseAllExpanded: boolean;
  onToggleBrowseAll: () => void;
  /** Open the dashboard for a leader's scope (district N, or 0 for citywide). */
  onDistrictSelect?: (district: number) => void;
  /** Full metrics table, rendered inline right under the browse-all button.
   *  Parent owns the element (mount/visibility) so it isn't mounted twice. */
  fullDashboardSlot?: React.ReactNode;
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

function PlacePinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
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

/** Compact story row: headline + date, excerpt, and thumbnail when the story has an image. */
function StoryRowItem({
  story,
  isNew,
}: {
  story: EnrichedFeedStory;
  isNew: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const excerpt = storyExcerpt(story);
  const imageUrl = story.image_url_resolved || story.image_url || null;
  const showImage = !!imageUrl && !imgFailed;
  return (
    <li>
      <Link
        href={resolveCanonicalUrl(story)}
        className={styles.storyRow}
        prefetch={false}
      >
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
  onOpenScopeSelector,
  placeLoadingLabel,
  onMetricClick,
  browseAllExpanded,
  onToggleBrowseAll,
  onDistrictSelect,
  fullDashboardSlot,
}: BriefingHomeProps) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const [storiesExpanded, setStoriesExpanded] = useState(false);
  const [editionsExpanded, setEditionsExpanded] = useState(false);
  const [selectedEdition, setSelectedEdition] = useState<InboxItem | null>(null);

  // ── Recency anchor ────────────────────────────────────────────────────
  const { data: profile } = useQuery({
    queryKey: ["user-profile-recency"],
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
  const isPlaceScope = selectedPlaceId != null;
  const district = selectedDistrict ?? 0;
  const { data: storiesData, isLoading: storiesLoading } = useFeedStories(
    isPlaceScope
      ? {
          user_place_id: selectedPlaceId,
          limit: 25,
          order_by: "created_at",
          enabled: isAuthenticated,
        }
      : {
          city_id: cityId,
          district,
          limit: 25,
          order_by: "published_at",
          enabled: isAuthenticated,
        },
  );

  const stories = useMemo(() => {
    const raw = storiesData?.stories ?? [];
    return enrichStories(raw, undefined, undefined, { skipInterleave: true }).sort(
      (a, b) => storyTimestamp(b) - storyTimestamp(a),
    );
  }, [storiesData?.stories]);

  const newStoriesCount = useMemo(() => {
    if (anchorTime == null) return 0;
    return stories.filter((s) => storyTimestamp(s) > anchorTime).length;
  }, [stories, anchorTime]);

  const visibleStories = storiesExpanded
    ? stories.slice(0, 15)
    : stories.slice(0, STORIES_INITIAL_LIMIT);

  // ── Prior editions (inline inbox) ─────────────────────────────────────
  const {
    data: inboxData,
    refetch: refetchInbox,
  } = useQuery({
    queryKey: ["inbox-list"],
    queryFn: async () => {
      const token = await getAccessTokenSilently();
      return listInbox(token, { limit: 50 });
    },
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000,
  });

  const scopedEditions = useMemo(() => {
    const all = (inboxData?.items ?? []).filter((i) => i.city_id === cityId);
    let scoped: InboxItem[];
    if (isPlaceScope) {
      scoped = all.filter((i) => i.place_id === selectedPlaceId);
    } else if (district > 0) {
      scoped = all.filter(
        (i) => i.district != null && Number(i.district) === district,
      );
    } else {
      scoped = all;
    }
    // Fallback: an empty narrow scope still shows the city's editions.
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
    const mayor = leaders.find((l) => !l.district || l.district === 0);
    const rep =
      repDistrict > 0 ? leaders.find((l) => l.district === repDistrict) : null;
    const rows: CityLeader[] = [];
    if (rep) rows.push(rep);
    if (mayor) rows.push(mayor);
    return rows;
  }, [leaders, district, isPlaceScope, placeDistrict]);

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
    <span className={styles.heroDistrictBadge}>D{district}</span>
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

        {/* Full-width scope map — streets basemap + district/place overlay */}
        {(isPlaceScope
          ? placeLat != null && placeLng != null
          : sketch && sketch.districts.length > 0) && (
          <MiniScopeMap
            sketch={sketch}
            selectedDistrict={district}
            isPlaceScope={isPlaceScope}
            placeDistrict={placeDistrict}
            placeLat={placeLat}
            placeLng={placeLng}
            placeRadiusM={placeRadiusM}
            onClick={onOpenScopeSelector}
            className={styles.heroMapBanner}
          />
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

      {/* ── What moved (scorecard — sits just above Block Brief / stories) ─ */}
      <section className={styles.section} aria-label="What moved">
        <h3 className={styles.sectionTitle}>What moved</h3>
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
        <button
          type="button"
          className={styles.browseAllBtn}
          onClick={onToggleBrowseAll}
          aria-expanded={browseAllExpanded}
        >
          {browseAllExpanded ? "Hide full dashboard" : "Browse all metrics"}
        </button>
        {/* Full dashboard appears inline right under the button when expanded */}
        {fullDashboardSlot}
      </section>

      {/* ── New stories (Block Brief) ───────────────────────────────── */}
      <section className={styles.section} aria-label="New stories">
        <h3 className={styles.sectionTitle}>
          New stories
          {newStoriesCount > 0 && (
            <span className={styles.sectionBadge}>{newStoriesCount} new</span>
          )}
        </h3>
        {storiesLoading ? (
          <div className={styles.storiesLoading}>
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonRow} />
          </div>
        ) : visibleStories.length === 0 ? (
          <p className={styles.emptyText}>
            No stories for {scopeLabel} yet — new editions arrive weekly.
          </p>
        ) : (
          <ul className={styles.storyList}>
            {visibleStories.map((story) => (
              <StoryRowItem
                key={story.id}
                story={story}
                isNew={anchorTime != null && storyTimestamp(story) > anchorTime}
              />
            ))}
          </ul>
        )}
        {!storiesLoading && stories.length > STORIES_INITIAL_LIMIT && !storiesExpanded && (
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
    </div>
  );
}
