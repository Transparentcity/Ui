// Client-side generator for the waste module's "audit summary" PDF export.
//
// Produces a well-designed, emailable audit-style document from a set of
// waste-detection findings. Every page is stamped CONFIDENTIAL · UNAUDITED,
// attributed to transparent.city, and dated with the day the report was run.
//
// This module is deliberately self-contained: it imports only jsPDF (and its
// autotable plugin) and takes plain data in via `WasteAuditPdfInput`. It has no
// dependency on the app's React/Auth/query layer, so it can be lazy-loaded
// (keeping jsPDF out of the main bundle) and exercised in isolation from Node.
//
// The heavy `jspdf` / `jspdf-autotable` imports mean callers should load this
// module dynamically, e.g.:
//   const { generateWasteAuditPdf } = await import("@/lib/waste/wasteAuditPdf")

import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

// ── Public input types ──────────────────────────────────────────────────────

/**
 * The subset of a waste finding this report renders. `WasteFinding` from
 * `@/lib/api/waste` is structurally assignable to this, so callers can pass
 * their findings array directly without mapping.
 */
export interface WasteAuditPdfFinding {
  category: string
  subcategory?: string | null
  severity: string
  entity: string
  department?: string | null
  metric?: string | null
  metricDetail?: string | null
  amount?: number | null
  estimated_dollar_impact?: number | null
  description?: string | null
  confidence?: string | null
  tool?: string | null
  fiscal_year?: number | null
  is_partial_data?: boolean
  caveat?: string | null
  headline?: string | null
}

/** Human-readable description of the filters that produced `findings`. */
export interface WasteAuditPdfScope {
  categories?: string[]
  severities?: string[]
  department?: string | null
  minDollars?: number | null
}

export interface WasteAuditPdfInput {
  /** City the analysis covers, e.g. "San Francisco". */
  cityName: string
  /** The findings to include (already filtered to the report's scope). */
  findings: readonly WasteAuditPdfFinding[]
  /** ISO timestamp of the underlying analysis run (the "day it was run"). */
  analysisRunAt?: string | null
  /** When this document was generated. Passed in so output is deterministic. */
  generatedAt: Date
  /** Total findings available citywide before filtering, for "N of M" context. */
  totalFindingsAvailable?: number | null
  /** Filter scope, rendered on the cover so recipients know what's included. */
  scope?: WasteAuditPdfScope
  /** Maps a raw category string to a display label (defaults to a built-in). */
  categoryLabel?: (raw: string) => string
  /** Maps a raw category string to a normalized key (defaults to a built-in). */
  normalizeCategory?: (raw: string) => string
  /** Max finding rows before truncating with a note. Defaults to 60. */
  maxFindingRows?: number
}

// ── Palette & geometry ──────────────────────────────────────────────────────

const INK = "#1f2937" // gray-800 — headings & wordmark
const INK_SOFT = "#374151" // gray-700 — body
const MUTED = "#6b7280" // gray-500 — secondary
const FAINT = "#9ca3af" // gray-400 — labels
const HAIRLINE = "#e5e7eb" // gray-200
const ZEBRA = "#f9fafb" // gray-50 — table zebra
const PANEL = "#f3f4f6" // gray-100 — stat panels

const BRAND = "#7c3aed" // violet-600 — accents
const CONFIDENTIAL = "#b91c1c" // red-700 — confidentiality marks
const NOTICE_BG = "#fef2f2" // red-50
const NOTICE_BORDER = "#fecaca" // red-200

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#6b7280",
  info: "#9ca3af",
}
const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
}

const PAGE_W = 612 // US Letter, points
const PAGE_H = 792
const MARGIN_X = 54
const CONTENT_W = PAGE_W - MARGIN_X * 2
const HEADER_H = 88 // running-header reserve
const FOOTER_H = 56 // running-footer reserve
const CONTENT_TOP = HEADER_H + 16
const CONTENT_BOTTOM = PAGE_H - FOOTER_H

// ── Built-in category mapping (used when the caller doesn't supply one) ──────

const DEFAULT_CATEGORY_LABELS: Record<string, string> = {
  payroll: "Payroll & Personnel",
  contracts: "Contracts & Procurement",
  infrastructure: "Infrastructure & Services",
  influence: "Influence & Pay-to-Play",
  integrity: "Personnel Integrity",
  confirmed: "Confirmed Cases",
  convergence: "Cross-Domain Risk",
}
const CATEGORY_ORDER = [
  "payroll",
  "contracts",
  "infrastructure",
  "integrity",
  "influence",
  "convergence",
  "confirmed",
]

