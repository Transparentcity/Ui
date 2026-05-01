"use client";

import { useEffect, useRef, useState } from "react";
import { useDeferredVisualizationIframes } from "@/lib/useDeferredVisualizationIframes";

type Props = {
  html: string;
  className?: string;
};

type SourceModalState = {
  label: string;
  url: string;
  description: string;
  mapHash?: string;
  chartId?: string;
  anomalyId?: string;
  loading?: boolean;
  sourceInfo?: {
    dataset_id?: string | null;
    dataset_name?: string | null;
    dataset_url?: string | null;
    query_url?: string | null;
    query_text?: string | null;
    city_name?: string | null;
    city_portal_url?: string | null;
    city_portal_domain?: string | null;
  } | null;
  error?: string | null;
};

type VisualizationMetadataResponse = {
  title?: string | null;
  description?: string | null;
  object_name?: string | null;
  metric_name?: string | null;
  chart_payload?: {
    subtitle?: string | null;
  } | null;
  metadata?: {
    chart_title?: string | null;
    object_name?: string | null;
    caption?: string | null;
  } | null;
};

function firstTrimmedString(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function applyEmbedChrome(embed: HTMLElement, title: string, subtitle: string): void {
  if (!title && !subtitle) return;

  if (title) {
    let copyEl = embed.querySelector<HTMLElement>(".viz-embed-copy");
    if (!copyEl) {
      copyEl = document.createElement("div");
      copyEl.className = "viz-embed-copy";
      embed.insertBefore(copyEl, embed.firstChild);
    }
    let titleEl = copyEl.querySelector<HTMLElement>(".viz-embed-title");
    if (!titleEl) {
      titleEl = document.createElement("div");
      titleEl.className = "viz-embed-title";
      copyEl.insertBefore(titleEl, copyEl.firstChild);
    }
    titleEl.textContent = title;
  }

  if (subtitle) {
    let footerEl = embed.querySelector<HTMLElement>(".viz-embed-footer");
    if (!footerEl) {
      footerEl = document.createElement("div");
      footerEl.className = "viz-embed-footer";
      const iframe = embed.querySelector("iframe");
      iframe?.insertAdjacentElement("afterend", footerEl);
    }
    let captionEl = footerEl.querySelector<HTMLElement>(".viz-embed-caption");
    if (!captionEl) {
      captionEl = document.createElement("div");
      captionEl.className = "viz-embed-caption";
      footerEl.insertBefore(captionEl, footerEl.firstChild);
    }
    captionEl.textContent = subtitle;
  }
}

/**
 * Renders HTML from {@link processVisualizationShortcodes} and wires deferred
 * interactive iframes (see `viz-deferred-interactive` in visualization shortcodes).
 */
export function VisualizationDeferredInteractiveContainer({
  html,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [sourceModal, setSourceModal] = useState<SourceModalState | null>(null);
  useDeferredVisualizationIframes(ref, [html]);
  const primarySourceUrl =
    sourceModal?.sourceInfo?.dataset_url ||
    sourceModal?.sourceInfo?.query_url ||
    sourceModal?.url ||
    "";
  const primarySourceLabel =
    sourceModal?.sourceInfo?.dataset_name ||
    sourceModal?.sourceInfo?.dataset_id ||
    sourceModal?.label ||
    "the source dataset";

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>(".viz-embed-source-button");
      if (!button) return;
      event.preventDefault();
      setSourceModal({
        label: button.dataset.vizSourceLabel || "Source",
        url: button.dataset.vizSourceUrl || "",
        mapHash: button.dataset.vizSourceMapHash || "",
        chartId: button.dataset.vizSourceChartId || "",
        anomalyId: button.dataset.vizSourceAnomalyId || "",
        description:
          button.dataset.vizSourceDescription ||
          "Open the original public data source.",
        loading: Boolean(
          button.dataset.vizSourceMapHash ||
            button.dataset.vizSourceChartId ||
            button.dataset.vizSourceAnomalyId,
        ),
      });
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [html]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const cleanups: (() => void)[] = [];
    root
      .querySelectorAll<HTMLElement>(
        ".map-embed[data-map-hash], .chart-embed[data-chart-id], .anomaly-embed[data-anomaly-id]",
      )
      .forEach((embed) => {
        if (embed.dataset.vizMetadataHydrated === "true") return;
        const mapHash = embed.dataset.mapHash;
        const chartId = embed.dataset.chartId;
        const anomalyId = embed.dataset.anomalyId;
        const sourcePath = mapHash
          ? `/api/maps/public/${encodeURIComponent(mapHash)}`
          : chartId
            ? `/api/time-series/public/${encodeURIComponent(chartId)}`
            : anomalyId
              ? `/api/anomalies/public/result/${encodeURIComponent(anomalyId)}`
              : "";
        if (!sourcePath) return;
        embed.dataset.vizMetadataHydrated = "true";

        let cancelled = false;
        fetch(sourcePath)
          .then(async (response) => {
            if (!response.ok) return null;
            return (await response.json()) as VisualizationMetadataResponse;
          })
          .then((visualization) => {
            if (cancelled || !visualization) return;
            const title = firstTrimmedString(
              visualization.title,
              visualization.metadata?.chart_title,
              visualization.metadata?.object_name,
              visualization.object_name,
              visualization.metric_name,
            );
            const subtitle = firstTrimmedString(
              visualization.description,
              visualization.metadata?.caption,
              visualization.chart_payload?.subtitle,
            );
            applyEmbedChrome(embed, title, subtitle);
          })
          .catch(() => {
            // Keep server-rendered fallback text when metadata is unavailable.
          });

        cleanups.push(() => {
          cancelled = true;
        });
      });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [html]);

  useEffect(() => {
    const mapHash = sourceModal?.mapHash;
    const chartId = sourceModal?.chartId;
    const anomalyId = sourceModal?.anomalyId;
    if (!sourceModal?.loading || (!mapHash && !chartId && !anomalyId)) return;
    let cancelled = false;
    const sourcePath = mapHash
      ? `/api/maps/public/${encodeURIComponent(mapHash)}`
      : chartId
        ? `/api/time-series/public/${encodeURIComponent(chartId)}`
        : `/api/anomalies/public/result/${encodeURIComponent(anomalyId || "")}`;
    const sourceKey = mapHash || chartId || anomalyId || "";

    fetch(sourcePath)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Source request failed: ${response.status}`);
        }
        return (await response.json()) as {
          query_source?: string | null;
          metadata?: {
            executed_query_url?: string | null;
            source_info?: SourceModalState["sourceInfo"];
          } | null;
          source_info?: SourceModalState["sourceInfo"];
        };
      })
      .then((visualization) => {
        if (cancelled) return;
        const info =
          visualization.source_info ||
          visualization.metadata?.source_info ||
          (visualization.metadata?.executed_query_url
            ? { query_url: visualization.metadata.executed_query_url }
            : visualization.query_source
              ? { query_text: visualization.query_source }
              : null);
        setSourceModal((current) =>
          current &&
          (current.mapHash || current.chartId || current.anomalyId) === sourceKey
            ? { ...current, loading: false, sourceInfo: info, error: null }
            : current,
        );
      })
      .catch(() => {
        if (cancelled) return;
        setSourceModal((current) =>
          current &&
          (current.mapHash || current.chartId || current.anomalyId) === sourceKey
            ? {
                ...current,
                loading: false,
                sourceInfo: null,
                error: "Source information is not available for this visualization.",
              }
            : current,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    sourceModal?.loading,
    sourceModal?.mapHash,
    sourceModal?.chartId,
    sourceModal?.anomalyId,
  ]);

  return (
    <>
      <div
        ref={ref}
        className={className}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {sourceModal ? (
        <div
          className="viz-source-modal-backdrop"
          role="presentation"
          onClick={() => setSourceModal(null)}
        >
          <div
            className="viz-source-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="viz-source-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="viz-source-modal-close"
              aria-label="Close source information"
              onClick={() => setSourceModal(null)}
            >
              x
            </button>
            <p className="viz-source-modal-eyebrow">Data Source</p>
            <h2 id="viz-source-modal-title">Where this data came from</h2>
            <p>
              This visualization is built from public records. Use the source
              link below to open the original dataset or API request behind the
              map/chart.
            </p>
            {sourceModal.loading ? (
              <p>Loading source information...</p>
            ) : null}
            {sourceModal.error ? <p>{sourceModal.error}</p> : null}
            {primarySourceUrl ? (
              <a
                href={primarySourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="viz-source-modal-primary-link"
              >
                Open source data
              </a>
            ) : null}
            {sourceModal.sourceInfo ? (
              <div className="viz-source-modal-details">
                {(sourceModal.sourceInfo.city_name ||
                  sourceModal.sourceInfo.city_portal_url ||
                  sourceModal.sourceInfo.city_portal_domain) ? (
                  <div className="viz-source-modal-row">
                    <span>City Portal</span>
                    {sourceModal.sourceInfo.city_portal_url ? (
                      <a
                        href={sourceModal.sourceInfo.city_portal_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {sourceModal.sourceInfo.city_name
                          ? `${sourceModal.sourceInfo.city_name}${
                              sourceModal.sourceInfo.city_portal_domain
                                ? ` (${sourceModal.sourceInfo.city_portal_domain})`
                                : ""
                            }`
                          : sourceModal.sourceInfo.city_portal_domain ||
                            sourceModal.sourceInfo.city_portal_url}
                      </a>
                    ) : (
                      <strong>
                        {sourceModal.sourceInfo.city_name ||
                          sourceModal.sourceInfo.city_portal_domain}
                      </strong>
                    )}
                  </div>
                ) : null}
                {(sourceModal.sourceInfo.dataset_name ||
                  sourceModal.sourceInfo.dataset_id) ? (
                  <div className="viz-source-modal-row">
                    <span>Original Dataset</span>
                    {sourceModal.sourceInfo.dataset_url ? (
                      <a
                        href={sourceModal.sourceInfo.dataset_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {sourceModal.sourceInfo.dataset_name ||
                          sourceModal.sourceInfo.dataset_id}
                      </a>
                    ) : (
                      <strong>
                        {sourceModal.sourceInfo.dataset_name ||
                          sourceModal.sourceInfo.dataset_id}
                      </strong>
                    )}
                  </div>
                ) : null}
                {sourceModal.sourceInfo.dataset_id &&
                sourceModal.sourceInfo.dataset_name ? (
                  <div className="viz-source-modal-row">
                    <span>Dataset ID</span>
                    <code>{sourceModal.sourceInfo.dataset_id}</code>
                  </div>
                ) : null}
                {sourceModal.sourceInfo.query_url ? (
                  <div className="viz-source-modal-row">
                    <span>API Request</span>
                    <a
                      href={sourceModal.sourceInfo.query_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {sourceModal.sourceInfo.query_url}
                    </a>
                  </div>
                ) : null}
                {sourceModal.sourceInfo.query_text ? (
                  <div className="viz-source-modal-query">
                    <span>Query Used</span>
                    <pre>{sourceModal.sourceInfo.query_text}</pre>
                  </div>
                ) : null}
              </div>
            ) : null}
            {!sourceModal.loading && !primarySourceUrl ? (
              <p>
                We could not find a direct dataset URL for this visualization,
                but the source details above show the available provenance.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
