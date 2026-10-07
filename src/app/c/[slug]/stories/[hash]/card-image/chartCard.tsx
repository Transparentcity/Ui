import type { CSSProperties, ReactElement } from "react";

import type { StoryChartCard, TrendChartCard, YtdChartCard } from "@/lib/feed/storyChartCard";
import { STORY_CARD_HEIGHT, STORY_CARD_WIDTH } from "@/lib/feed/storyCardImage";

/**
 * Social-card layout for a story's chart, cut to the story's window (see
 * src/lib/feed/storyChartCard.ts). Drawn by satori: every div with more than
 * one child needs display:flex, and text sits in divs rather than SVG <text>.
 */

const PAD_X = 72;
const PAD_Y = 52;
const INNER_W = STORY_CARD_WIDTH - PAD_X * 2;
const Y_AXIS_W = 72;
const PLOT_W = INNER_W - Y_AXIS_W;
const PLOT_H = 250;
const X_LABEL_H = 34;
const BLEED = 12;

const BG = "#0f1117";
const CURRENT = "#60a5fa";
const PRIOR = "#9ca3af";
const GRID = "#1f2937";
const MUTED = "#6b7280";
const TEXT = "#f9fafb";

const EN_DASH = "–";
const MINUS = "−";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Props = {
  card: StoryChartCard;
  metricName: string;
  cityName: string;
};

/** Round the axis top up to 1/2/2.5/5 x 10^n with four steps. */
export function niceAxis(max: number): { top: number; step: number } {
  if (!(max > 0)) return { top: 1, step: 0.25 };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((n) => n * mag >= raw) ?? 10) * mag;
  return { top: Math.ceil(max / step - 1e-9) * step, step };
}

function formatValue(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) < 10 ? 1 : 0 });
}

function formatTick(n: number): string {
  if (Math.abs(n) >= 10_000) {
    return `${(n / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`;
  }
  return formatValue(Number(n.toFixed(2)));
}

function formatChange(current: number, prior: number): string | null {
  if (!(prior > 0)) return null;
  const pct = ((current - prior) / prior) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return "No change";
  return `${rounded > 0 ? "+" : MINUS}${Math.abs(rounded).toFixed(1)}%`;
}

function monthDay(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}