function defaultNormalize(raw: string): string {
  const key = (raw || "")
    .toLowerCase()
    .trim()
    .replace(/[_\s&.,'-]+/g, "_")
    .replace(/^_|_$/g, "")
  if (key.includes("payroll")) return "payroll"
  if (key.includes("integrity") || key.includes("personnel") || key.includes("revolving") || key.includes("conflict"))
    return "integrity"
  if (key.includes("contract") || key.includes("vendor") || key.includes("procurement")) return "contracts"
  if (key.includes("infrastructure") || key.includes("service")) return "infrastructure"
  if (key.includes("influence") || key.includes("lobby") || key.includes("pay_to_play")) return "influence"
  if (key.includes("convergence") || key.includes("cross_domain")) return "convergence"
  if (key.includes("confirmed")) return "confirmed"
  return key || "other"
}
function defaultLabel(raw: string): string {
  const key = defaultNormalize(raw)
  return DEFAULT_CATEGORY_LABELS[key] ?? titleCase(key.replace(/_/g, " "))
}

// ── Small formatting helpers ────────────────────────────────────────────────

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function impactOf(f: WasteAuditPdfFinding): number {
  return f.estimated_dollar_impact ?? f.amount ?? 0
}

function money(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—"
  return "$" + Math.round(n).toLocaleString("en-US")
}

function moneyCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(1) + "B"
  if (abs >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M"
  if (abs >= 1_000) return "$" + Math.round(n / 1_000) + "K"
  return "$" + Math.round(n)
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
}
function fmtDateTime(d: Date): string {
  return (
    d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) +
    " at " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  )
}
function parseRunDate(iso?: string | null): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

/** Truncates `text` with an ellipsis so it fits in `width` at the current font. */
function fitText(doc: jsPDF, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text
  let s = text
  while (s.length > 1 && doc.getTextWidth(s + "…") > width) {
    s = s.slice(0, -1)
  }
  return s.replace(/[\s,]+$/, "") + "…"
}

function findingLabel(f: WasteAuditPdfFinding): string {
  if (f.headline && f.headline.trim()) return f.headline.trim()
  const metric = [f.metric, f.metricDetail].filter(Boolean).join(" ").trim()
  if (metric) return metric
  if (f.description) return f.description.trim()
  return f.subcategory || f.category || "—"
}

// ── jsPDF colour wrappers (accept hex, robust across versions) ───────────────

function setText(doc: jsPDF, hex: string) {
  const [r, g, b] = rgb(hex)
  doc.setTextColor(r, g, b)
}
function setFill(doc: jsPDF, hex: string) {
  const [r, g, b] = rgb(hex)
  doc.setFillColor(r, g, b)
}
function setDraw(doc: jsPDF, hex: string) {
  const [r, g, b] = rgb(hex)
  doc.setDrawColor(r, g, b)
}

// ── Chrome: bracket mark, running header & footer ───────────────────────────

/** Draws the transparent.city bracket "[ ]" wordmark glyph. */
function drawBracketMark(doc: jsPDF, x: number, y: number, size: number, hex: string) {
  setDraw(doc, hex)
  doc.setLineWidth(size * 0.13)
  const foot = size * 0.42
  // left bracket
  doc.line(x, y, x, y + size)
  doc.line(x, y, x + foot, y)
  doc.line(x, y + size, x + foot, y + size)
  // right bracket
  const x2 = x + size * 1.15
  doc.line(x2, y, x2, y + size)
  doc.line(x2, y, x2 - foot, y)
  doc.line(x2, y + size, x2 - foot, y + size)
}

function drawHeader(doc: jsPDF) {
  drawBracketMark(doc, MARGIN_X, 34, 13, INK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  setText(doc, INK)
  doc.text("transparent.city", MARGIN_X + 26, 45)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  setText(doc, FAINT)
  doc.text("MUNICIPAL WASTE FORENSICS", MARGIN_X + 26, 55, { charSpace: 0.8 })

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  setText(doc, CONFIDENTIAL)
  doc.text("CONFIDENTIAL · UNAUDITED", PAGE_W - MARGIN_X, 45, {
    align: "right",
    charSpace: 0.8,
  })

  setDraw(doc, HAIRLINE)
  doc.setLineWidth(0.75)
  doc.line(MARGIN_X, 66, PAGE_W - MARGIN_X, 66)
}

function drawFooter(doc: jsPDF, page: number, total: number, generatedAt: Date) {
  const y = PAGE_H - 34
  setDraw(doc, HAIRLINE)
  doc.setLineWidth(0.75)
  doc.line(MARGIN_X, y - 14, PAGE_W - MARGIN_X, y - 14)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  setText(doc, MUTED)
  doc.text("transparent.city · CONFIDENTIAL", MARGIN_X, y)
  doc.text(`Generated ${fmtDate(generatedAt)}`, PAGE_W / 2, y, { align: "center" })
  doc.text(`Page ${page} of ${total}`, PAGE_W - MARGIN_X, y, { align: "right" })
}

// ── Section heading + text helpers ──────────────────────────────────────────

interface Cursor {
  y: number
}

function ensureSpace(doc: jsPDF, cur: Cursor, needed: number) {
  if (cur.y + needed > CONTENT_BOTTOM) {
    doc.addPage()
    cur.y = CONTENT_TOP
  }
}

function sectionHeading(doc: jsPDF, cur: Cursor, title: string, subtitle?: string) {
  ensureSpace(doc, cur, 46)
  setFill(doc, BRAND)
  doc.rect(MARGIN_X, cur.y - 8, 3, 12, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12.5)
  setText(doc, INK)
  doc.text(title, MARGIN_X + 11, cur.y + 2)
  if (subtitle) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    setText(doc, MUTED)
    doc.text(subtitle, PAGE_W - MARGIN_X, cur.y + 1, { align: "right" })
  }
  cur.y += 12
  setDraw(doc, HAIRLINE)
  doc.setLineWidth(0.75)
  doc.line(MARGIN_X, cur.y, PAGE_W - MARGIN_X, cur.y)
  cur.y += 18
}

/** Wrapped paragraph. Returns the advanced y. */
function paragraph(
  doc: jsPDF,
  cur: Cursor,
  text: string,
  opts: { size?: number; color?: string; leading?: number; bold?: boolean; width?: number } = {},
) {
  const size = opts.size ?? 9.5
  const leading = opts.leading ?? size * 1.42
  doc.setFont("helvetica", opts.bold ? "bold" : "normal")
  doc.setFontSize(size)
  setText(doc, opts.color ?? INK_SOFT)
  const lines = doc.splitTextToSize(text, opts.width ?? CONTENT_W) as string[]
  for (const line of lines) {
    ensureSpace(doc, cur, leading)
    doc.text(line, MARGIN_X, cur.y)
    cur.y += leading
  }
}

// ── Derived report data ─────────────────────────────────────────────────────

interface CategoryRow {
  key: string
  label: string
  count: number
  critical: number
  high: number
  exposure: number
}

function buildCategoryRows(
  findings: readonly WasteAuditPdfFinding[],
  normalize: (raw: string) => string,
  label: (raw: string) => string,
): CategoryRow[] {
  const map = new Map<string, CategoryRow>()
  for (const f of findings) {
    const key = normalize(f.category)
    let row = map.get(key)
    if (!row) {
      row = { key, label: label(f.category), count: 0, critical: 0, high: 0, exposure: 0 }
      map.set(key, row)
    }
    row.count += 1
    if (f.severity === "critical") row.critical += 1
    if (f.severity === "high") row.high += 1
    row.exposure += impactOf(f)
  }
  return Array.from(map.values()).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.key)
    const bi = CATEGORY_ORDER.indexOf(b.key)
    const ar = ai === -1 ? 99 : ai
    const br = bi === -1 ? 99 : bi
    if (ar !== br) return ar - br
    return b.exposure - a.exposure
  })
}

