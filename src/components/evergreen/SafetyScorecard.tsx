import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TrendArrow from "./TrendArrow";
import DataNotice from "./DataNotice";
import DataUnavailable from "./DataUnavailable";
import type { DistrictSafetyData, CityDataAvailability } from "@/lib/evergreen/types";
import { formatRate } from "@/lib/evergreen/narratives";

function ComparisonBar({
  rate,
  avg,
}: {
  rate: number;
  avg: number;
}) {
  // Bar shows how rate compares to avg. Avg is the midpoint (50%).
  // rate/avg ratio mapped so that avg = 50%, 2x avg = 100%, 0 = 0%
  const ratio = rate / avg;
  const pct = Math.min(Math.max(ratio * 50, 5), 100);
  const isAbove = rate > avg;

  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full mt-1 relative">
      {/* Avg midpoint marker */}
      <div className="absolute left-1/2 top-0 w-px h-1.5 bg-gray-300" />
      <div
        className={`h-1.5 rounded-full ${isAbove ? "bg-red-400" : "bg-emerald-400"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface SafetyScorecardProps {
  data: DistrictSafetyData;
  availability: CityDataAvailability;
  locationLabel: string;
  comparisonLabel: string;
  city: string;
  policeDashboardUrl?: string;
  sourceAttribution: string;
}

export default function SafetyScorecard({
  data,
  availability,
  locationLabel,
  comparisonLabel,
  city,
  policeDashboardUrl,
  sourceAttribution,
}: SafetyScorecardProps) {
  if (!availability.crimeIncidents) {
    return (
      <DataUnavailable
        reason="crime_not_published"
        city={city}
        fallbackUrl={policeDashboardUrl}
        fallbackLabel={`${city} Police crime statistics`}
      />
    );
  }

  const showDistrictNotice =
    !availability.crimeByDistrict && locationLabel !== city;

  const rows = [
    {
      label: "Violent crime",
      rate: data.violentCrimeRate,
      avg: data.cityAvgViolentCrime,
      trend: data.violentCrimeTrend,
    },
    {
      label: "Property crime",
      rate: data.propertyCrimeRate,
      avg: data.cityAvgPropertyCrime,
      trend: data.propertyCrimeTrend,
    },
    {
      label: "Auto burglary",
      rate: data.autoBurglaryRate,
      avg: data.cityAvgAutoBurglary,
      trend: data.autoBurglaryTrend,
    },
  ];

  return (
    <section id="scorecard">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Safety Scorecard
      </h2>
      {showDistrictNotice && (
        <div className="mb-3">
          <DataNotice>
            District-level crime data isn&apos;t available for {city} yet.
            Showing city-wide figures.
          </DataNotice>
        </div>
      )}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-right">
                {locationLabel}
              </TableHead>
              <TableHead className="text-right">{comparisonLabel}</TableHead>
              <TableHead className="text-right">Trend (YoY)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="font-medium">
                  {row.label}
                  {row.rate != null && row.avg != null && (
                    <ComparisonBar rate={row.rate} avg={row.avg} />
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.rate != null ? (
                    <>{formatRate(row.rate)}/1k</>
                  ) : (
                    <span className="text-gray-400">N/A</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-gray-500">
                  {row.avg != null ? (
                    <>{formatRate(row.avg)}/1k</>
                  ) : (
                    <span className="text-gray-400">N/A</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {row.trend != null ? (
                    <TrendArrow value={row.trend} />
                  ) : (
                    <span className="text-gray-400">N/A</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        Source: {sourceAttribution}. Rates per 1,000 residents.
      </p>
    </section>
  );
}
