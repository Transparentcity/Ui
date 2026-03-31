// ============================================================================
// Evergreen SEO Pages — Data Types
// ============================================================================

export interface MonthlyDataPoint {
  month: string; // "YYYY-MM"
  value: number;
}

export interface YearlyDataPoint {
  year: number;
  rate: number; // per 1,000
}

// ============================================================================
// Data availability flags
// ============================================================================

export interface CityDataAvailability {
  crimeIncidents: boolean;
  crimeByDistrict: boolean;
  crimeTimestamp: boolean;
  crimeHistory: boolean; // at least 24 months
  threelevenResolutionTime: boolean;
  threelevenCategories: {
    encampments: boolean;
    graffiti: boolean;
    streetCleaning: boolean;
    illegalDumping: boolean;
    abandonedVehicles: boolean;
    streetlightOutages: boolean;
    rodentComplaints: boolean;
    humanWaste: boolean;
    sidewalkRepair: boolean;
    parkMaintenance: boolean;
  };
  buildingPermits: boolean;
  businessLicenses: boolean;
  crossCityComparison: {
    crime: boolean;
    threeleven: boolean;
    permits: boolean;
    businessLicenses: boolean;
  };
}

// ============================================================================
// District safety data
// ============================================================================

export interface DistrictSafetyData {
  safetyScore: number; // 0-10, one decimal place
  percentileRank: number; // 0-100
  violentCrimeRate: number | null;
  propertyCrimeRate: number | null;
  autoBurglaryRate: number | null;
  cityAvgViolentCrime: number | null;
  cityAvgPropertyCrime: number | null;
  cityAvgAutoBurglary: number | null;
  violentCrimeTrend: number | null; // YoY % change, negative = improvement
  propertyCrimeTrend: number | null;
  autoBurglaryTrend: number | null;
  trendData: MonthlyDataPoint[] | null;
  cityTrendData: MonthlyDataPoint[] | null;
  verdictSummary: string;
}

export interface CrimeBreakdown {
  violentCrime: {
    assault: number;
    robbery: number;
    vsLocalAvg: "above" | "average" | "below";
  } | null;
  propertyCrime: {
    burglary: number;
    autoTheft: number;
    theft: number;
    vsLocalAvg: "above" | "average" | "below";
  } | null;
  qualityOfLife: {
    vandalism: number;
    publicIntoxication: number;
    vsLocalAvg: "above" | "average" | "below";
  } | null;
  elevatedCategories: string[];
  annotation: string;
}

export interface StreetConditionMetric {
  rate: number; // per 1,000 residents
  vsLocalAvg: number; // multiplier, e.g. 3.2 = 3.2x city average
  resolutionDays: number | null;
  cityAvgResolutionDays: number | null;
}

export interface StreetConditions {
  encampmentComplaints: StreetConditionMetric | null;
  graffitiComplaints: StreetConditionMetric | null;
  abandonedVehicles: StreetConditionMetric | null;
  streetlightOutages: StreetConditionMetric | null;
  illegalDumping: StreetConditionMetric | null;
  sidewalkRepair: StreetConditionMetric | null;
  overallConditionsScore: "good" | "fair" | "poor";
  standoutStat: string;
}

export interface DistrictPulseData {
  mostCommonIncidentThisMonth: string;
  mostCommonIncidentCount: number;
  vsLastMonth: number; // % change
  mostImprovedMetric: string;
}

export interface RelatedDistrict {
  name: string;
  slug: string;
  safetyScore: number;
}

// ============================================================================
// Page props
// ============================================================================

export interface DistrictSafePageProps {
  city: string;
  citySlug: string;
  state: string;
  district: string;
  districtSlug: string;
  lastUpdated: string; // ISO date
  dataAvailability: CityDataAvailability;
  safetyData: DistrictSafetyData;
  crimeBreakdown: CrimeBreakdown;
  streetConditions: StreetConditions;
  pulse: DistrictPulseData;
  relatedDistricts: RelatedDistrict[];
}

export interface PeerCityRanking {
  city: string;
  citySlug: string;
  overallCrimeTrend: number; // YoY % change
  rank: number;
  isCurrentCity?: boolean;
}

export interface DistrictSafetyRank {
  name: string;
  slug: string;
  safetyScore: number;
  crimeRate: number | null;
}

export interface CitySafePageProps {
  city: string;
  citySlug: string;
  state: string;
  lastUpdated: string;
  dataAvailability: CityDataAvailability;
  safetyData: DistrictSafetyData; // reused, city-level figures
  crimeBreakdown: CrimeBreakdown;
  streetConditions: StreetConditions;
  peerCityRankings: PeerCityRanking[] | null;
  safestDistricts: DistrictSafetyRank[];
  leastSafeDistricts: DistrictSafetyRank[];
}

// ============================================================================
// Launch city registry
// ============================================================================

export interface LaunchCity {
  name: string;
  slug: string;
  state: string;
  stateCode: string;
  policeDashboardUrl?: string;
}
