import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  WasteDetectorsData,
  DETECTOR_GROUPS,
  DATASETS,
} from "@/components/waste/waste-detectors-data";

// ---------------------------------------------------------------------------
// Expected counts — update these when you add/remove detectors or datasets.
//
// These act as a tripwire: if a backend detector is added but this file is
// not updated, the count-test fails and reminds you to add it here too.
// ---------------------------------------------------------------------------
const EXPECTED_DETECTOR_GROUPS = 6;
const EXPECTED_TOTAL_DETECTORS = 43;
const EXPECTED_TOTAL_DATASETS = 12;

// ---------------------------------------------------------------------------
// Backend Socrata IDs that the data_fetcher actually uses.  Keep in sync.
// ---------------------------------------------------------------------------
const EXPECTED_SOCRATA_IDS = new Set([
  "88g8-5mnd", // employee_compensation
  "n9pm-xkyq", // vendor_payments
  "cqi5-hm2d", // supplier_contracts
  "ebsh-uavg", // purchasing_commodity
  "g8m3-pdis", // registered_businesses
  "vw6y-z8j6", // 311_cases
  "xdgd-c79v", // budget
  "i98e-djp9", // building_permits
  "eshn-8t3a", // bid_opportunities
  "5f5n-tdbf", // lobbyist_activity
  "hfzb-bwts", // campaign_filers
  "2kdi-gwc2", // campaign_contributions
]);

