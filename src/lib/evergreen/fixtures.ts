import type {
  CityDataAvailability,
  DistrictSafePageProps,
  CitySafePageProps,
  MonthlyDataPoint,
} from "./types";

// ============================================================================
// Helpers
// ============================================================================

function generateTrendData(
  baseValue: number,
  months: number,
  drift: number
): MonthlyDataPoint[] {
  const points: MonthlyDataPoint[] = [];
  let value = baseValue;
  const startDate = new Date(2024, 3, 1); // April 2024
  for (let i = 0; i < months; i++) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    value += drift + (Math.random() - 0.5) * 2;
    points.push({ month, value: Math.max(0, Math.round(value * 10) / 10) });
  }
  return points;
}

// ============================================================================
// San Francisco — full data availability
// ============================================================================

const SF_AVAILABILITY: CityDataAvailability = {
  crimeIncidents: true,
  crimeByDistrict: true,
  crimeTimestamp: true,
  crimeHistory: true,
  threelevenResolutionTime: true,
  threelevenCategories: {
    encampments: true,
    graffiti: true,
    streetCleaning: true,
    illegalDumping: true,
    abandonedVehicles: true,
    streetlightOutages: true,
    rodentComplaints: true,
    humanWaste: true,
    sidewalkRepair: true,
    parkMaintenance: true,
  },
  buildingPermits: true,
  businessLicenses: true,
  crossCityComparison: {
    crime: true,
    threeleven: true,
    permits: true,
    businessLicenses: true,
  },
};

// ============================================================================
// Mission District fixture
// ============================================================================

export const MISSION_DISTRICT_FIXTURE: DistrictSafePageProps = {
  city: "San Francisco",
  citySlug: "san-francisco",
  state: "CA",
  district: "Mission District",
  districtSlug: "mission-district",
  districtNumber: 5, // SF Police District for Mission
  lastUpdated: "2026-03-01",
  dataAvailability: SF_AVAILABILITY,
  safetyData: {
    safetyScore: 5.2,
    percentileRank: 38,
    violentCrimeRate: 7.2,
    propertyCrimeRate: 42.1,
    autoBurglaryRate: 12.8,
    cityAvgViolentCrime: 6.1,
    cityAvgPropertyCrime: 31.4,
    cityAvgAutoBurglary: 9.7,
    violentCrimeTrend: -8,
    propertyCrimeTrend: 3,
    autoBurglaryTrend: -18,
    trendData: generateTrendData(50, 24, -0.3),
    cityTrendData: generateTrendData(38, 24, -0.1),
    verdictSummary:
      "The Mission District scores a 5.2 out of 10 for safety by San Francisco standards. Violent crime is down 8% over the past 12 months, but property crime remains above the city average. Auto burglary has seen the most improvement, dropping 18% year over year.",
  },
  crimeBreakdown: {
    violentCrime: {
      assault: 4.1,
      robbery: 3.1,
      vsLocalAvg: "above",
    },
    propertyCrime: {
      burglary: 8.2,
      autoTheft: 15.4,
      theft: 18.5,
      vsLocalAvg: "above",
    },
    qualityOfLife: {
      vandalism: 6.3,
      publicIntoxication: 4.8,
      vsLocalAvg: "above",
    },
    elevatedCategories: ["Robbery", "Auto theft", "Vandalism"],
    annotation:
      "Robbery is 1.6x the city average, the main driver of the elevated violent crime score. Auto theft is also notably high at 1.4x the city average.",
  },
  streetConditions: {
    encampmentComplaints: {
      rate: 18.4,
      vsLocalAvg: 3.2,
      resolutionDays: 4.1,
      cityAvgResolutionDays: 2.8,
    },
    graffitiComplaints: {
      rate: 12.1,
      vsLocalAvg: 2.1,
      resolutionDays: 6.3,
      cityAvgResolutionDays: 5.1,
    },
    abandonedVehicles: {
      rate: 3.2,
      vsLocalAvg: 0.9,
      resolutionDays: 8.2,
      cityAvgResolutionDays: 7.5,
    },
    streetlightOutages: {
      rate: 1.8,
      vsLocalAvg: 1.1,
      resolutionDays: 12.4,
      cityAvgResolutionDays: 10.2,
    },
    illegalDumping: {
      rate: 9.6,
      vsLocalAvg: 2.4,
      resolutionDays: 3.2,
      cityAvgResolutionDays: 2.9,
    },
    sidewalkRepair: {
      rate: 2.1,
      vsLocalAvg: 0.8,
      resolutionDays: 45.0,
      cityAvgResolutionDays: 38.0,
    },
    overallConditionsScore: "fair",
    standoutStat:
      "Encampment complaints are 3.2x the city average, the highest rate among all 311 categories for this district.",
  },
  pulse: {
    mostCommonIncidentThisMonth: "Larceny/Theft",
    mostCommonIncidentCount: 342,
    vsLastMonth: -5,
    mostImprovedMetric: "Auto burglary (down 18% YoY)",
  },
  relatedDistricts: [
    { name: "SoMa", slug: "soma", safetyScore: 4.5 },
    { name: "Castro", slug: "castro", safetyScore: 6.5 },
    { name: "Noe Valley", slug: "noe-valley", safetyScore: 8.2 },
    { name: "Potrero Hill", slug: "potrero-hill", safetyScore: 7.4 },
    { name: "Bernal Heights", slug: "bernal-heights", safetyScore: 6.5 },
  ],
  crimeMapMetricIds: {
    violentCrime: 1001, // placeholder: SF violent crime metric ID
    propertyCrime: 1002, // placeholder: SF property crime metric ID
  },
};

