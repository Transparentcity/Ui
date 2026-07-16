/**
 * When a multi-series chart is filtered to one group_value, replace generic
 * "by {group_field}" copy in chart_title / caption with the actual subtype.
 */

export interface ChartMetadataLike {
  chart_title?: string | null;
  caption?: string | null;
  group_field?: string | null;
  object_name?: string | null;
  [key: string]: unknown;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceByGroupField(text: string, groupField: string, groupValue: string): string {
  const field = escapeRegExp(groupField.trim());
  const gv = groupValue.trim();

  // Title: "... - by service_subtype - Week Trend" → "... — blocked_sidewalk - Week Trend"
  let out = text.replace(
    new RegExp(`\\s*-\\s*by\\s+${field}\\s*`, "gi"),
    ` — ${gv} `,
  );

  // Caption: "(District 3 - by service_subtype)" → "(District 3 — blocked_sidewalk)"
  out = out.replace(
    new RegExp(`(\\(|\\s)by\\s+${field}(\\)|\\s|$)`, "gi"),
    (_match, open: string, close: string) => {
      const sep = open === "(" ? "— " : "— ";
      return `${open}${sep}${gv}${close}`;
    },
  );

  // Fallback: bare "by service_subtype"
  out = out.replace(new RegExp(`\\bby\\s+${field}\\b`, "gi"), gv);

  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
}

/**
 * Return metadata with chart_title and caption relabeled for a single subtype.
 */
export function enrichChartMetadataForGroupFilter<T extends ChartMetadataLike>(
  metadata: T | undefined | null,
  groupValue: string | null | undefined,
): T | undefined {
  if (!metadata) return undefined;
  const gv = groupValue?.trim();
  if (!gv) return metadata;

  const gf = metadata.group_field?.trim();
  let chart_title = metadata.chart_title ?? undefined;
  let caption = metadata.caption ?? undefined;

  if (gf) {
    if (chart_title) {
      chart_title = replaceByGroupField(chart_title, gf, gv);
    }
    if (caption) {
      caption = replaceByGroupField(caption, gf, gv);
    }
  }

  if (chart_title && !chart_title.includes(gv)) {
    chart_title = `${chart_title} — ${gv}`;
  }
  if (caption && !caption.includes(gv)) {
    caption = `${caption} (${gv})`;
  }

  return {
    ...metadata,
    ...(chart_title !== undefined ? { chart_title } : {}),
    ...(caption !== undefined ? { caption } : {}),
  };
}