// ── Cover block ─────────────────────────────────────────────────────────────

function drawCover(
  doc: jsPDF,
  cur: Cursor,
  input: WasteAuditPdfInput,
  totals: {
    count: number
    exposure: number
    depts: number
    total: number | null
  },
) {
  // Eyebrow
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  setText(doc, BRAND)
  doc.text("WASTE & RISK DETECTION SUMMARY", MARGIN_X, cur.y, { charSpace: 1.4 })
  cur.y += 26

  // Title
  doc.setFont("helvetica", "bold")
  doc.setFontSize(27)
  setText(doc, INK)
  doc.text(input.cityName, MARGIN_X, cur.y)
  cur.y += 20

  doc.setFont("helvetica", "normal")
  doc.setFontSize(13)
  setText(doc, MUTED)
  doc.text("Automated municipal waste-detection report", MARGIN_X, cur.y)
  cur.y += 18

  setDraw(doc, HAIRLINE)
  doc.setLineWidth(0.75)
  doc.line(MARGIN_X, cur.y, PAGE_W - MARGIN_X, cur.y)
  cur.y += 22

  // Meta grid: 2 columns × 4 rows
  const runDate = parseRunDate(input.analysisRunAt)
  const findingsValue =
    totals.total != null && totals.total > totals.count
      ? `${totals.count.toLocaleString()} of ${totals.total.toLocaleString()} citywide`
      : totals.count.toLocaleString()

  const scope = input.scope ?? {}
  const sevScope =
    scope.severities && scope.severities.length
      ? scope.severities.map(titleCase).join(", ")
      : "All severities"
  const catScope =
    scope.categories && scope.categories.length
      ? scope.categories.length >= 6
        ? "All categories"
        : scope.categories.join(", ")
      : "All categories"
  const filterBits: string[] = []
  if (scope.department) filterBits.push(`Dept: ${scope.department}`)
  if (scope.minDollars != null && scope.minDollars > 0)
    filterBits.push(`Min impact ${moneyCompact(scope.minDollars)}`)

  const pairs: Array<[string, string]> = [
    ["PREPARED BY", "transparent.city · automated detection"],
    ["ANALYSIS RUN", runDate ? fmtDate(runDate) : "Not recorded"],
    ["FINDINGS IN REPORT", findingsValue],
    ["ESTIMATED EXPOSURE", money(totals.exposure)],
    ["SEVERITY SCOPE", sevScope],
    ["CATEGORY SCOPE", catScope],
    ["REPORT GENERATED", fmtDate(input.generatedAt)],
    ["ADDITIONAL FILTERS", filterBits.length ? filterBits.join(" · ") : "None"],
  ]

  const colX = [MARGIN_X, MARGIN_X + CONTENT_W / 2 + 8]
  const rowH = 34
  const startY = cur.y
  pairs.forEach(([label, value], i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = colX[col]
    const y = startY + row * rowH
    const w = CONTENT_W / 2 - 8
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    setText(doc, FAINT)
    doc.text(label, x, y, { charSpace: 0.6 })
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10.5)
    setText(doc, INK)
    doc.text(fitText(doc, value, w), x, y + 13)
  })
  cur.y = startY + Math.ceil(pairs.length / 2) * rowH + 6

  drawConfidentialNotice(doc, cur)
  cur.y += 24
}

