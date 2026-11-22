import { describe, expect, it } from "vitest";

import type { ActivityPayload } from "@/lib/activities";

import fixture from "./__fixtures__/oakland-clinton.json";
import { targetsGeoJson } from "./ActivityMap";

const targets = (fixture as unknown as ActivityPayload).figures.targets;

describe("targetsGeoJson", () => {
  it("makes one lon/lat point per located target with popup fields", () => {
    const fc = targetsGeoJson(targets);
    expect(fc.features).toHaveLength(targets.length);
    const first = fc.features[0];
    expect(first.geometry.coordinates).toEqual([targets[0].lon, targets[0].lat]);
    expect(first.properties).toMatchObject({ rank: 1, requests: targets[0].requests, since: "Jul 8, 2023" });
  });

  it("skips targets with no coordinates", () => {
    const fc = targetsGeoJson([{ ...targets[0], lat: null, lon: null }, targets[1]]);
    expect(fc.features).toHaveLength(1);
  });
});
