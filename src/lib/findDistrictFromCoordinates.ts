/**
 * Resolve district number from (lat, lng) for a given city using shapefiles.
 * Used by onboarding and Edit Home Location to add the district to My places.
 */

import {
  getCityStructure,
  getCityShapeLayers,
  getCityLeaders,
  type CityShapefile,
} from "@/lib/apiClient";

function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

export async function findDistrictFromCoordinates(
  lat: number,
  lng: number,
  cityId: number,
  token: string
): Promise<number | null> {
  try {
    const [cityStructure, shapeLayers] = await Promise.all([
      getCityStructure(cityId, token),
      getCityShapeLayers(cityId, token),
    ]);

    if (!cityStructure || !shapeLayers || shapeLayers.length === 0) {
      return null;
    }

    const point: [number, number] = [lng, lat];
    let primaryGeographicStructureId: number | null = null;

    const leaders = await getCityLeaders(cityId, token);
    if (leaders && leaders.length > 0) {
      const structureIdCounts = new Map<number, number>();
      leaders.forEach((leader) => {
        if (leader.geographic_structure_id) {
          const count = structureIdCounts.get(leader.geographic_structure_id) || 0;
          structureIdCounts.set(leader.geographic_structure_id, count + 1);
        }
      });
      let maxCount = 0;
      structureIdCounts.forEach((count, structureId) => {
        if (count > maxCount) {
          maxCount = count;
          primaryGeographicStructureId = structureId;
        }
      });
    }

    if (!primaryGeographicStructureId && cityStructure.geographic_structures) {
      const districtStructure = cityStructure.geographic_structures.find(
        (gs) =>
          gs.structure_name?.toLowerCase().includes("supervisor") ||
          gs.structure_name?.toLowerCase().includes("council") ||
          gs.structure_name?.toLowerCase().includes("ward") ||
          gs.structure_type?.toLowerCase().includes("supervisor") ||
          gs.structure_type?.toLowerCase().includes("council")
      );
      if (districtStructure && districtStructure.id !== undefined) {
        primaryGeographicStructureId = districtStructure.id;
      }
    }

    const shapefiles: CityShapefile[] = shapeLayers
      .map((layer) => layer.instance)
      .filter((instance): instance is CityShapefile => instance !== null);

    const primaryShapefiles: CityShapefile[] = [];
    const otherShapefiles: CityShapefile[] = [];
    shapefiles.forEach((shapefile) => {
      if (
        primaryGeographicStructureId &&
        shapefile.geographic_structure_id === primaryGeographicStructureId
      ) {
        primaryShapefiles.push(shapefile);
      } else {
        otherShapefiles.push(shapefile);
      }
    });

    const shapefilesToCheck = [...primaryShapefiles, ...otherShapefiles];

    for (const shapefile of shapefilesToCheck) {
      const geometryData = shapefile.geometry_data;
      if (!geometryData || geometryData.type !== "FeatureCollection") continue;

      for (const feature of geometryData.features) {
        if (!feature.geometry || !feature.geometry.coordinates) continue;
        let rings: [number, number][][] = [];
        if (feature.geometry.type === "Polygon") {
          rings = [feature.geometry.coordinates[0] as [number, number][]];
        } else if (feature.geometry.type === "MultiPolygon") {
          rings = feature.geometry.coordinates.map(
            (poly: unknown) => (poly as [number, number][][])[0] as [number, number][]
          );
        }
        for (const ring of rings) {
          if (pointInPolygon(point, ring)) {
            const identifier = feature.properties?.[shapefile.identifier_field || ""];
            if (identifier !== undefined && identifier !== null) {
              const districtNum =
                typeof identifier === "number"
                  ? identifier
                  : parseInt(String(identifier).replace(/\D/g, ""), 10);
              if (!isNaN(districtNum)) return districtNum;
            }
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Error finding district from coordinates:", error);
    return null;
  }
}