/** Bordered CONFIDENTIAL · UNAUDITED notice box. Shared by both documents. */
function drawConfidentialNotice(doc: jsPDF, cur: Cursor) {
  const boxPad = 12
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.7)
  const noticeBody =
    "This document is produced by transparent.city's automated waste-detection system. " +
    "Every figure is an algorithmic signal derived from open municipal data — an upper-bound " +
    "estimate, not an audited or confirmed loss, and not a determination of fraud or wrongdoing. " +
    "It is UNAUDITED and CONFIDENTIAL: distribute only to authorized recipients and verify findings " +
    "against source records before acting."
  const bodyLines = doc.splitTextToSize(noticeBody, CONTENT_W - boxPad * 2) as string[]
  const boxH = 22 + bodyLines.length * 11.5 + boxPad
  ensureSpace(doc, cur, boxH + 10)
  setFill(doc, NOTICE_BG)
  setDraw(doc, NOTICE_BORDER)
  doc.setLineWidth(1)
  doc.roundedRect(MARGIN_X, cur.y, CONTENT_W, boxH, 5, 5, "FD")
  setFill(doc, CONFIDENTIAL)
  doc.rect(MARGIN_X, cur.y, 3.5, boxH, "F")
  let ty = cur.y + boxPad + 4
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  setText(doc, CONFIDENTIAL)
  doc.text("CONFIDENTIAL — UNAUDITED AUTOMATED FINDINGS", MARGIN_X + boxPad, ty, { charSpace: 0.5 })
  ty += 15
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.7)
  setText(doc, INK_SOFT)
  for (const line of bodyLines) {
    doc.text(line, MARGIN_X + boxPad, ty)
    ty += 11.5
  }
  cur.y += boxH
}

// ── Executive summary (KPIs + narrative) ────────────────────────────────────

function drawKpis(
  doc: jsPDF,
  cur: Cursor,
  cells: Array<{ label: string; value: string; color: string }>,
) {
  const gap = 10
  const w = (CONTENT_W - gap * (cells.length - 1)) / cells.length
  const h = 52
  ensureSpace(doc, cur, h + 6)
  cells.forEach((cell, i) => {
    const x = MARGIN_X + i * (w + gap)
    setFill(doc, PANEL)
    setDraw(doc, HAIRLINE)
    doc.setLineWidth(0.75)
    doc.roundedRect(x, cur.y, w, h, 4, 4, "FD")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(19)
    setText(doc, cell.color)
    doc.text(cell.value, x + 12, cur.y + 27)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.8)
    setText(doc, MUTED)
    const labelLines = doc.splitTextToSize(cell.label.toUpperCase(), w - 20) as string[]
    doc.text(labelLines[0], x + 12, cur.y + 42, { charSpace: 0.4 })
  })
  cur.y += h + 20
}

