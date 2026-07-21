"use client";

/**
 * MetricChainView
 *
 * Renders the causal process chain ("Why did this change?") for a metric:
 *
 *  1. Funnel row: each stage with PoP values and divergence flags
 *  2. Decomposition waterfall: volume / mix / rate attribution for the
 *     edge(s) upstream of the focused metric
 *
 * Data is fetched on first render and cached for the session.  Returns null
 * (renders nothing) when the metric does not belong to any chain or when the
 * API returns a 404.
 *
 * NOTE on causal language: these relationships are arithmetic accounting
 * within an administrative process — not proof of real-world causation.
 * See docs/SEYMOUR_VOICE_CHARTER.md §10.
 */

import React, { useEffect, useState } from "react";
import {
  ChainDecompositionResponse,
  ChainResponse,
  ChainStageValue,
  getMetricChain,
  getMetricChainDecomposition,
} from "@/lib/publicApiClient";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPct(v: number | null | undefined): string {
  if (v == null) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${Math.round(Math.abs(v))}%`;
}

function formatVal(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatConvRate(v: number | null | undefined): string {
  if (v == null) return "—";
  const pct = v * 100;
  return `${pct.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StageArrow() {
  return (
    <div className="chain-stage-arrow" aria-hidden>
      →
    </div>
  );
}

function StageCard({ stage, isFocused }: { stage: ChainStageValue; isFocused: boolean }) {
  const hasChange =
    stage.current_value !== null && stage.prior_value !== null;
  const pctAbs =
    stage.percent_change !== null ? Math.abs(stage.percent_change) : null;
  const direction =
    stage.absolute_change !== null
      ? stage.absolute_change >= 0
        ? "up"
        : "down"
      : null;

  return (
    <div
      className={[
        "chain-stage-card",
        isFocused ? "chain-stage-card--focused" : "",
        stage.divergence_flag ? "chain-stage-card--divergence" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="chain-stage-name">{stage.metric_name}</div>

      {hasChange && (
        <div className="chain-stage-values">
          <span className="chain-stage-current">
            {formatVal(stage.current_value)}
          </span>
          <span
            className={[
              "chain-stage-delta",
              direction === "up"
                ? "chain-stage-delta--up"
                : direction === "down"
                  ? "chain-stage-delta--down"
                  : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {direction === "up" ? "▲" : direction === "down" ? "▼" : ""}
            {pctAbs !== null ? ` ${Math.round(pctAbs)}%` : ""}
          </span>
        </div>
      )}

      {stage.conversion_rate_current !== null && (
        <div className="chain-stage-rate">
          Rate: {formatConvRate(stage.conversion_rate_current)}
          {stage.conversion_rate_change !== null && (
            <span
              className={
                stage.conversion_rate_change >= 0
                  ? "chain-rate-up"
                  : "chain-rate-down"
              }
            >
              {" "}
              ({stage.conversion_rate_change >= 0 ? "+" : ""}
              {(stage.conversion_rate_change * 100).toFixed(1)}pp)
            </span>
          )}
        </div>
      )}

      {stage.divergence_flag && (
        <div className="chain-stage-divergence-badge" title={stage.divergence_note ?? ""}>
          ⚑ Divergence
        </div>
      )}
    </div>
  );
}

function DecompositionWaterfall({
  decomp,
  stageNames,
}: {
  decomp: ChainDecompositionResponse;
  stageNames: Map<number, string>;
}) {
  if (!decomp.edges || decomp.edges.length === 0) return null;

  return (
    <div className="chain-decomp-section">
      <h3 className="chain-decomp-title">What accounts for this change?</h3>
      <p className="chain-decomp-caption">
        The arithmetic decomposition below shows how changes at each upstream stage
        account for movement in the metric below it. This is process accounting, not
        proof of causation.
      </p>

      {decomp.edges.map((edge) => {
        const srcName = stageNames.get(edge.source_metric_id) ?? `Metric ${edge.source_metric_id}`;
        const tgtName = stageNames.get(edge.target_metric_id) ?? `Metric ${edge.target_metric_id}`;

        if (edge.attribution_suppressed) {
          return (
            <div key={`${edge.source_metric_id}-${edge.target_metric_id}`} className="chain-edge-block">
              <div className="chain-edge-label">
                {srcName} → {tgtName}
              </div>
              <p className="chain-edge-suppressed">
                Detailed attribution not available: {edge.suppression_reason}
              </p>
            </div>
          );
        }

        const maxAbs = Math.max(
          ...edge.terms.map((t) => Math.abs(t.value)),
          1
        );

        return (
          <div key={`${edge.source_metric_id}-${edge.target_metric_id}`} className="chain-edge-block">
            <div className="chain-edge-label">
              {srcName} → {tgtName}
            </div>

            <div className="chain-waterfall">
              {edge.terms.map((term) => {
                const barPct = (Math.abs(term.value) / maxAbs) * 100;
                const positive = term.value >= 0;
                return (
                  <div key={term.term} className="chain-waterfall-row">
                    <div className="chain-waterfall-label">{term.label}</div>
                    <div className="chain-waterfall-bar-wrap">
                      <div
                        className={[
                          "chain-waterfall-bar",
                          positive
                            ? "chain-waterfall-bar--positive"
                            : "chain-waterfall-bar--negative",
                        ].join(" ")}
                        style={{ width: `${Math.max(barPct, 2)}%` }}
                      />
                    </div>
                    <div className="chain-waterfall-value">
                      {positive ? "+" : ""}
                      {formatVal(term.value)}
                      {term.percent_of_change !== null && (
                        <span className="chain-waterfall-pct">
                          {" "}
                          ({Math.round(term.percent_of_change)}% of change)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Top category contributions when available */}
            {edge.category_breakdown && edge.category_breakdown.length > 0 && (
              <details className="chain-category-details">
                <summary className="chain-category-summary">
                  Category breakdown ({edge.category_field})
                </summary>
                <table className="chain-category-table">
                  <thead>
                    <tr>
                      <th>{edge.category_field}</th>
                      <th>Volume contrib.</th>
                      <th>Rate contrib.</th>
                      <th>Rate (curr)</th>
                      <th>Rate (prior)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {edge.category_breakdown.slice(0, 10).map((cat) => (
                      <tr key={cat.category_value}>
                        <td>{cat.category_value}</td>
                        <td>{formatVal(cat.volume_contribution)}</td>
                        <td>{formatVal(cat.rate_contribution)}</td>
                        <td>{formatConvRate(cat.rate_current)}</td>
                        <td>{formatConvRate(cat.rate_prior)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface MetricChainViewProps {
  metricId: number;
  comparisonType?: "ytd" | "mtd" | "mtd_prior_year";
  district?: number | null;
}

export default function MetricChainView({
  metricId,
  comparisonType = "ytd",
  district = null,
}: MetricChainViewProps) {
  const [chain, setChain] = useState<ChainResponse | null>(null);
  const [decomp, setDecomp] = useState<ChainDecompositionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setChain(null);
    setDecomp(null);

    async function load() {
      const [chainData, decompData] = await Promise.all([
        getMetricChain(metricId, { comparisonType, district }),
        getMetricChainDecomposition(metricId, { comparisonType, district }),
      ]);
      if (!cancelled) {
        setChain(chainData);
        setDecomp(decompData);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [metricId, comparisonType, district]);

  if (loading) {
    return null; // silent while loading — section appears or not
  }

  if (!chain || chain.stages.length < 2) {
    return null; // metric not in a chain
  }

  const stageNames = new Map(chain.stages.map((s) => [s.metric_id, s.metric_name]));

  return (
    <div className="metric-chain-view">
      <h2 className="metric-section-title">Why did this change?</h2>

      {chain.has_divergence && (
        <div className="chain-divergence-banner">
          <strong>Divergence detected.</strong>{" "}
          {chain.stages
            .filter((s) => s.divergence_flag)
            .map((s) => s.divergence_note)
            .filter(Boolean)
            .join(" ")}
          {" "}The math is consistent with a category-mix shift or a change in conversion rates
          at one or more stages.
        </div>
      )}

      {/* Funnel row */}
      <div className="chain-funnel">
        {chain.stages.map((stage, idx) => (
          <React.Fragment key={stage.metric_id}>
            <StageCard stage={stage} isFocused={stage.metric_id === metricId} />
            {idx < chain.stages.length - 1 && <StageArrow />}
          </React.Fragment>
        ))}
      </div>

      <p className="chain-accounting-note">
        Each arrow represents a process conversion rate (e.g. arrests ÷ incidents). Values
        shown are period-over-period changes. This is arithmetic accounting within the
        administrative process — not a claim of real-world causation.
      </p>

      {/* Decomposition waterfall */}
      {decomp && <DecompositionWaterfall decomp={decomp} stageNames={stageNames} />}
    </div>
  );
}
