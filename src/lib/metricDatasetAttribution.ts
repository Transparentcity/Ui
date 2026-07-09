/**
 * Resolve the government dataset name/URL for metric provenance UI.
 * Never falls back to the metric display name.
 */

export type MetricDatasetFields = {
  dataset_name?: string | null;
  dataset_title?: string | null;
  endpoint?: string | null;
  source_url?: string | null;
  data_sf_url?: string | null;
};

const SOCRATA_ID_RE = /^[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}$/;

export function extractSocrataDatasetId(endpoint?: string | null): string | null {
  if (!endpoint) return null;
  const value = endpoint.trim();
  if (!value || value.startsWith("template_") || value.startsWith("pending_")) {
    return null;
  }
  if (SOCRATA_ID_RE.test(value)) return value.toLowerCase();
  const resourceMatch = value.match(/\/resource\/([a-zA-Z0-9_-]+)(?:\.json)?/i);
  if (resourceMatch && SOCRATA_ID_RE.test(resourceMatch[1])) {
    return resourceMatch[1].toLowerCase();
  }
  const dMatch = value.match(/\/d\/([a-zA-Z0-9_-]+)/i);
  if (dMatch && SOCRATA_ID_RE.test(dMatch[1])) {
    return dMatch[1].toLowerCase();
  }
  const anyMatch = value.match(/([a-zA-Z0-9]{4}-[a-zA-Z0-9]{4})/);
  return anyMatch ? anyMatch[1].toLowerCase() : null;
}

export function resolveMetricDatasetAttribution(
  metric: MetricDatasetFields,
  options?: {
    portalUrl?: string | null;
    portalDomain?: string | null;
  }
): {
  datasetName: string | null;
  datasetId: string | null;
  datasetUrl: string | null;
} {
  const datasetId = extractSocrataDatasetId(metric.endpoint);
  const datasetName =
    (metric.dataset_name?.trim() || null) ||
    (metric.dataset_title?.trim() || null) ||
    datasetId;

  const explicitUrl =
    (metric.source_url?.trim() || null) || (metric.data_sf_url?.trim() || null);

  let datasetUrl = explicitUrl;
  if (!datasetUrl && datasetId) {
    const portalUrl = options?.portalUrl?.replace(/\/$/, "") || null;
    const portalDomain = options?.portalDomain?.trim() || null;
    if (portalUrl) {
      datasetUrl = `${portalUrl}/resource/${datasetId}`;
    } else if (portalDomain) {
      const domain = portalDomain.replace(/^https?:\/\//, "").split("/")[0];
      datasetUrl = `https://${domain}/d/${datasetId}`;
    } else if (metric.endpoint?.startsWith("http")) {
      // Prefer the human dataset page over the .json resource URL when possible
      datasetUrl = metric.endpoint.replace(/\.json(?:\?.*)?$/i, "").replace(
        /\/resource\//i,
        "/d/"
      );
    }
  }

  return { datasetName, datasetId, datasetUrl };
}