// ── Main entry point ────────────────────────────────────────────────────────

export function generateWasteAuditPdf(input: WasteAuditPdfInput): Blob {
  const normalize = input.normalizeCategory ?? defaultNormalize
  const label = input.categoryLabel ?? defaultLabel
  const maxRows = input.maxFindingRows ?? 60

  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true })
  doc.setProperties({
    title: `${input.cityName} — Waste & Risk Detection Summary (Confidential, Unaudited)`,
    subject: "Automated municipal waste-detection summary",
    author: "transparent.city",
    creator: "transparent.city waste module",
    keywords: "confidential, unaudited, waste, audit, transparent.city",
  })

  const findings = [...input.findings].sort((a, b) => {
    const ra = SEVERITY_RANK[a.severity] ?? 9
    const rb = SEVERITY_RANK[b.severity] ?? 9
    if (ra !== rb) return ra - rb
    return impactOf(b) - impactOf(a)
  })

  const totals = {
    count: findings.length,
    exposure: findings.reduce((s, f) => s + impactOf(f), 0),
    critical: findings.filter((f) => f.severity === "critical").length,
    high: findings.filter((f) => f.severity === "high").length,
    depts: new Set(findings.map((f) => f.department).filter(Boolean) as string[]).size,
    total: input.totalFindingsAvailable ?? null,
    partial: findings.some((f) => f.is_partial_data),
  }

  const cur: Cursor = { y: CONTENT_TOP }

  // 1. Cover
  drawCover(doc, cur, input, totals)

  // 2. Executive summary
  sectionHeading(doc, cur, "Executive summary")
  drawKpis(doc, cur, [
    { label: "Findings in report", value: totals.count.toLocaleString(), color: INK },
    { label: "Critical severity", value: totals.critical.toLocaleString(), color: SEVERITY_COLORS.critical },
    { label: "Est. exposure", value: moneyCompact(totals.exposure), color: BRAND },
    { label: "Departments affected", value: totals.depts.toLocaleString(), color: INK },
  ])

  const catRows = buildCategoryRows(findings, normalize, label)
  const topCat = catRows[0]
  const narrativeParts: string[] = []
  narrativeParts.push(
    `This report covers ${totals.count.toLocaleString()} detection finding${totals.count === 1 ? "" : "s"} for ${input.cityName}` +
      (totals.total != null && totals.total > totals.count
        ? `, drawn from ${totals.total.toLocaleString()} findings surfaced citywide.`
        : "."),
  )
  narrativeParts.push(
    `${totals.critical.toLocaleString()} ${totals.critical === 1 ? "is" : "are"} rated critical and ${totals.high.toLocaleString()} high severity.`,
  )
  if (topCat) {
    narrativeParts.push(
      `The largest concentration is in ${topCat.label} (${topCat.count} finding${topCat.count === 1 ? "" : "s"}, ${moneyCompact(topCat.exposure)} estimated).`,
    )
  }
  narrativeParts.push(
    `Aggregate estimated exposure across included findings is ${money(totals.exposure)} — an upper-bound signal that has not been audited or confirmed.`,
  )
  if (totals.partial) {
    narrativeParts.push(
      "Several findings draw on partial fiscal-year data and may change once full-year figures are available.",
    )
  }
  paragraph(doc, cur, narrativeParts.join(" "), { size: 9.7, leading: 14 })
  cur.y += 12

  // 3. Findings by category — keep the whole (small) table with its heading so
  // it never splits mid-table and repeats the "Total" foot across a page break.
  ensureSpace(doc, cur, 46 + 30 + catRows.length * 26 + 34)
  sectionHeading(doc, cur, "Findings by category")
  autoTable(doc, {
    startY: cur.y,
    margin: { left: MARGIN_X, right: MARGIN_X, top: CONTENT_TOP, bottom: FOOTER_H },
    head: [["Category", "Findings", "Critical", "High", "Est. exposure"]],
    body: catRows.map((r) => [
      r.label,
      String(r.count),
      String(r.critical),
      String(r.high),
      money(r.exposure),
    ]),
    foot: [
      [
        "Total",
        String(totals.count),
        String(totals.critical),
        String(totals.high),
        money(totals.exposure),
      ],
    ],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6, textColor: rgb(INK_SOFT), lineColor: rgb(HAIRLINE), lineWidth: 0.5 },
    headStyles: { fillColor: rgb(INK), textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5, halign: "left" },
    footStyles: { fillColor: rgb(PANEL), textColor: rgb(INK), fontStyle: "bold", fontSize: 9, lineWidth: 0.5, lineColor: rgb(HAIRLINE) },
    alternateRowStyles: { fillColor: rgb(ZEBRA) },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 60, halign: "right" },
      2: { cellWidth: 60, halign: "right" },
      3: { cellWidth: 50, halign: "right" },
      4: { cellWidth: 96, halign: "right" },
    },
  })
  cur.y = tableEndY(doc) + 24

  // 4. Priority findings
  const shown = findings.slice(0, maxRows)
  const truncated = findings.length - shown.length
  // Reserve the heading plus a couple of rows so the heading never orphans at
  // the bottom of a page; the table itself breaks normally after that.
  ensureSpace(doc, cur, 46 + 90)
  sectionHeading(
    doc,
    cur,
    "Priority findings",
    "sorted by severity, then estimated impact",
  )
  autoTable(doc, {
    startY: cur.y,
    margin: { left: MARGIN_X, right: MARGIN_X, top: CONTENT_TOP, bottom: FOOTER_H },
    head: [["#", "Severity", "Entity / Department", "Category", "Finding", "Est. $", "Conf."]],
    body: shown.map((f, i) => [
      String(i + 1),
      (f.severity || "—").toUpperCase(),
      f.department && f.department !== f.entity ? `${f.entity}\n${f.department}` : f.entity,
      label(f.category),
      findingLabel(f),
      money(impactOf(f)),
      f.confidence ? titleCase(f.confidence) : "—",
    ]),
    theme: "striped",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 5,
      textColor: rgb(INK_SOFT),
      lineColor: rgb(HAIRLINE),
      lineWidth: 0.4,
      valign: "top",
      overflow: "linebreak",
    },
    headStyles: { fillColor: rgb(INK), textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.8 },
    alternateRowStyles: { fillColor: rgb(ZEBRA) },
    columnStyles: {
      0: { cellWidth: 20, halign: "right", textColor: rgb(FAINT) },
      1: { cellWidth: 48, fontStyle: "bold", fontSize: 7.2 },
      2: { cellWidth: 104 },
      3: { cellWidth: 80 },
      4: { cellWidth: "auto" },
      5: { cellWidth: 62, halign: "right" },
      6: { cellWidth: 46 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 1) {
        const sev = shown[data.row.index]?.severity ?? ""
        data.cell.styles.textColor = rgb(SEVERITY_COLORS[sev] ?? MUTED)
      }
    },
  })
  cur.y = tableEndY(doc) + 12

  if (truncated > 0) {
    paragraph(
      doc,
      cur,
      `+ ${truncated.toLocaleString()} additional finding${truncated === 1 ? "" : "s"} in scope are not listed here. Use the CSV or JSON export for the complete record-level dataset.`,
      { size: 8.5, color: MUTED },
    )
  }
  cur.y += 16

  // 5. Methodology & disclaimer
  drawMethodologyDisclaimer(doc, cur, input.generatedAt, input.analysisRunAt)

  // Chrome: draw header + footer on every page now that the count is known.
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    drawHeader(doc)
    drawFooter(doc, i, pageCount, input.generatedAt)
  }

  return doc.output("blob")
}

