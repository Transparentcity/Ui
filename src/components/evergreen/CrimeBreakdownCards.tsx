import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CrimeBreakdown, CityDataAvailability } from "@/lib/evergreen/types";

const COMPARISON_CONFIG = {
  above: { label: "Above avg", variant: "destructive" as const, border: "border-l-red-400" },
  average: { label: "Average", variant: "secondary" as const, border: "border-l-gray-300" },
  below: { label: "Below avg", variant: "success" as const, border: "border-l-emerald-400" },
};

function ComparisonBadge({ vs }: { vs: "above" | "average" | "below" }) {
  const { label, variant } = COMPARISON_CONFIG[vs];
  return <Badge variant={variant}>{label}</Badge>;
}

interface CrimeBreakdownCardsProps {
  data: CrimeBreakdown;
  availability: CityDataAvailability;
}

export default function CrimeBreakdownCards({
  data,
  availability,
}: CrimeBreakdownCardsProps) {
  if (!availability.crimeIncidents) return null;

  const sections = [
    {
      title: "Violent Crime",
      data: data.violentCrime,
      metrics: data.violentCrime
        ? [
            { label: "Assault", value: data.violentCrime.assault },
            { label: "Robbery", value: data.violentCrime.robbery },
          ]
        : [],
    },
    {
      title: "Property Crime",
      data: data.propertyCrime,
      metrics: data.propertyCrime
        ? [
            { label: "Burglary", value: data.propertyCrime.burglary },
            { label: "Auto theft", value: data.propertyCrime.autoTheft },
            { label: "Theft", value: data.propertyCrime.theft },
          ]
        : [],
    },
    {
      title: "Quality of Life",
      data: data.qualityOfLife,
      metrics: data.qualityOfLife
        ? [
            { label: "Vandalism", value: data.qualityOfLife.vandalism },
            {
              label: "Public intoxication",
              value: data.qualityOfLife.publicIntoxication,
            },
          ]
        : [],
    },
  ];

  return (
    <section id="crime">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        What Kind of Crime?
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sections.map((section) => {
          if (!section.data) return null;
          return (
            <Card key={section.title} className={cn("border-l-4", COMPARISON_CONFIG[section.data.vsLocalAvg].border)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {section.title}
                  </h3>
                  <ComparisonBadge vs={section.data.vsLocalAvg} />
                </div>
                <div className="space-y-2">
                  {section.metrics.map((m) => (
                    <div
                      key={m.label}
                      className="flex justify-between text-sm"
                    >
                      <span className="text-gray-600">{m.label}</span>
                      <span className="font-medium tabular-nums text-gray-900">
                        {m.value.toFixed(1)}/1k
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {data.annotation && (
        <p className="mt-3 text-sm text-gray-600 italic">{data.annotation}</p>
      )}
    </section>
  );
}
