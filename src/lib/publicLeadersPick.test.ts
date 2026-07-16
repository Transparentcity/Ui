import { describe, expect, it } from "vitest";
import type { PublicLeader } from "@/lib/publicApiClient";
import {
  pickDistrictSupervisorFromPublicLeaders,
  pickMayorFromPublicLeaders,
} from "@/lib/publicLeadersPick";

function L(
  partial: Pick<PublicLeader, "name" | "title" | "district"> & Partial<PublicLeader>
): PublicLeader {
  return {
    id: partial.id ?? 1,
    city_id: partial.city_id ?? 1,
    name: partial.name,
    title: partial.title,
    district: partial.district ?? null,
  };
}

describe("pickMayorFromPublicLeaders", () => {
  it("prefers citywide leader whose title mentions mayor", () => {
    const leaders: PublicLeader[] = [
      L({ name: "Lee, Jane", title: "Supervisor", district: 3 }),
      L({ name: "Doe, John", title: "Mayor", district: 0 }),
    ];
    expect(pickMayorFromPublicLeaders(leaders)?.name).toBe("Doe, John");
  });

  it("falls back to first citywide leader", () => {
    const leaders: PublicLeader[] = [
      L({ name: "Other, Pat", title: "Clerk", district: 2 }),
      L({ name: "Solo, City", title: "Executive", district: null }),
    ];
    expect(pickMayorFromPublicLeaders(leaders)?.name).toBe("Solo, City");
  });

  it("prefers mayor over at-large councilmembers with null district (Cincinnati legacy)", () => {
    const leaders: PublicLeader[] = [
      L({ name: "Anna Albi", title: "Councilmember", district: null }),
      L({ name: "Evan Nolan", title: "Councilmember", district: null }),
      L({ name: "Aftab Pureval", title: "Mayor", district: 0 }),
    ];
    expect(pickMayorFromPublicLeaders(leaders)?.name).toBe("Aftab Pureval");
  });

  it("ignores at-large council district -1 when picking mayor", () => {
    const leaders: PublicLeader[] = [
      L({ name: "Anna Albi", title: "Councilmember", district: -1 }),
      L({ name: "Aftab Pureval", title: "Mayor", district: 0 }),
    ];
    expect(pickMayorFromPublicLeaders(leaders)?.name).toBe("Aftab Pureval");
  });

  it("prefers explicit district 0 over null-district rows when no title matches", () => {
    const leaders: PublicLeader[] = [
      L({ name: "At Large, Ann", title: "Councilmember", district: null }),
      L({ name: "Citywide, Carl", title: "Clerk", district: 0 }),
    ];
    expect(pickMayorFromPublicLeaders(leaders)?.name).toBe("Citywide, Carl");
  });
});

describe("pickDistrictSupervisorFromPublicLeaders", () => {
  it("returns first leader for that district", () => {
    const leaders: PublicLeader[] = [
      L({ name: "A", title: "Sup", district: 5 }),
      L({ name: "B", title: "Alt", district: 5 }),
    ];
    expect(pickDistrictSupervisorFromPublicLeaders(leaders, 5)?.name).toBe("A");
  });

  it("returns null for citywide district", () => {
    const leaders: PublicLeader[] = [L({ name: "M", title: "Mayor", district: 0 })];
    expect(pickDistrictSupervisorFromPublicLeaders(leaders, 0)).toBeNull();
  });
});