/** Reads the y-coordinate where the last autoTable finished. */
function tableEndY(doc: jsPDF): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
  return last?.finalY ?? CONTENT_TOP
}

// ── Methodology & disclaimer (shared) ───────────────────────────────────────

function drawMethodologyDisclaimer(
  doc: jsPDF,
  cur: Cursor,
  generatedAt: Date,
  analysisRunAt?: string | null,
) {
  sectionHeading(doc, cur, "Methodology & disclaimer")
  const discItems: Array<[string, string]> = [
    [
      "How these findings are produced.",
      "transparent.city runs a library of independent detectors over open municipal datasets (payroll, contracts, permits, lobbying, and more). Each detector flags statistical outliers or control weaknesses. A finding is a signal — its severity and estimated dollar impact are model outputs weighted by detector precision, not the results of a manual audit.",
    ],
    [
      "Estimates, not confirmed losses.",
      "Dollar figures are upper-bound estimates of potential exposure. They may overlap across findings, may rest on partial data, and do not represent confirmed waste, fraud, or recoverable amounts. No finding constitutes a determination of wrongdoing by any named entity or individual.",
    ],
    [
      "Data currency.",
      "Findings marked as partial-year draw on datasets that were incomplete at analysis time and can change as full-year records load. Always verify a finding against the underlying source records before taking action.",
    ],
    [
      "Confidentiality.",
      "This document is confidential and unaudited. It is intended solely for authorized recipients for internal review, oversight referral, or investigative triage. Do not redistribute externally without appropriate review.",
    ],
  ]
  for (const [lead, body] of discItems) {
    ensureSpace(doc, cur, 24)
    paragraph(doc, cur, lead, { size: 9, bold: true, color: INK, leading: 13 })
    cur.y += 1
    paragraph(doc, cur, body, { size: 8.6, color: INK_SOFT, leading: 12.5 })
    cur.y += 9
  }
  ensureSpace(doc, cur, 20)
  paragraph(
    doc,
    cur,
    `Generated by transparent.city on ${fmtDateTime(generatedAt)}.` +
      (parseRunDate(analysisRunAt)
        ? ` Based on the waste analysis run of ${fmtDate(parseRunDate(analysisRunAt)!)}.`
        : ""),
    { size: 8, color: FAINT, leading: 11.5 },
  )
}

