import type {
  DistrictCrimeOutlook,
  DistrictCrimeOutlookType,
} from "@/lib/publicApiClient";
import {
  buildHeadline,
  buildSubhead,
  CALL_WORDS,
  changeSummary,
  formatMonthly,
  headlineText,
  monthLabel,
  monthRange,
  recordPct,
  RULE_NOTES,
  shownTypes,
} from "@/lib/districtOutlook";

const ARROW = { fall: "↓", hold: "→", rise: "↑" } as const;
/** Table wording; the column header carries "Likely". */
const SHORT_CALL = { fall: "Fall", hold: "Hold steady", rise: "Rise" } as const;

/** Past months for this district, its 12-month average (dashed), and the next
 * three months shaded where the outlook expects the average to land. */
function OutlookChart({ t, placeName }: { t: DistrictCrimeOutlookType; placeName: string }) {
  const W = 320, H = 150, L = 6, R = 6, T = 14, B = 22;
  const s = t.counts;
  const avg = t.avg12_monthly;
  const nPast = s.length;
  const nFut = 3;
  const top = Math.max(...s, avg * 1.25, 1) * 1.1;
  const x = (i: number) => L + (i * (W - L - R)) / (nPast + nFut - 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const x0 = x(nPast - 0.5);
  const x1 = x(nPast + nFut - 1) + 4;
  const call = t.call ?? "hold";
  const [lo, hi] =
    call === "fall" ? [0, 0.9 * avg] : call === "rise" ? [1.1 * avg, top] : [0.9 * avg, 1.1 * avg];
  const points = s.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const first = t.months[0];
  const last = t.months[t.months.length - 1];
  const label =
    `${t.label} in ${placeName}, reported each month ${monthLabel(first)} to ${monthLabel(last)}; ` +
    `${CALL_WORDS[call].toLowerCase()} over the next three months.`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} className="outlook-chart">
      <defs>
        <marker id={`outlook-ah-${t.key}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className={`outlook-ink-${call}`} />
        </marker>
      </defs>
      <rect className={`outlook-zone outlook-zone-${call}`} x={x0} y={y(hi)} width={x1 - x0} height={Math.max(y(lo) - y(hi), 2)} rx={4} />
      <path
        className={`outlook-arrow outlook-stroke-${call}`}
        d={`M${x0 + 6},${y(avg)} L${x1 - 14},${y((lo + hi) / 2)}`}
        markerEnd={`url(#outlook-ah-${t.key})`}
      />
      <line className="outlook-avg" x1={L} x2={x1} y1={y(avg)} y2={y(avg)} />
      <polyline className="outlook-line" points={points} />
      <text className="outlook-tick" x={L} y={H - 6}>{monthLabel(first)}</text>
      <text className="outlook-tick" x={x(nPast - 1)} y={H - 6} textAnchor="end">{monthLabel(last)}</text>
    </svg>
  );
}

export default function DistrictOutlookSection({
  outlook,
  placeName,
}: {
  outlook: DistrictCrimeOutlook;
  placeName: string;
}) {
  const headline = buildHeadline(outlook, placeName);
  if (!headline) return null;
  const shown = shownTypes(outlook);
  const rest = outlook.crime_types.filter((t) => !shown.includes(t));
  const window = `${monthLabel(outlook.window_start)} to ${monthLabel(outlook.window_end)}`;
  const since = monthLabel(outlook.record_start);

  return (
    <section className="district-outlook" aria-labelledby="district-outlook-heading">
      <div className="district-outlook-inner">
        <p className="district-outlook-eyebrow">
          {placeName} crime outlook &middot; {window}
        </p>
        <h2 id="district-outlook-heading" className="district-outlook-headline" aria-label={headlineText(headline)}>
          {headline.map((p, i) =>
            p.call ? (
              <span key={i} className={`outlook-call-${p.call}`}>{p.text}</span>
            ) : (
              <span key={i}>{p.text}</span>
            )
          )}
        </h2>
        <p className="district-outlook-sub">{buildSubhead(outlook)}</p>

        <div className="district-outlook-grid">
          {shown.map((t) => (
            <article key={t.key} className="district-outlook-card">
              <div className="district-outlook-card-name">{t.label}</div>
              <div className={`district-outlook-card-call outlook-call-${t.call}`}>
                {ARROW[t.call!]} {CALL_WORDS[t.call!]}
              </div>
              <OutlookChart t={t} placeName={placeName} />
              <div className="district-outlook-legend">
                <i className="district-outlook-dash" aria-hidden />
                12-month average: {formatMonthly(t.avg12_monthly)} a month
              </div>
              <div className="district-outlook-note">{RULE_NOTES[t.rule]}.</div>
              <div className="district-outlook-note">
                Right {recordPct(t.record)}% of the time since {since}, all 11 districts.
              </div>
            </article>
          ))}
        </div>

        <h3 className="district-stories-label district-outlook-details-label">Details</h3>
        <p className="district-outlook-note district-outlook-details-note">
          Change compares the last 3 months with the 12 months before them, the same test as each call.
        </p>
        <div className="metrics-category-section">
          <div className="metrics-table-header">
            <div className="metric-col metric-col-name">Crime type</div>
            <div className="metric-col metric-col-value">Last 3 months</div>
            <div className="metric-col metric-col-change">Change</div>
            <div className="metric-col metric-col-change">Likely, next 3 months</div>
          </div>
          <div className="metrics-table-body">
            {[...shown, ...rest].map((t) => {
              // Older API payloads lack prior12_monthly; fall back to the 12-month average.
              const hasPrior = Number.isFinite(t.prior12_monthly);
              const base = hasPrior ? t.prior12_monthly : t.avg12_monthly;
              const ch = changeSummary(t.last3_monthly, base, t.last3_direction ?? null);
              const cls = ch.direction === "down" ? "good" : ch.direction === "up" ? "bad" : "neutral";
              const on = shown.includes(t);
              return (
                <div key={t.key} className="metrics-table-row">
                  <div className="metric-col metric-col-name">
                    <span className="metric-name">{t.label}</span>
                    <span className="metric-date-label">
                      Right {recordPct(t.record)}% since {since}
                    </span>
                  </div>
                  <div className="metric-col metric-col-value">
                    <span className="metric-date-label">
                      {monthRange(t.months[Math.max(0, t.months.length - 3)], t.months[t.months.length - 1])}
                    </span>
                    <span className="metric-value">{formatMonthly(t.last3_monthly)} a month</span>
                  </div>
                  <div className="metric-col metric-col-change">
                    <div className={`change-indicator ${cls}`}>
                      <span className="change-arrow">
                        {ch.direction === "down" ? "↓" : ch.direction === "up" ? "↑" : "→"}
                      </span>
                      <div className="change-values">
                        <span className="change-percent">{ch.text}</span>
                        <span className="change-absolute">
                          {hasPrior ? `from ${formatMonthly(base)}` : `vs ${formatMonthly(base)}, last 12 mo`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="metric-col metric-col-change">
                    {on ? (
                      <span className={`district-outlook-table-call outlook-call-${t.call}`}>
                        {ARROW[t.call!]} {SHORT_CALL[t.call!]}
                      </span>
                    ) : (
                      <span className="metric-date-label">
                        {t.call && t.counts.length >= 3
                          ? `Not shown (record under ${recordPct(outlook.min_record)}%)`
                          : "Not shown (too little history)"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="district-outlook-foot">
          Reported incidents only; many crimes are never reported. Source:{" "}
          <a href={outlook.source.url} target="_blank" rel="noopener noreferrer">
            {outlook.source.name}
          </a>
          , data through {monthLabel(outlook.as_of)}. &ldquo;Right&rdquo; means the direction matched what
          happened, checked each month from {since} to {monthLabel(outlook.record_end)}. Not for directing
          patrols. Rape and homicide are excluded because DataSF withholds many of those records.
        </p>
      </div>
    </section>
  );
}
