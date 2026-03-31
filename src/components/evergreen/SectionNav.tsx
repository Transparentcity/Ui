import Link from "next/link";
import { getScoreDotColor } from "@/lib/evergreen/scoreColors";
import type { RelatedDistrict, DistrictSafetyRank } from "@/lib/evergreen/types";

interface SectionNavProps {
  citySlug: string;
  cityName: string;
  relatedDistricts?: RelatedDistrict[];
  districtRankings?: DistrictSafetyRank[];
  rankingLabel?: string;
  showCitySafeLink?: boolean;
}

function ScoreDot({ score }: { score: number }) {
  const color = getScoreDotColor(score);
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${color} mr-1.5`}
      aria-hidden
    />
  );
}

export default function SectionNav({
  citySlug,
  cityName,
  relatedDistricts,
  districtRankings,
  rankingLabel,
  showCitySafeLink,
}: SectionNavProps) {
  return (
    <footer className="space-y-6">
      {relatedDistricts && relatedDistricts.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Explore Nearby Districts
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {relatedDistricts.map((d) => (
              <Link
                key={d.slug}
                href={`/c/${citySlug}/${d.slug}/safe`}
                className="rounded-lg border border-gray-200 p-3 hover:border-purple-300 hover:bg-purple-50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">{d.name}</p>
                <p className="text-xs text-gray-500 flex items-center">
                  <ScoreDot score={d.safetyScore} />
                  {d.safetyScore}/10
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {districtRankings && districtRankings.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            {rankingLabel ?? "Districts by Safety"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {districtRankings.map((d) => (
              <Link
                key={d.slug}
                href={`/c/${citySlug}/${d.slug}/safe`}
                className="rounded-lg border border-gray-200 p-3 hover:border-purple-300 hover:bg-purple-50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">{d.name}</p>
                <p className="text-xs text-gray-500 flex items-center">
                  <ScoreDot score={d.safetyScore} />
                  {d.safetyScore}/10
                  {d.crimeRate != null && (
                    <> &middot; {d.crimeRate.toFixed(1)}/1k</>
                  )}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {showCitySafeLink && (
        <div>
          <Link
            href={`/c/${citySlug}/safe`}
            className="text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            Is {cityName} Safe? &rarr;
          </Link>
        </div>
      )}
    </footer>
  );
}