// ── Lightweight Markdown rendering (for Seymour's analysis text) ─────────────

/** Removes inline Markdown markers jsPDF can't style (bold, italic, code, links). */
function stripInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*#{1,6}\s*/, "")
}

function bulletLine(doc: jsPDF, cur: Cursor, text: string) {
  const indent = 14
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  const lines = doc.splitTextToSize(text, CONTENT_W - indent) as string[]
  ensureSpace(doc, cur, lines.length * 12.5)
  setText(doc, BRAND)
  doc.text("•", MARGIN_X + 3, cur.y)
  setText(doc, INK_SOFT)
  lines.forEach((l) => {
    doc.text(l, MARGIN_X + indent, cur.y)
    cur.y += 12.5
  })
  cur.y += 2
}

/** Renders Seymour's Markdown-ish analysis into styled PDF text. */
function renderMarkdownish(doc: jsPDF, cur: Cursor, md: string) {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n")
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      cur.y += 5
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      cur.y += 5
      paragraph(doc, cur, stripInline(heading[2]), {
        size: 10.5,
        bold: true,
        color: INK,
        leading: 14,
      })
      cur.y += 2
      continue
    }
    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      doc.setFont("helvetica", "normal")
      doc.setFontSize(9)
      const qLines = doc.splitTextToSize(stripInline(quote[1]), CONTENT_W - 14) as string[]
      ensureSpace(doc, cur, qLines.length * 12.5 + 2)
      setText(doc, MUTED)
      qLines.forEach((l) => {
        doc.text(l, MARGIN_X + 14, cur.y)
        cur.y += 12.5
      })
      cur.y += 3
      continue
    }
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/)
    if (li) {
      bulletLine(doc, cur, stripInline(li[1]))
      continue
    }
    paragraph(doc, cur, stripInline(line), { size: 9, color: INK_SOFT, leading: 13 })
    cur.y += 3
  }
}

// ── Single-finding brief ────────────────────────────────────────────────────

/** A finding plus the extra scoring fields shown in a per-finding brief. */
export interface WasteBriefFinding extends WasteAuditPdfFinding {
  confidence_reason?: string | null
  priority_score?: number | null
  corroboration_count?: number | null
  data_completeness?: number | null
  narrative?: string | null
}

export interface WasteFindingBriefInput {
  cityName: string
  finding: WasteBriefFinding
  /** Seymour's analysis text (Markdown). Optional — omitted → a note is shown. */
  analysisText?: string | null
  generatedAt: Date
  analysisRunAt?: string | null
  categoryLabel?: (raw: string) => string
}

