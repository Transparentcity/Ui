"use client";

/**
 * MetricAssetLinks — "Share & embed" section of the Metric drawer.
 *
 * Lists the metric's public page plus every public chart, saved map, and
 * current anomaly with its canonical URL, iframe embed code, and story
 * shortcode, so city leads can grab permalink assets without hunting.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { OpsMetricAssetLink, OpsMetricAssetLinks } from "@/lib/apiClient";
import {
  absoluteUrl,
  EMBED_HEIGHTS,
  iframeSnippet,
  shareOrigin,
  type MetricAssetKind,
} from "@/lib/metricAssetLinks";
import styles from "./CitySite.module.css";

type Tab = "charts" | "maps" | "anomalies";

const TAB_KIND: Record<Tab, MetricAssetKind> = {
  charts: "chart",
  maps: "map",
  anomalies: "anomaly",
};

const TAB_LABEL: Record<Tab, string> = {
  charts: "Charts",
  maps: "Maps",
  anomalies: "Anomalies",
};

const EMPTY_COPY: Record<Tab, string> = {
  charts: "No active charts yet. Charts appear after the metric runs.",
  maps: "No public saved maps for this metric.",
  anomalies: "No anomalies flagged in the current run.",
};

function copy(text: string, what: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${what} copied`),
    () => toast.error(`Could not copy ${what.toLowerCase()}`),
  );
}

interface AssetRowProps {
  asset: OpsMetricAssetLink;
  kind: MetricAssetKind;
  previewing: boolean;
  onTogglePreview: () => void;
}

function AssetRow({ asset, kind, previewing, onTogglePreview }: AssetRowProps) {
  return (
    <div className={styles.assetLinkRow}>
      <div className={styles.assetLinkHead}>
        <div className={styles.assetLinkText}>
          <a
            href={asset.page_path}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.assetLinkTitle}
          >
            {asset.title}
          </a>
          {asset.subtitle && <span className={styles.assetLinkSub}>{asset.subtitle}</span>}
          <code className={styles.assetLinkPath} title={asset.page_path}>
            {asset.page_path}
          </code>
        </div>
        <div className={styles.assetLinkActions}>
          <button
            type="button"
            className={styles.linkBtn}
            title="Copy the canonical public URL"
            onClick={() => copy(absoluteUrl(asset.page_path, shareOrigin()), "Link")}
          >
            🔗 Link
          </button>
          <button
            type="button"
            className={styles.linkBtn}
            title="Copy an <iframe> snippet for websites and newsletters"
            onClick={() =>
              copy(iframeSnippet(asset.embed_path, asset.title, kind, shareOrigin()), "Embed code")
            }
          >
            {"</>"} Embed
          </button>
          <button
            type="button"
            className={styles.linkBtn}
            title={`Copy ${asset.shortcode} for Transparent.city stories`}
            onClick={() => copy(asset.shortcode, "Shortcode")}
          >
            [ ] Shortcode
          </button>
          <button
            type="button"
            className={`${styles.linkBtn} ${previewing ? styles.linkBtnActive : ""}`}
            aria-pressed={previewing}
            onClick={onTogglePreview}
          >
            {previewing ? "Hide" : "Preview"}
          </button>
        </div>
      </div>
      {previewing && (
        <iframe
          src={asset.embed_path}
          title={asset.title}
          className={styles.assetPreview}
          style={{ height: EMBED_HEIGHTS[kind] }}
          loading="lazy"
        />
      )}
    </div>
  );
}

interface MetricAssetLinksProps {
  permalink: string | null;
  links: OpsMetricAssetLinks;
  /** Full counts; the lists may be capped server-side. */
  totals: Record<Tab, number>;
  /** Template ID — when set, shows a link to the cross-city comparison page. */
  templateId?: number | null;
}

export default function MetricAssetLinks({ permalink, links, totals, templateId }: MetricAssetLinksProps) {
  const [tab, setTab] = useState<Tab>(
    links.charts.length ? "charts" : links.maps.length ? "maps" : links.anomalies.length ? "anomalies" : "charts",
  );
  const [district, setDistrict] = useState<number | "all">("all");
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  const chartDistricts = useMemo(
    () =>
      Array.from(new Set(links.charts.map((c) => c.district ?? 0))).sort((a, b) => a - b),
    [links.charts],
  );

  const items = useMemo(() => {
    const list = links[tab];
    if (tab !== "charts" || district === "all") return list;
    return list.filter((c) => (c.district ?? 0) === district);
  }, [links, tab, district]);

  return (
    <div className={styles.drawerSection}>
      <h3 className={styles.sectionTitle}>Share &amp; embed</h3>

      {permalink && (
        <div className={styles.assetLinkRow}>
          <div className={styles.assetLinkHead}>
            <div className={styles.assetLinkText}>
              <span className={styles.assetLinkTitle}>Metric page</span>
              <code className={styles.assetLinkPath} title={permalink}>
                {permalink}
              </code>
            </div>
            <div className={styles.assetLinkActions}>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => copy(absoluteUrl(permalink, shareOrigin()), "Link")}
              >
                🔗 Copy link
              </button>
              <a
                href={permalink}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkBtn}
              >
                ↗ Open public page
              </a>
            </div>
          </div>
        </div>
      )}

      {templateId != null && (
        <div className={styles.assetLinkRow}>
          <div className={styles.assetLinkHead}>
            <div className={styles.assetLinkText}>
              <span className={styles.assetLinkTitle}>Cross-city comparison</span>
              <code className={styles.assetLinkPath}>/cross-city/{templateId}</code>
            </div>
            <div className={styles.assetLinkActions}>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => copy(absoluteUrl(`/cross-city/${templateId}`, shareOrigin()), "Link")}
              >
                🔗 Copy link
              </button>
              <a
                href={`/cross-city/${templateId}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkBtn}
              >
                ↗ Open
              </a>
            </div>
          </div>
        </div>
      )}

      <div className={styles.assetTabs} role="tablist">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`${styles.assetTab} ${tab === t ? styles.assetTabActive : ""}`}
            onClick={() => {
              setTab(t);
              setPreviewKey(null);
            }}
          >
            {TAB_LABEL[t]} <span className={styles.assetNum}>{Math.max(totals[t], links[t].length)}</span>
          </button>
        ))}
        {tab === "charts" && chartDistricts.length > 1 && (
          <select
            className={styles.assetDistrictSelect}
            value={district}
            aria-label="Filter charts by district"
            onChange={(e) =>
              setDistrict(e.target.value === "all" ? "all" : Number(e.target.value))
            }
          >
            <option value="all">All areas</option>
            {chartDistricts.map((d) => (
              <option key={d} value={d}>
                {d ? `District ${d}` : "Citywide"}
              </option>
            ))}
          </select>
        )}
      </div>

      {totals[tab] > links[tab].length && (
        <p className={styles.assetEmpty}>
          Showing {links[tab].length} of {totals[tab]}
          {tab === "charts" ? " — ungrouped charts first." : "."}
        </p>
      )}

      {items.length === 0 ? (
        <p className={styles.assetEmpty}>{EMPTY_COPY[tab]}</p>
      ) : (
        <div className={styles.assetLinkList}>
          {items.map((asset) => {
            const key = `${tab}:${asset.id}`;
            return (
              <AssetRow
                key={key}
                asset={asset}
                kind={TAB_KIND[tab]}
                previewing={previewKey === key}
                onTogglePreview={() => setPreviewKey((k) => (k === key ? null : key))}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
