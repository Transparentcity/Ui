import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

type PlotProps = { layout: { shapes?: unknown[]; annotations?: unknown[] } };
const plotCalls: PlotProps[] = [];

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockPlot(props: PlotProps) {
      plotCalls.push(props);
      return <div data-testid="plot" />;
    },
}));

vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light" }),
}));

import TimeSeriesChart, { type TimeSeriesDataPoint } from "./TimeSeriesChart";

const lastYear = new Date().getFullYear() - 1;
const data: TimeSeriesDataPoint[] = Array.from({ length: 12 }, (_, i) => ({
  time_period: `${lastYear}-${String(i + 1).padStart(2, "0")}-01`,
  numeric_value: 80 + i,
}));
const target = [{ y: 90, label: "Legal standard: ≥ 90.0%" }];

function lastLayout() {
  return plotCalls[plotCalls.length - 1].layout;
}

beforeEach(() => {
  plotCalls.length = 0;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

describe("TimeSeriesChart reference lines", () => {
  it("draws the target line in the monthly view", () => {
    render(<TimeSeriesChart data={data} defaultPeriod="month" referenceLines={target} />);
    expect(lastLayout().shapes).toHaveLength(1);
  });

  it("hides the target line when switched to the YTD view", () => {
    render(<TimeSeriesChart data={data} defaultPeriod="month" referenceLines={target} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ytd" } });
    expect(lastLayout().shapes ?? []).toHaveLength(0);
    expect(lastLayout().annotations ?? []).not.toContainEqual(
      expect.objectContaining({ text: target[0].label })
    );
  });

  it("drops the YTD option and never opens on it when hideYtdPeriod is set", () => {
    render(
      <TimeSeriesChart data={data} defaultPeriod="ytd" referenceLines={target} hideYtdPeriod />
    );
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).not.toContain("ytd");
    expect(select.value).toBe("month");
    expect(lastLayout().shapes).toHaveLength(1);
  });

  it("offers only the allowed periods and opens on one of them", () => {
    render(
      <TimeSeriesChart
        data={data}
        defaultPeriod="year"
        referenceLines={target}
        hideYtdPeriod
        allowedPeriods={["month"]}
      />
    );
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["month"]);
    expect(select.value).toBe("month");
  });

  it("still offers YTD by default", () => {
    render(<TimeSeriesChart data={data} defaultPeriod="month" />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toContain("ytd");
  });
});