function drawBriefCover(doc: jsPDF, cur: Cursor, input: WasteFindingBriefInput, label: (r: string) => string) {
  const f = input.finding

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  setText(doc, BRAND)
  doc.text("CONFIDENTIAL FINDING BRIEF", MARGIN_X, cur.y, { charSpace: 1.4 })
  cur.y += 24

  doc.setFont("helvetica", "bold")
  doc.setFontSize(21)
  setText(doc, INK)
  doc.text(fitText(doc, f.entity || "Finding", CONTENT_W), MARGIN_X, cur.y)
  cur.y += 18

  doc.setFont("helvetica", "normal")
  doc.setFontSize(12)
  setText(doc, MUTED)
  const subtitle = `${input.cityName} · ${label(f.category)} · investigative brief`
  doc.text(fitText(doc, subtitle, CONTENT_W), MARGIN_X, cur.y)
  cur.y += 16

  setDraw(doc, HAIRLINE)
  doc.setLineWidth(0.75)
  doc.line(MARGIN_X, cur.y, PAGE_W - MARGIN_X, cur.y)
  cur.y += 20

  const pairs: Array<[string, string]> = [
    ["PREPARED BY", "transparent.city · automated detection"],
    ["CATEGORY", label(f.category)],
    ["SEVERITY", (f.severity || "—").toUpperCase()],
    ["CONFIDENCE", f.confidence ? titleCase(f.confidence) : "—"],
    ["DEPARTMENT", f.department || "—"],
    ["ESTIMATED IMPACT", money(impactOf(f))],
    ["DETECTOR", f.tool || "—"],
    ["REPORT GENERATED", fmtDate(input.generatedAt)],
  ]
  const colX = [MARGIN_X, MARGIN_X + CONTENT_W / 2 + 8]
  const rowH = 34
  const startY = cur.y
  pairs.forEach(([lab, value], i) => {
    const x = colX[i % 2]
    const y = startY + Math.floor(i / 2) * rowH
    const w = CONTENT_W / 2 - 8
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    setText(doc, FAINT)
    doc.text(lab, x, y, { charSpace: 0.6 })
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10.5)
    // Colour the severity value by tier for quick scanning.
    setText(doc, lab === "SEVERITY" ? SEVERITY_COLORS[f.severity] ?? INK : INK)
    if (lab === "SEVERITY") doc.setFont("helvetica", "bold")
    doc.text(fitText(doc, value, w), x, y + 13)
  })
  cur.y = startY + Math.ceil(pairs.length / 2) * rowH + 6

  drawConfidentialNotice(doc, cur)
  cur.y += 22
}

export function generateWasteFindingBriefPdf(input: WasteFindingBriefInput): Blob {
  const label = input.categoryLabel ?? defaultLabel
  const f = input.finding

  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true })
  doc.setProperties({
    title: `${f.entity} — Waste Finding Brief (Confidential, Unaudited)`,
    subject: "Automated municipal waste-detection finding brief",
    author: "transparent.city",
    creator: "transparent.city waste module",
    keywords: "confidential, unaudited, waste, finding, brief, transparent.city",
  })

  const cur: Cursor = { y: CONTENT_TOP }

  // 1. Cover
  drawBriefCover(doc, cur, input, label)

  // 2. Finding detail
  sectionHeading(doc, cur, "Finding detail")
  paragraph(doc, cur, findingLabel(f), { size: 11, bold: true, color: INK, leading: 15 })
  cur.y += 4
  if (f.description && f.description.trim() && f.description.trim() !== findingLabel(f)) {
    paragraph(doc, cur, f.description.trim(), { size: 9.3, color: INK_SOFT, leading: 13.5 })
    cur.y += 6
  }
  const factBits: string[] = []
  if (f.metric && f.metricDetail) factBits.push(`Signal: ${f.metric} — ${f.metricDetail}`)
  if (f.fiscal_year) factBits.push(`Fiscal year: FY${f.fiscal_year}`)
  if (typeof f.corroboration_count === "number" && f.corroboration_count > 0)
    factBits.push(`Corroborating detectors: ${f.corroboration_count}`)
  if (typeof f.data_completeness === "number")
    factBits.push(`Data completeness: ${Math.round(f.data_completeness * 100)}%`)
  if (f.confidence && f.confidence_reason)
    factBits.push(`Confidence rationale: ${f.confidence_reason}`)
  for (const bit of factBits) {
    paragraph(doc, cur, bit, { size: 8.6, color: MUTED, leading: 12.5 })
    cur.y += 2
  }
  if (f.is_partial_data || f.caveat) {
    cur.y += 2
    paragraph(
      doc,
      cur,
      `Caveat: ${f.caveat || "Based on partial fiscal-year data; figures may change as full-year records load."}`,
      { size: 8.6, color: CONFIDENTIAL, leading: 12.5 },
    )
  }
  cur.y += 12

  // 3. Seymour analysis
  sectionHeading(doc, cur, "Seymour analysis", "AI-generated · verify before acting")
  if (input.analysisText && input.analysisText.trim()) {
    renderMarkdownish(doc, cur, input.analysisText)
  } else {
    paragraph(
      doc,
      cur,
      "No AI analysis was captured for this brief. Run Seymour's analysis in the waste module and export again to include it.",
      { size: 9, color: MUTED, leading: 13 },
    )
  }
  cur.y += 14

  // 4. Methodology & disclaimer
  drawMethodologyDisclaimer(doc, cur, input.generatedAt, input.analysisRunAt)

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    drawHeader(doc)
    drawFooter(doc, i, pageCount, input.generatedAt)
  }

  return doc.output("blob")
}
