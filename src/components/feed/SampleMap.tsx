/**
 * Sample map SVG placeholder for feed cards.
 * Renders a stylized city district map to show what real maps look like.
 */
export default function SampleMap() {
  return (
    <svg
      viewBox="0 0 400 140"
      width="100%"
      height="140"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Sample district map"
      style={{ display: "block" }}
    >
      {/* Background */}
      <rect width="400" height="140" fill="var(--bg-tertiary, #f3f4f6)" rx="0" />

      {/* District polygons */}
      <polygon points="20,20 120,15 130,65 60,80 20,55" fill="var(--brand-primary, #ad35fa)" fillOpacity="0.12" stroke="var(--border-primary, #e5e7eb)" strokeWidth="1" />
      <polygon points="120,15 220,10 230,50 180,70 130,65" fill="var(--brand-primary, #ad35fa)" fillOpacity="0.25" stroke="var(--border-primary, #e5e7eb)" strokeWidth="1" />
      <polygon points="220,10 340,15 350,55 270,60 230,50" fill="var(--brand-primary, #ad35fa)" fillOpacity="0.08" stroke="var(--border-primary, #e5e7eb)" strokeWidth="1" />
      <polygon points="340,15 390,25 385,70 350,55" fill="var(--brand-primary, #ad35fa)" fillOpacity="0.18" stroke="var(--border-primary, #e5e7eb)" strokeWidth="1" />
      <polygon points="20,55 60,80 80,120 15,125" fill="var(--brand-primary, #ad35fa)" fillOpacity="0.06" stroke="var(--border-primary, #e5e7eb)" strokeWidth="1" />
      <polygon points="60,80 130,65 180,70 170,120 80,120" fill="var(--brand-primary, #ad35fa)" fillOpacity="0.35" stroke="var(--border-primary, #e5e7eb)" strokeWidth="1" />
      <polygon points="180,70 230,50 270,60 280,120 170,120" fill="var(--brand-primary, #ad35fa)" fillOpacity="0.15" stroke="var(--border-primary, #e5e7eb)" strokeWidth="1" />
      <polygon points="270,60 350,55 385,70 380,125 280,120" fill="var(--brand-primary, #ad35fa)" fillOpacity="0.22" stroke="var(--border-primary, #e5e7eb)" strokeWidth="1" />

      {/* Hotspot dots */}
      <circle cx="160" cy="90" r="6" fill="var(--brand-primary, #ad35fa)" fillOpacity="0.6" />
      <circle cx="160" cy="90" r="12" fill="var(--brand-primary, #ad35fa)" fillOpacity="0.15" />
      <circle cx="200" cy="45" r="4" fill="var(--brand-primary, #ad35fa)" fillOpacity="0.5" />
      <circle cx="200" cy="45" r="9" fill="var(--brand-primary, #ad35fa)" fillOpacity="0.12" />
      <circle cx="320" cy="85" r="3.5" fill="var(--brand-primary, #ad35fa)" fillOpacity="0.4" />

      {/* Legend bar */}
      <defs>
        <linearGradient id="mapLegend" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--brand-primary, #ad35fa)" stopOpacity="0.05" />
          <stop offset="100%" stopColor="var(--brand-primary, #ad35fa)" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <rect x="310" y="115" width="70" height="6" rx="3" fill="url(#mapLegend)" />
      <text x="310" y="112" fontSize="8" fill="var(--text-tertiary, #9ca3af)" fontFamily="inherit">Low</text>
      <text x="370" y="112" fontSize="8" fill="var(--text-tertiary, #9ca3af)" fontFamily="inherit" textAnchor="end">High</text>
    </svg>
  );
}
