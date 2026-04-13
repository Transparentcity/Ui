"use client";

import FeedContainer from "./FeedContainer";

interface UserPlace {
  id: number;
  city_id: number;
  label: string;
  lat: number;
  lng: number;
  radius_m: number;
}

export interface NewFeedViewProps {
  cityId?: number | null;
  district?: number | null;
  isAdmin?: boolean;
  isImpersonating?: boolean;
  cityLeadCityIds?: number[];
  userPlaces?: UserPlace[];
  onPlaceSaved?: () => void;
  homeCityId?: number | null;
}

/**
 * Drop-in replacement for the old FeedView component.
 * Same props interface — can be swapped in any parent that renders <FeedView />.
 */
export default function NewFeedView({
  cityId,
  district,
  isAdmin = false,
  cityLeadCityIds = [],
  userPlaces = [],
  onPlaceSaved,
  homeCityId,
}: NewFeedViewProps) {
  return (
    <FeedContainer
      cityId={cityId}
      district={district}
      isAdmin={isAdmin}
      userPlaces={userPlaces}
      onPlaceSaved={onPlaceSaved}
      homeCityId={homeCityId}
    />
  );
}
