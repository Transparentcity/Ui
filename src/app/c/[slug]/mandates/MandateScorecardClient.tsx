"use client";

import MandateScorecard from "@/components/mandates/MandateScorecard";
import { useCityMandates } from "@/lib/hooks/useCityMandates";

/** Fetches mandates with the viewer's token (admin-only during dark launch). */
export default function MandateScorecardClient({
  cityId,
  slug,
  cityName,
}: {
  cityId: number;
  slug: string;
  cityName?: string;
}) {
  const state = useCityMandates(cityId);
  return (
    <MandateScorecard
      mandates={state.mandates}
      slug={slug}
      cityName={cityName}
      state={state.status === "idle" ? "loading" : state.status}
      errorMessage={state.status === "error" ? state.message : undefined}
    />
  );
}
