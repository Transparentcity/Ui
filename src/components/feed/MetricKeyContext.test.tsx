import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { MetricKeyProvider, useMetricKey } from "./MetricKeyContext";

function wrapper(metrics: Array<{ metric_name: string; metric_key: string }>) {
  return function MetricKeyTestWrapper({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return <MetricKeyProvider metrics={metrics}>{children}</MetricKeyProvider>;
  };
}

describe("MetricKeyContext", () => {
  it("resolves a metric key by exact display name", () => {
    const { result } = renderHook(() => useMetricKey(), {
      wrapper: wrapper([
        { metric_name: "Crime Rate", metric_key: "crime-rate" },
      ]),
    });
    expect(result.current.resolveMetricKey("Crime Rate")).toBe("crime-rate");
  });

  it("resolves case-insensitively", () => {
    const { result } = renderHook(() => useMetricKey(), {
      wrapper: wrapper([
        { metric_name: "Response Time", metric_key: "response-time" },
      ]),
    });
    expect(result.current.resolveMetricKey("response time")).toBe("response-time");
    expect(result.current.resolveMetricKey("RESPONSE TIME")).toBe("response-time");
  });

  it("trims whitespace from both stored names and lookups", () => {
    const { result } = renderHook(() => useMetricKey(), {
      wrapper: wrapper([
        { metric_name: "  Crime Rate  ", metric_key: "crime-rate" },
      ]),
    });
    expect(result.current.resolveMetricKey("Crime Rate")).toBe("crime-rate");
    expect(result.current.resolveMetricKey("  Crime Rate  ")).toBe("crime-rate");
  });

  it("returns null for unknown metric names", () => {
    const { result } = renderHook(() => useMetricKey(), {
      wrapper: wrapper([
        { metric_name: "Crime Rate", metric_key: "crime-rate" },
      ]),
    });
    expect(result.current.resolveMetricKey("Unknown Metric")).toBeNull();
  });

  it("returns null when no provider wraps the hook", () => {
    const { result } = renderHook(() => useMetricKey());
    expect(result.current.resolveMetricKey("Crime Rate")).toBeNull();
  });

  it("handles empty metrics array", () => {
    const { result } = renderHook(() => useMetricKey(), {
      wrapper: wrapper([]),
    });
    expect(result.current.resolveMetricKey("Anything")).toBeNull();
  });

  it("skips entries with empty metric_name or metric_key", () => {
    const { result } = renderHook(() => useMetricKey(), {
      wrapper: wrapper([
        { metric_name: "", metric_key: "empty-name" },
        { metric_name: "Has Key", metric_key: "" },
        { metric_name: "Valid", metric_key: "valid" },
      ]),
    });
    expect(result.current.resolveMetricKey("")).toBeNull();
    expect(result.current.resolveMetricKey("Has Key")).toBeNull();
    expect(result.current.resolveMetricKey("Valid")).toBe("valid");
  });

  it("resolves among multiple metrics", () => {
    const { result } = renderHook(() => useMetricKey(), {
      wrapper: wrapper([
        { metric_name: "Crime Rate", metric_key: "crime-rate" },
        { metric_name: "Response Time", metric_key: "response-time" },
        { metric_name: "Homelessness", metric_key: "homelessness" },
      ]),
    });
    expect(result.current.resolveMetricKey("Crime Rate")).toBe("crime-rate");
    expect(result.current.resolveMetricKey("response time")).toBe("response-time");
    expect(result.current.resolveMetricKey("Homelessness")).toBe("homelessness");
  });
});
