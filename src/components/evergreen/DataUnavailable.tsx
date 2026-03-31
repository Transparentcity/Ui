import { FALLBACK_COPY } from "@/lib/evergreen/fallbackCopy";

type UnavailableReason =
  | "crime_not_published"
  | "crime_not_district"
  | "resolution_time_unavailable"
  | "insufficient_history";

interface DataUnavailableProps {
  reason: UnavailableReason;
  city: string;
  fallbackUrl?: string;
  fallbackLabel?: string;
}

export default function DataUnavailable({
  reason,
  city,
  fallbackUrl,
  fallbackLabel,
}: DataUnavailableProps) {
  const copy = FALLBACK_COPY[reason](city, fallbackUrl);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
      <p>{copy}</p>
      {fallbackUrl && fallbackLabel && (
        <a
          href={fallbackUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-purple-600 hover:text-purple-700 font-medium"
        >
          {fallbackLabel}
          <span aria-hidden>&rarr;</span>
        </a>
      )}
    </div>
  );
}
