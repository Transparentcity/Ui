import { Card, CardContent } from "@/components/ui/card";
import TrendArrow from "./TrendArrow";
import type { DistrictPulseData } from "@/lib/evergreen/types";

interface DistrictPulseProps {
  data: DistrictPulseData;
  locationName: string;
  lastUpdated: string;
}

export default function DistrictPulse({
  data,
  locationName,
  lastUpdated,
}: DistrictPulseProps) {
  const updatedDate = new Date(lastUpdated).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <section>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        This Month in {locationName}
      </h2>
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Most common incident
              </p>
              <p className="mt-1 text-lg font-bold text-gray-900">
                {data.mostCommonIncidentThisMonth}
              </p>
              <p className="text-sm text-gray-500 tabular-nums">
                {data.mostCommonIncidentCount.toLocaleString()} reports
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                vs. last month
              </p>
              <div className="mt-1">
                <TrendArrow value={data.vsLastMonth} className="text-lg" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Most improved (YoY)
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900">
                {data.mostImprovedMetric}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Updated {updatedDate}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