// ============================================================================
// San Francisco city-level fixture
// ============================================================================

export const SAN_FRANCISCO_CITY_FIXTURE: CitySafePageProps = {
  city: "San Francisco",
  citySlug: "san-francisco",
  state: "CA",
  lastUpdated: "2026-03-01",
  dataAvailability: SF_AVAILABILITY,
  safetyData: {
    safetyScore: 5.4,
    percentileRank: 45,
    violentCrimeRate: 6.1,
    propertyCrimeRate: 31.4,
    autoBurglaryRate: 9.7,
    cityAvgViolentCrime: 6.1,
    cityAvgPropertyCrime: 31.4,
    cityAvgAutoBurglary: 9.7,
    violentCrimeTrend: -5,
    propertyCrimeTrend: -2,
    autoBurglaryTrend: -22,
    trendData: generateTrendData(38, 24, -0.15),
    cityTrendData: null, // no comparison line for city page (it IS the city)
    verdictSummary:
      "San Francisco scores a 5.4 out of 10 for safety, and the trend is improving. Violent crime is down 5% year over year and auto burglary, long the city's most visible crime category, has dropped 22%. Property crime is down slightly at 2%. Among the 15 major cities we track, San Francisco ranks 4th for year-over-year safety improvement.",
  },
  crimeBreakdown: {
    violentCrime: {
      assault: 3.4,
      robbery: 2.7,
      vsLocalAvg: "average",
    },
    propertyCrime: {
      burglary: 5.8,
      autoTheft: 11.2,
      theft: 14.4,
      vsLocalAvg: "above",
    },
    qualityOfLife: {
      vandalism: 4.1,
      publicIntoxication: 3.2,
      vsLocalAvg: "average",
    },
    elevatedCategories: ["Auto theft", "Theft"],
    annotation:
      "Property crime remains San Francisco's most elevated category, driven by auto theft (11.2 per 1,000 residents) and larceny/theft. Violent crime is in line with peer city averages.",
  },
  streetConditions: {
    encampmentComplaints: {
      rate: 5.8,
      vsLocalAvg: 1.0,
      resolutionDays: 2.8,
      cityAvgResolutionDays: 2.8,
    },
    graffitiComplaints: {
      rate: 5.7,
      vsLocalAvg: 1.0,
      resolutionDays: 5.1,
      cityAvgResolutionDays: 5.1,
    },
    abandonedVehicles: {
      rate: 3.5,
      vsLocalAvg: 1.0,
      resolutionDays: 7.5,
      cityAvgResolutionDays: 7.5,
    },
    streetlightOutages: {
      rate: 1.6,
      vsLocalAvg: 1.0,
      resolutionDays: 10.2,
      cityAvgResolutionDays: 10.2,
    },
    illegalDumping: {
      rate: 4.0,
      vsLocalAvg: 1.0,
      resolutionDays: 2.9,
      cityAvgResolutionDays: 2.9,
    },
    sidewalkRepair: {
      rate: 2.6,
      vsLocalAvg: 1.0,
      resolutionDays: 38.0,
      cityAvgResolutionDays: 38.0,
    },
    overallConditionsScore: "fair",
    standoutStat:
      "The city takes a median of 2.8 days to respond to encampment complaints and 5.1 days for graffiti removal requests.",
  },
  peerCityRankings: [
    { city: "Austin", citySlug: "austin", overallCrimeTrend: -14, rank: 1 },
    { city: "Denver", citySlug: "denver", overallCrimeTrend: -11, rank: 2 },
    { city: "Seattle", citySlug: "seattle", overallCrimeTrend: -9, rank: 3 },
    {
      city: "San Francisco",
      citySlug: "san-francisco",
      overallCrimeTrend: -7,
      rank: 4,
      isCurrentCity: true,
    },
    { city: "Portland", citySlug: "portland", overallCrimeTrend: -6, rank: 5 },
    { city: "Boston", citySlug: "boston", overallCrimeTrend: -5, rank: 6 },
    {
      city: "Minneapolis",
      citySlug: "minneapolis",
      overallCrimeTrend: -4,
      rank: 7,
    },
    { city: "Nashville", citySlug: "nashville", overallCrimeTrend: -3, rank: 8 },
    { city: "Atlanta", citySlug: "atlanta", overallCrimeTrend: -2, rank: 9 },
    { city: "Chicago", citySlug: "chicago", overallCrimeTrend: -1, rank: 10 },
    {
      city: "Philadelphia",
      citySlug: "philadelphia",
      overallCrimeTrend: 0,
      rank: 11,
    },
    { city: "Miami", citySlug: "miami", overallCrimeTrend: 1, rank: 12 },
    {
      city: "Los Angeles",
      citySlug: "los-angeles",
      overallCrimeTrend: 2,
      rank: 13,
    },
    { city: "Phoenix", citySlug: "phoenix", overallCrimeTrend: 3, rank: 14 },
    { city: "Houston", citySlug: "houston", overallCrimeTrend: 5, rank: 15 },
  ],
  safestDistricts: [
    { name: "Noe Valley", slug: "noe-valley", safetyScore: 8.2, crimeRate: 12.3 },
    { name: "Sunset", slug: "sunset", safetyScore: 8.1, crimeRate: 14.1 },
    { name: "Richmond", slug: "richmond", safetyScore: 7.4, crimeRate: 16.8 },
    { name: "Potrero Hill", slug: "potrero-hill", safetyScore: 7.2, crimeRate: 18.2 },
    { name: "Bernal Heights", slug: "bernal-heights", safetyScore: 6.5, crimeRate: 21.4 },
  ],
  leastSafeDistricts: [
    { name: "Tenderloin", slug: "tenderloin", safetyScore: 2.1, crimeRate: 89.2 },
    { name: "SoMa", slug: "soma", safetyScore: 4.5, crimeRate: 62.4 },
    { name: "Mission District", slug: "mission-district", safetyScore: 5.2, crimeRate: 49.3 },
    { name: "Civic Center", slug: "civic-center", safetyScore: 3.8, crimeRate: 55.1 },
    { name: "Financial District", slug: "financial-district", safetyScore: 5.1, crimeRate: 44.8 },
  ],
  crimeMapMetricIds: {
    violentCrime: 1001,
    propertyCrime: 1002,
  },
};

// ============================================================================
// Fixture lookup
// ============================================================================

const DISTRICT_FIXTURES: Record<string, Record<string, DistrictSafePageProps>> =
  {
    "san-francisco": {
      "mission-district": MISSION_DISTRICT_FIXTURE,
    },
  };

const CITY_FIXTURES: Record<string, CitySafePageProps> = {
  "san-francisco": SAN_FRANCISCO_CITY_FIXTURE,
};

export function getDistrictFixture(
  citySlug: string,
  districtSlug: string
): DistrictSafePageProps | null {
  return DISTRICT_FIXTURES[citySlug]?.[districtSlug] ?? null;
}

export function getCityFixture(citySlug: string): CitySafePageProps | null {
  return CITY_FIXTURES[citySlug] ?? null;
}
