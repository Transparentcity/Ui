export const FALLBACK_COPY = {
  crime_not_published: (city: string, fallbackUrl?: string) =>
    `${city} doesn't yet publish crime incident data in a format we can process. We're working on adding it.${
      fallbackUrl
        ? ` In the meantime, you can view the city's own crime statistics directly.`
        : ""
    }`,

  crime_not_district: (city: string) =>
    `${city} publishes crime data at the city level but not broken down by district. The figures below reflect the city as a whole.`,

  resolution_time_unavailable: (city: string) =>
    `${city}'s 311 system doesn't record when requests are closed, so we can show complaint volume but not response time.`,

  insufficient_history: (city: string) =>
    `We don't have enough historical data for ${city} to show a meaningful trend yet. Check back in a few months.`,

  peer_comparison_unavailable: () =>
    `Cross-city comparison requires data from at least 8 of our 15 tracked cities. We don't have enough comparable data for this metric yet.`,
};
