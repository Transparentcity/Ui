"use client";

import FeedContainer from "./FeedContainer";

interface NewFeedViewProps {
  cityId?: number | null;
  district?: number | null;
  isAdmin?: boolean;
  cityLeadCityIds?: number[];
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
}: NewFeedViewProps) {
  return (
    <FeedContainer
      cityId={cityId}
      district={district}
      isAdmin={isAdmin}
      cityLeadCityIds={cityLeadCityIds}
    />
  );
}
