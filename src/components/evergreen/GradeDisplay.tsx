"use client";

import { cn } from "@/lib/utils";

function getScoreColor(score: number): {
  bg: string;
  text: string;
  border: string;
  ring: string;
  dot: string;
} {
  if (score >= 8)
    return {
      bg: "bg-emerald-50",
      text: "text-emerald-800",
      border: "border-emerald-300",
      ring: "#059669",
      dot: "bg-emerald-500",
    };
  if (score >= 6.5)
    return {
      bg: "bg-green-50",
      text: "text-green-800",
      border: "border-green-300",
      ring: "#16a34a",
      dot: "bg-green-500",
    };
  if (score >= 5)
    return {
      bg: "bg-amber-50",
      text: "text-amber-800",
      border: "border-amber-300",
      ring: "#d97706",
      dot: "bg-amber-500",
    };
  if (score >= 3.5)
    return {
      bg: "bg-orange-50",
      text: "text-orange-800",
      border: "border-orange-300",
      ring: "#ea580c",
      dot: "bg-orange-500",
    };
  return {
    bg: "bg-red-50",
    text: "text-red-800",
    border: "border-red-300",
    ring: "#dc2626",
    dot: "bg-red-500",
  };
}

function getVerdictLabel(score: number): string {
  if (score >= 8) return "Very Safe";
  if (score >= 6.5) return "Safe";
  if (score >= 5) return "Mixed";
  if (score >= 3.5) return "Caution";
  return "High Risk";
}

interface GradeDisplayProps {
  safetyScore: number;
  percentileRank: number;
  locationName: string;
  comparisonLabel: string;
  lastUpdated?: string;
}

export default function GradeDisplay({
  safetyScore,
  percentileRank,
  locationName,
  comparisonLabel,
  lastUpdated,
}: GradeDisplayProps) {
  const colors = getScoreColor(safetyScore);
  const display =
    safetyScore % 1 === 0
      ? `${safetyScore}.0`
      : safetyScore.toFixed(1);
  const verdict = getVerdictLabel(safetyScore);

  // Arc: fraction of a circle (score/10)
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const arcLength = (safetyScore / 10) * circumference;
  const arcGap = circumference - arcLength;

  const updatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex items-center gap-5">
      {/* Score ring */}
      <div className="relative w-20 h-20 flex-shrink-0">
        <svg
          viewBox="0 0 80 80"
          className="w-20 h-20"
          style={{ transform: "rotate(-90deg)" }}
        >
          {/* Background track */}
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="5"
          />
          {/* Score arc */}
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke={colors.ring}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${arcGap}`}
          />
        </svg>
        {/* Score text centered */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-2xl font-bold leading-none", colors.text)}>
            {display}
          </span>
          <span className="text-[10px] text-gray-400 font-medium">/10</span>
        </div>
      </div>

      {/* Labels */}
      <div>
        <span
          className={cn(
            "inline-block text-xs font-semibold px-2 py-0.5 rounded-full",
            colors.bg,
            colors.text
          )}
        >
          {verdict}
        </span>
        <p className="mt-1 text-sm text-gray-600">
          Safer than {percentileRank}% of {comparisonLabel}
        </p>
        {updatedLabel && (
          <p className="mt-0.5 text-xs text-gray-400">
            Data current as of {updatedLabel}
          </p>
        )}
      </div>
    </div>
  );
}

