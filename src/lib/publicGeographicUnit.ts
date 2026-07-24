import type { PublicLeader } from "@/lib/publicApiClient";
import type { LeaderLike } from "@/lib/publicLeadersPick";
import { isAtLargeCouncilCity } from "@/lib/atLargeCouncilNav";
import {
  pluralGeographicUnitLabel,
  resolveGeographicUnitLabel,
} from "@/lib/geographicUnitLabel";

export type PublicSubdivision = {
  id: number;
  name: string;
};

export type PublicGeographicContext = {
  unitLabel: string;
  unitLabelPlural: string;
  navigationMode: "district" | "neighborhood";
  subdivisionNames: Map<number, string>;
};

export function resolvePublicGeographicContext(input: {
  leaders?: LeaderLike[] | PublicLeader[] | null;
  geographicUnitLabel?: string | null;
  geographicUnitLabelPlural?: string | null;
  navigationMode?: string | null;
  subdivisions?: PublicSubdivision[] | null;
}): PublicGeographicContext {
  const leaders = input.leaders ?? [];
  const unitLabel =
    input.geographicUnitLabel ??
    (isAtLargeCouncilCity(leaders) ? "Neighborhood" : "District");
  const unitLabelPlural =
    input.geographicUnitLabelPlural ?? pluralGeographicUnitLabel(unitLabel);
  const navigationMode: "district" | "neighborhood" =
    input.navigationMode === "neighborhood" || unitLabel === "Neighborhood"
      ? "neighborhood"
      : "district";

  const subdivisionNames = new Map<number, string>();
  for (const item of input.subdivisions ?? []) {
    if (item?.id != null && item.name) {
      subdivisionNames.set(item.id, item.name);
    }
  }

  return {
    unitLabel,
    unitLabelPlural,
    navigationMode,
    subdivisionNames,
  };
}

export function formatSubdivisionLabel(
  context: Pick<PublicGeographicContext, "unitLabel" | "subdivisionNames">,
  id: number,
): string {
  return context.subdivisionNames.get(id) ?? `${context.unitLabel} ${id}`;
}

export function formatSubdivisionHeading(
  context: Pick<PublicGeographicContext, "unitLabel" | "subdivisionNames">,
  id: number,
  cityName?: string,
): string {
  const name = formatSubdivisionLabel(context, id);
  return cityName ? `${name} · ${cityName}` : name;
}

export function resolvePublicGeographicUnitLabelFromStructures(
  leaders: LeaderLike[],
  geographicStructures?: Array<{
    id?: number;
    structure_name?: string | null;
    structure_type?: string | null;
  }> | null,
): string {
  if (isAtLargeCouncilCity(leaders)) return "Neighborhood";
  const blob = (geographicStructures ?? [])
    .map((s) => `${s.structure_name ?? ""} ${s.structure_type ?? ""}`.toLowerCase())
    .join(" ");
  if (blob.includes("neighborhood") || blob.includes("sna")) return "Neighborhood";
  // Public leaders lack structure IDs; still safe — falls back to "District".
  return resolveGeographicUnitLabel(
    leaders,
    geographicStructures as Parameters<typeof resolveGeographicUnitLabel>[1],
  );
}
