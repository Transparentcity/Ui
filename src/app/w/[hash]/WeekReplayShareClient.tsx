"use client";

import WeekReplayMap from "@/components/WeekReplayMap";
import type { BoundarySketch, PublicWeekReplay } from "@/lib/publicApiClient";
import type { WeekEventsResponse } from "@/lib/weekReplay";
import styles from "./styles.module.css";

type Props = {
  replay: PublicWeekReplay;
  sketch: BoundarySketch | null;
  isPlace: boolean;
  district: number;
};

function toPresetData(replay: PublicWeekReplay): WeekEventsResponse {
  return {
    status: replay.status,
    events: replay.events,
    key_events: replay.key_events,
    group_counts: replay.group_counts,
    total_before_cap: replay.total_before_cap,
    window: replay.window,
    scope: {
      city_id: replay.city_id,
      district: replay.scope_district,
      is_place: Boolean(replay.scope_place),
    },
  };
}

export default function WeekReplayShareClient({
  replay,
  sketch,
  isPlace,
  district,
}: Props) {
  const place = replay.scope_place;
  const scopeLabel = isPlace
    ? replay.city_name
    : district > 0
      ? `District ${district}`
      : replay.city_name;
  return (
    <WeekReplayMap
      cityId={replay.city_id}
      sketch={sketch}
      selectedDistrict={isPlace ? 0 : district}
      isPlaceScope={isPlace}
      placeLat={place?.lat ?? null}
      placeLng={place?.lng ?? null}
      placeRadiusM={place?.radius_m ?? null}
      selectedPlaceId={null}
      scopeLabel={scopeLabel}
      autoPlay
      presetData={toPresetData(replay)}
      shareTitle={replay.title}
      className={styles.player}
    />
  );
}
