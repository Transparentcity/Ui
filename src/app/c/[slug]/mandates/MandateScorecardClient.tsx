"use client";

import MandateScorecard from "@/components/mandates/MandateScorecard";
import { useCityMandates } from "@/lib/hooks/useCityMandates";

/** Fetches mandates with the viewer's token (admin-only during dark launch). */
export default function MandateScorecardClient({
  cityId,
  slug,
}: {
  cityId: number;
  slug: string;
}) {
  const state = useCityMandates(cityId);
  return (
    <MandateScorecard
      mandates={state.mandates}
      slug={slug}
      state={state.status === "idle" ? "loading" : state.status}
      errorMessage={state.status === "error" ? state.message : undefined}
    />
  );
}
