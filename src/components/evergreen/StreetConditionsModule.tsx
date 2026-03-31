import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import DataNotice from "./DataNotice";
import type {
  StreetConditions,
  StreetConditionMetric,
  CityDataAvailability,
} from "@/lib/evergreen/types";
import { formatResolutionDays } from "@/lib/evergreen/narratives";

function ConditionCard({
  label,
  metric,
  showResolutionTime,
}: {
  label: string;
  metric: StreetConditionMetric;
  showResolutionTime: boolean;
}) {
  const vsAvgLabel =
    metric.vsLocalAvg > 1.5
      ? `${metric.vsLocalAvg.toFixed(1)}x avg`
      : metric.vsLocalAvg < 0.7
        ? "Below avg"
        : "Near avg";
  const vsAvgVariant =
    metric.vsLocalAvg > 1.5
      ? ("destructive" as const)
      : metric.vsLocalAvg < 0.7
        ? ("success" as const)
        : ("secondary" as const);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">{label}</h4>
          <Badge variant={vsAvgVariant} className="text-xs">
            {vsAvgLabel}
          </Badge>
        </div>
        <p className="text-lg font-bold text-gray-900 tabular-nums">
          {metric.rate.toFixed(1)}
          <span className="text-xs font-normal text-gray-500 ml-1">
            per 1k residents
          </span>
        </p>
        {showResolutionTime && metric.resolutionDays != null && (
          <p className="mt-1 text-xs text-gray-500">
            Resolved in {formatResolutionDays(metric.resolutionDays)}
            {metric.cityAvgResolutionDays != null && (
              <> (city avg: {formatResolutionDays(metric.cityAvgResolutionDays)})</>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const CONDITION_LABELS: Record<string, string> = {
  encampmentComplaints: "Encampments",
  graffitiComplaints: "Graffiti",
  abandonedVehicles: "Abandoned vehicles",
  streetlightOutages: "Streetlight outages",
  illegalDumping: "Illegal dumping",
  sidewalkRepair: "Sidewalk repair",
};

const SCORE_CONFIG = {
  good: { label: "Good", variant: "success" as const },
  fair: { label: "Fair", variant: "warning" as const },
  poor: { label: "Poor", variant: "destructive" as const },
};

interface StreetConditionsModuleProps {
  data: StreetConditions;
  availability: CityDataAvailability;
  city: string;
}

export default function StreetConditionsModule({
  data,
  availability,
  city,
}: StreetConditionsModuleProps) {
  const showResolutionTime = availability.threelevenResolutionTime;

  const categories = Object.entries(CONDITION_LABELS)
    .filter(([key]) => {
      const metric = data[key as keyof StreetConditions];
      return metric != null && typeof metric === "object" && "rate" in metric;
    })
    .map(([key, label]) => ({
      key,
      label,
      metric: data[key as keyof StreetConditions] as StreetConditionMetric,
    }));

  if (categories.length === 0) return null;

  const score = SCORE_CONFIG[data.overallConditionsScore];

  // Compute median resolution time across available categories
  const resolutionTimes = categories
    .map((c) => c.metric.resolutionDays)
    .filter((d): d is number => d != null);
  const medianResolution =
    resolutionTimes.length > 0
      ? resolutionTimes.sort((a, b) => a - b)[
          Math.floor(resolutionTimes.length / 2)
        ]
      : null;

  return (
    <section id="conditions">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold text-gray-900">
          What&apos;s It Actually Like to Walk Around Here?
        </h2>
        <Badge variant={score.variant}>{score.label}</Badge>
      </div>
      <p className="text-sm text-gray-600 mb-3">
        Crime stats tell you what gets reported. 311 data tells you what
        residents actually experience day to day.
      </p>
      {showResolutionTime && medianResolution != null && (
        <p className="text-sm font-medium text-gray-800 mb-4">
          Median response time for 311 complaints here:{" "}
          <span className="text-purple-700">
            {formatResolutionDays(medianResolution)}
          </span>
        </p>
      )}

      {!showResolutionTime && (
        <div className="mb-3">
          <DataNotice>
            {city}&apos;s 311 system doesn&apos;t record when requests are
            closed, so we can show complaint volume but not response time.
          </DataNotice>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories.map(({ key, label, metric }) => (
          <ConditionCard
            key={key}
            label={label}
            metric={metric}
            showResolutionTime={showResolutionTime}
          />
        ))}
      </div>

      {data.standoutStat && (
        <div className="mt-4 rounded-md bg-purple-50 border border-purple-200 px-4 py-3">
          <p className="text-sm text-purple-800">{data.standoutStat}</p>
        </div>
      )}
    </section>
  );
}
