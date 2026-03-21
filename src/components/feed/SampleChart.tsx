/**
 * Sample line chart SVG placeholder for feed cards.
 * Renders an attractive trend visualization to show what real charts look like.
 */
export default function SampleChart() {
  return (
    <svg
      viewBox="0 0 400 140"
      width="100%"
      height="140"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Sample trend chart"
      style={{ display: "block" }}
    >
      {/* Background grid lines */}
      <line x1="40" y1="20" x2="380" y2="20" stroke="var(--border-primary, #e5e7eb)" strokeWidth="0.5" />
      <line x1="40" y1="45" x2="380" y2="45" stroke="var(--border-primary, #e5e7eb)" strokeWidth="0.5" />
      <line x1="40" y1="70" x2="380" y2="70" stroke="var(--border-primary, #e5e7eb)" strokeWidth="0.5" />
      <line x1="40" y1="95" x2="380" y2="95" stroke="var(--border-primary, #e5e7eb)" strokeWidth="0.5" />
      <line x1="40" y1="120" x2="380" y2="120" stroke="var(--border-primary, #e5e7eb)" strokeWidth="0.5" />

      {/* Area fill under the line */}
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand-primary, #ad35fa)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--brand-primary, #ad35fa)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path
        d="M40,85 L90,78 L140,90 L190,65 L240,55 L290,42 L340,48 L380,30 L380,120 L40,120 Z"
        fill="url(#chartGrad)"
      />

      {/* Trend line */}
      <polyline
        points="40,85 90,78 140,90 190,65 240,55 290,42 340,48 380,30"
        fill="none"
        stroke="var(--brand-primary, #ad35fa)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {[
        [40, 85], [90, 78], [140, 90], [190, 65],
        [240, 55], [290, 42], [340, 48], [380, 30],
      ].map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r="3"
          fill="var(--bg-primary, #fff)"
          stroke="var(--brand-primary, #ad35fa)"
          strokeWidth="1.5"
        />
      ))}

      {/* X-axis labels */}
      {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"].map((label, i) => (
        <text
          key={label}
          x={40 + i * (340 / 7)}
          y={134}
          textAnchor="middle"
          fontSize="9"
          fill="var(--text-tertiary, #9ca3af)"
          fontFamily="inherit"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}