function periodLabel(iso: string, period: TrendChartCard["period"]): string {
  const year = iso.slice(0, 4);
  if (period === "year") return year;
  if (period === "month") return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${year}`;
  return `${monthDay(iso)}, ${year}`;
}

function linePath(values: number[], xMax: number, top: number): string {
  return values
    .map((v, i) => {
      const x = xMax > 0 ? (i / xMax) * PLOT_W : PLOT_W / 2;
      const y = PLOT_H - (Math.max(v, 0) / top) * PLOT_H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

type XLabel = { x: number; text: string };

function ytdXLabels(card: YtdChartCard, xMax: number): XLabel[] {
  const endMonth = Number(card.endDate.slice(5, 7));
  const labels: XLabel[] = [];
  for (let m = 0; m < endMonth; m++) {
    const dayIndex = Math.round(
      (Date.UTC(card.year, m, 1) - Date.UTC(card.year, 0, 1)) / 86_400_000,
    );
    labels.push({ x: (dayIndex / xMax) * PLOT_W, text: MONTHS[m] });
  }
  return labels;
}

function trendXLabels(card: TrendChartCard, xMax: number): XLabel[] {
  const { points, period } = card;
  const at = (i: number) => (xMax > 0 ? (i / xMax) * PLOT_W : PLOT_W / 2);
  if (period === "year") return points.map((p, i) => ({ x: at(i), text: p.date.slice(0, 4) }));
  if (period === "month") {
    return points.flatMap((p, i) => {
      const month = Number(p.date.slice(5, 7));
      if (month % 3 !== 1) return [];
      const text = month === 1 ? p.date.slice(0, 4) : MONTHS[month - 1];
      return [{ x: at(i), text }];
    });
  }
  const every = Math.max(1, Math.ceil(points.length / 6));
  return points.flatMap((p, i) => (i % every === 0 ? [{ x: at(i), text: monthDay(p.date) }] : []));
}

function Stat({ color, label, value, dashed }: { color: string; label: string; value: string; dashed?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div
        style={{
          width: 28,
          height: 0,
          borderTop: `${dashed ? 3 : 5}px ${dashed ? "dashed" : "solid"} ${color}`,
        }}
      />
      <span style={{ color: MUTED, fontSize: 24 }}>{label}</span>
      <span style={{ color: TEXT, fontSize: 34, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function ChangePill({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        color: TEXT,
        backgroundColor: GRID,
        fontSize: 24,
        fontWeight: 600,
        padding: "6px 16px",
        borderRadius: 999,
      }}
    >
      {text}
    </div>
  );
}

const labelStyle: CSSProperties = { position: "absolute", color: MUTED, fontSize: 18, display: "flex" };

export function StoryChartCardImage({ card, metricName, cityName }: Props): ReactElement {
  let subtitle: string;
  let stats: ReactElement;
  let current: number[];
  let prior: number[] | null = null;
  let xMax: number;
  let xLabels: XLabel[];
  let dots: { x: number; v: number; color: string; r: number }[];

  if (card.kind === "ytd") {
    subtitle = `Year to date, running total ${EN_DASH} Jan 1 to ${monthDay(card.endDate)}`;
    current = card.current;
    prior = card.prior;
    xMax = Math.max(current.length, prior.length) - 1;
    xLabels = ytdXLabels(card, xMax);
    dots = [
      { x: ((prior.length - 1) / xMax) * PLOT_W, v: card.priorTotal, color: PRIOR, r: 7 },
      { x: ((current.length - 1) / xMax) * PLOT_W, v: card.currentTotal, color: CURRENT, r: 8 },
    ];
    const change = formatChange(card.currentTotal, card.priorTotal);
    stats = (
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <Stat color={CURRENT} label={String(card.year)} value={formatValue(card.currentTotal)} />
        <Stat color={PRIOR} label={String(card.priorYear)} value={formatValue(card.priorTotal)} dashed />
        {change ? <ChangePill text={change} /> : null}
      </div>
    );
  } else {
    const { points, period, compareIndex } = card;
    const first = points[0];
    const last = points[points.length - 1];
    const cadence = { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" }[period];
    subtitle = `${cadence}, ${periodLabel(first.date, period)} ${EN_DASH} ${periodLabel(last.date, period)}`;
    current = points.map((p) => p.value);
    xMax = points.length - 1;
    xLabels = trendXLabels(card, xMax);
    const xAt = (i: number) => (xMax > 0 ? (i / xMax) * PLOT_W : PLOT_W / 2);
    const compare = compareIndex !== null ? points[compareIndex] : null;
    dots = [{ x: xAt(points.length - 1), v: last.value, color: CURRENT, r: 8 }];
    if (compare && compareIndex !== null) dots.unshift({ x: xAt(compareIndex), v: compare.value, color: PRIOR, r: 7 });
    const change = compare ? formatChange(last.value, compare.value) : null;
    stats = (
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <Stat color={CURRENT} label={periodLabel(last.date, period)} value={formatValue(last.value)} />
        {compare ? (
          <Stat color={PRIOR} label={periodLabel(compare.date, period)} value={formatValue(compare.value)} dashed />
        ) : null}
        {change ? <ChangePill text={change} /> : null}
      </div>
    );
  }

  const max = Math.max(...current, ...(prior ?? []), 0);
  const { top, step } = niceAxis(max);
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);

  const title = metricName.length > 60 ? `${metricName.slice(0, 59).trimEnd()}…` : metricName;
  const titleSize = title.length > 44 ? 38 : 46;

  return (
    <div
      style={{
        width: STORY_CARD_WIDTH,
        height: STORY_CARD_HEIGHT,
        display: "flex",
        flexDirection: "column",
        backgroundColor: BG,
        padding: `${PAD_Y}px ${PAD_X}px`,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Top bar, as on the headline card */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#3b82f6" }} />
        <span style={{ color: MUTED, fontSize: 18, letterSpacing: "0.05em" }}>transparent.city</span>
        <span style={{ color: "#374151", fontSize: 18 }}>/</span>
        <span
          style={{
            color: "#3b82f6",
            fontSize: 16,
            backgroundColor: "#1e3a5f",
            padding: "4px 12px",
            borderRadius: 6,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {cityName}
        </span>
      </div>

      <div style={{ display: "flex", marginTop: 22, color: TEXT, fontSize: titleSize, fontWeight: 700 }}>
        {title}
      </div>
      <div style={{ display: "flex", marginTop: 6, color: MUTED, fontSize: 24 }}>{subtitle}</div>

      <div style={{ display: "flex", marginTop: 22 }}>{stats}</div>

      {/* Chart */}
      <div
        style={{
          display: "flex",
          position: "relative",
          width: INNER_W,
          height: PLOT_H + X_LABEL_H,
          marginTop: "auto",
        }}
      >
        {ticks.map((t) => (
          <div
            key={`y${t}`}
            style={{
              ...labelStyle,
              left: 0,
              width: Y_AXIS_W - 16,
              top: PLOT_H - (t / top) * PLOT_H - 12,
              justifyContent: "flex-end",
            }}
          >
            {formatTick(t)}
          </div>
        ))}
        {/* Bleed around the plot so end dots and strokes aren't clipped. */}
        <svg
          width={PLOT_W + BLEED * 2}
          height={PLOT_H + BLEED * 2}
          viewBox={`${-BLEED} ${-BLEED} ${PLOT_W + BLEED * 2} ${PLOT_H + BLEED * 2}`}
          style={{ position: "absolute", left: Y_AXIS_W - BLEED, top: -BLEED }}
        >
          {ticks.map((t) => {
            const y = PLOT_H - (t / top) * PLOT_H;
            return <line key={`g${t}`} x1={0} x2={PLOT_W} y1={y} y2={y} stroke={GRID} strokeWidth={2} />;
          })}
          {prior ? (
            <path
              d={linePath(prior, xMax, top)}
              fill="none"
              stroke={PRIOR}
              strokeWidth={4}
              strokeDasharray="10 8"
              strokeLinejoin="round"
            />
          ) : null}
          <path
            d={linePath(current, xMax, top)}
            fill="none"
            stroke={CURRENT}
            strokeWidth={5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {dots.map(({ x, v, color, r }) => (
            <circle key={`d${x}`} cx={x} cy={PLOT_H - (Math.max(v, 0) / top) * PLOT_H} r={r} fill={color} />
          ))}
        </svg>
        {xLabels.map(({ x, text }) => (
          <div
            key={`x${x}`}
            style={{
              ...labelStyle,
              left: Y_AXIS_W + x - 50,
              width: 100,
              top: PLOT_H + 10,
              justifyContent: "center",
            }}
          >
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}
