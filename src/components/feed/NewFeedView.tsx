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
  isOfficial?: boolean;
  isImpersonating?: boolean;
  cityLeadCityIds?: number[];
  userPlaces?: UserPlace[];
  onPlaceSaved?: () => void;
}

/**
 * Drop-in replacement for the old FeedView component.
 * Same props interface — can be swapped in any parent that renders <FeedView />.
 */
export default function NewFeedView({
  cityId,
  district,
  isAdmin = false,
  isOfficial = false,
  cityLeadCityIds = [],
  userPlaces = [],
  onPlaceSaved,
}: NewFeedViewProps) {
  return (
    <FeedContainer
      cityId={cityId}
      district={district}
      isAdmin={isAdmin}
      isOfficial={isOfficial}
      cityLeadCityIds={cityLeadCityIds}
      userPlaces={userPlaces}
      onPlaceSaved={onPlaceSaved}
    />
  );
}
