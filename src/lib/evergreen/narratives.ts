import type { DistrictSafetyData } from "./types";

function scoreToLabel(score: number): string {
  if (score >= 8) return "strong";
  if (score >= 6.5) return "above-average";
  if (score >= 5) return "mixed";
  if (score >= 3.5) return "below-average";
  return "poor";
}

export function generateSafetyVerdict(
  data: DistrictSafetyData,
  name: string,
  city: string
): string {
  if (data.verdictSummary) return data.verdictSummary;

  const parts: string[] = [];
  parts.push(
    `${name} has a ${scoreToLabel(data.safetyScore)} safety profile by ${city} standards.`
  );

  if (data.violentCrimeTrend != null) {
    const direction = data.violentCrimeTrend < 0 ? "down" : "up";
    parts.push(
      `Violent crime is ${direction} ${Math.abs(data.violentCrimeTrend)}% over the past 12 months.`
    );
  }

  if (
    data.violentCrimeRate != null &&
    data.cityAvgViolentCrime != null
  ) {
    const vs =
      data.violentCrimeRate < data.cityAvgViolentCrime ? "below" : "above";
    parts.push(`It sits ${vs} the city average.`);
  }

  return parts.join(" ");
}

export function generateCitySafetyVerdict(
  data: DistrictSafetyData,
  city: string,
  peerRank: number | null
): string {
  if (data.verdictSummary) return data.verdictSummary;

  const parts: string[] = [];
  parts.push(
    `${city} has a ${scoreToLabel(data.safetyScore)} overall safety profile.`
  );

  if (data.violentCrimeTrend != null) {
    const direction = data.violentCrimeTrend < 0 ? "down" : "up";
    parts.push(
      `Violent crime is ${direction} ${Math.abs(data.violentCrimeTrend)}% year over year.`
    );
  }

  if (peerRank != null) {
    parts.push(
      `Among the 15 major cities we track, ${city} ranks #${peerRank} for safety improvement.`
    );
  }

  return parts.join(" ");
}

export function formatRate(rate: number): string {
  return rate.toFixed(1);
}

export function formatTrend(trend: number): string {
  if (trend === 0) return "flat";
  const direction = trend < 0 ? "down" : "up";
  return `${direction} ${Math.abs(trend)}%`;
}

export function formatResolutionDays(days: number): string {
  if (days < 1) return "less than a day";
  if (days === 1) return "1 day";
  return `${days.toFixed(1)} days`;
}