// ===========================================================================
// 1. DATA INTEGRITY — catches stale or malformed registry entries
// ===========================================================================
describe("DETECTOR_GROUPS data integrity", () => {
  it("has the expected number of groups", () => {
    expect(DETECTOR_GROUPS.length).toBe(EXPECTED_DETECTOR_GROUPS);
  });

  it("has the expected total number of detectors", () => {
    const total = DETECTOR_GROUPS.reduce(
      (sum, g) => sum + g.detectors.length,
      0
    );
    expect(total).toBe(EXPECTED_TOTAL_DETECTORS);
  });

  it("every group has a non-empty category, label, and at least one detector", () => {
    for (const group of DETECTOR_GROUPS) {
      expect(group.category.length).toBeGreaterThan(0);
      expect(group.label.length).toBeGreaterThan(0);
      expect(group.detectors.length).toBeGreaterThan(0);
    }
  });

  it("every detector has non-empty id, name, and description", () => {
    for (const group of DETECTOR_GROUPS) {
      for (const d of group.detectors) {
        expect(d.id.length).toBeGreaterThan(0);
        expect(d.name.length).toBeGreaterThan(0);
        expect(d.description.length).toBeGreaterThan(20);
      }
    }
  });

  it("detector IDs are unique within each group", () => {
    for (const group of DETECTOR_GROUPS) {
      const ids = group.detectors.map((d) => d.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("group categories are unique", () => {
    const cats = DETECTOR_GROUPS.map((g) => g.category);
    expect(new Set(cats).size).toBe(cats.length);
  });
});

describe("DATASETS data integrity", () => {
  it("has the expected number of datasets", () => {
    expect(DATASETS.length).toBe(EXPECTED_TOTAL_DATASETS);
  });

  it("every dataset has non-empty id, socrataId, name, and description", () => {
    for (const ds of DATASETS) {
      expect(ds.id.length).toBeGreaterThan(0);
      expect(ds.socrataId.length).toBeGreaterThan(0);
      expect(ds.name.length).toBeGreaterThan(0);
      expect(ds.description.length).toBeGreaterThan(20);
    }
  });

  it("dataset IDs are unique", () => {
    const ids = DATASETS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("Socrata IDs are unique", () => {
    const ids = DATASETS.map((d) => d.socrataId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("Socrata IDs match expected backend data_fetcher IDs", () => {
    const uiIds = new Set(DATASETS.map((d) => d.socrataId));
    expect(uiIds).toEqual(EXPECTED_SOCRATA_IDS);
  });
});

// ===========================================================================
// 2. NEW-FLAG CONSISTENCY
// ===========================================================================
describe("isNew flags", () => {
  it("at least one detector is flagged as new", () => {
    const newDetectors = DETECTOR_GROUPS.flatMap((g) =>
      g.detectors.filter((d) => d.isNew)
    );
    expect(newDetectors.length).toBeGreaterThan(0);
  });

  it("at least one dataset is flagged as new", () => {
    const newDatasets = DATASETS.filter((d) => d.isNew);
    expect(newDatasets.length).toBeGreaterThan(0);
  });

  it("Personnel Integrity detectors are all flagged new", () => {
    const integrity = DETECTOR_GROUPS.find((g) => g.category === "integrity");
    expect(integrity).toBeDefined();
    for (const d of integrity!.detectors) {
      expect(d.isNew).toBe(true);
    }
  });

  it("Non-Profit detectors are all flagged new", () => {
    const nonprofit = DETECTOR_GROUPS.find((g) => g.category === "nonprofit");
    expect(nonprofit).toBeDefined();
    for (const d of nonprofit!.detectors) {
      expect(d.isNew).toBe(true);
    }
  });
});

// ===========================================================================
// 2b. ROADMAP-FLAG CONSISTENCY
// ===========================================================================
describe("isOnRoadmap flags", () => {
  it("at least one detector is flagged as on roadmap", () => {
    const roadmapDetectors = DETECTOR_GROUPS.flatMap((g) =>
      g.detectors.filter((d) => d.isOnRoadmap)
    );
    expect(roadmapDetectors.length).toBeGreaterThan(0);
  });

  it("roadmap detectors include Address Clustering, Fiscal Sponsor Opacity, and AG Registry Validation", () => {
    const roadmapNames = DETECTOR_GROUPS.flatMap((g) =>
      g.detectors.filter((d) => d.isOnRoadmap).map((d) => d.name)
    );
    expect(roadmapNames).toContain("Address Clustering");
    expect(roadmapNames).toContain("Fiscal Sponsor Opacity");
    expect(roadmapNames).toContain("AG Registry Validation");
  });

  it("roadmap detectors are also flagged as new", () => {
    const roadmapDetectors = DETECTOR_GROUPS.flatMap((g) =>
      g.detectors.filter((d) => d.isOnRoadmap)
    );
    for (const d of roadmapDetectors) {
      expect(d.isNew).toBe(true);
    }
  });
});

// ===========================================================================
// 3. RENDERING
// ===========================================================================
describe("WasteDetectorsData rendering", () => {
  it("renders both section headings", () => {
    render(<WasteDetectorsData />);

    expect(screen.getByText("Detectors")).toBeInTheDocument();
    expect(screen.getByText("Datasets")).toBeInTheDocument();
  });

  it("shows total detector count", () => {
    render(<WasteDetectorsData />);

    expect(screen.getByText(`${EXPECTED_TOTAL_DETECTORS} total`)).toBeInTheDocument();
  });

  it("shows total dataset count", () => {
    render(<WasteDetectorsData />);

    expect(
      screen.getByText(`${EXPECTED_TOTAL_DATASETS} sources`)
    ).toBeInTheDocument();
  });

  it("renders all detector group names", () => {
    render(<WasteDetectorsData />);

    for (const group of DETECTOR_GROUPS) {
      expect(screen.getByText(group.label)).toBeInTheDocument();
    }
  });

  it("renders all dataset names", () => {
    render(<WasteDetectorsData />);

    for (const ds of DATASETS) {
      expect(screen.getByText(ds.name)).toBeInTheDocument();
    }
  });

  it("renders the disclaimer footer", () => {
    render(<WasteDetectorsData />);

    expect(
      screen.getByText(/anomalies are statistical patterns/i)
    ).toBeInTheDocument();
  });
});

// ===========================================================================
// 4. INTERACTION — collapsible groups and items
// ===========================================================================
describe("WasteDetectorsData interactions", () => {
  it("expands a detector group on click to reveal detector names", async () => {
    const user = userEvent.setup();
    render(<WasteDetectorsData />);

    const firstGroup = DETECTOR_GROUPS[0];
    const groupButton = screen.getByText(firstGroup.label);

    expect(screen.queryByText(firstGroup.detectors[0].name)).not.toBeInTheDocument();

    await user.click(groupButton);

    expect(screen.getByText(firstGroup.detectors[0].name)).toBeInTheDocument();
  });

  it("collapses a detector group on second click", async () => {
    const user = userEvent.setup();
    render(<WasteDetectorsData />);

    const firstGroup = DETECTOR_GROUPS[0];
    const groupButton = screen.getByText(firstGroup.label);

    await user.click(groupButton);
    expect(screen.getByText(firstGroup.detectors[0].name)).toBeInTheDocument();

    await user.click(groupButton);
    expect(screen.queryByText(firstGroup.detectors[0].name)).not.toBeInTheDocument();
  });

  it("expands a detector item to show its description", async () => {
    const user = userEvent.setup();
    render(<WasteDetectorsData />);

    const firstGroup = DETECTOR_GROUPS[0];
    const firstDetector = firstGroup.detectors[0];

    await user.click(screen.getByText(firstGroup.label));

    expect(screen.queryByText(firstDetector.description)).not.toBeInTheDocument();

    await user.click(screen.getByText(firstDetector.name));

    expect(screen.getByText(firstDetector.description)).toBeInTheDocument();
  });

  it("expands a dataset item to show its description", async () => {
    const user = userEvent.setup();
    render(<WasteDetectorsData />);

    const firstDataset = DATASETS[0];

    expect(screen.queryByText(firstDataset.description)).not.toBeInTheDocument();

    await user.click(screen.getByText(firstDataset.name));

    expect(screen.getByText(firstDataset.description)).toBeInTheDocument();
  });

  it("shows NEW badge for new detectors when group is expanded", async () => {
    const user = userEvent.setup();
    render(<WasteDetectorsData />);

    const integrityGroup = DETECTOR_GROUPS.find((g) => g.category === "integrity")!;
    await user.click(screen.getByText(integrityGroup.label));

    const newBadges = screen.getAllByText("New");
    expect(newBadges.length).toBeGreaterThan(0);
  });
});
