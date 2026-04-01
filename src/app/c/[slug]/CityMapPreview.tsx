"use client";

import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";
import type { PublicMapListItem } from "@/lib/publicApiClient";

type Props = {
  cityName: string;
  slug: string;
  maps: PublicMapListItem[];
};

export default function CityMapPreview({ cityName, slug, maps }: Props) {
  const { loginWithRedirect, isAuthenticated } = useAuth0();

  if (isAuthenticated) return null;

  const activeLayers = maps.slice(0, 1);
  const lockedLayers = maps.slice(1, 4);
  // If fewer than 4 maps, pad with generic layer names
  const genericLayers = ["Housing Data", "311 Requests", "Safety Reports", "Budget Data"];
  while (lockedLayers.length < 3) {
    const name = genericLayers[lockedLayers.length] ?? "More Data";
    lockedLayers.push({ id: -lockedLayers.length - 1, short_hash: "", title: name });
  }

  const handleSignup = () => {
    loginWithRedirect({
      appState: { returnTo: `/c/${slug}` },
    });
  };

  return (
    <section className="map-preview-section">
      <div className="container">
        <h2 className="section-heading" style={{ marginBottom: 16 }}>Interactive Maps</h2>
        <div className="map-preview-container">
          {/* Map background with grid + dots */}
          <div className="map-preview-bg">
            <div className="map-preview-grid" />
            {/* Decorative data dots */}
            {[
              { x: "22%", y: "28%", s: 10 },
              { x: "38%", y: "48%", s: 14 },
              { x: "52%", y: "32%", s: 8 },
              { x: "33%", y: "62%", s: 12 },
              { x: "58%", y: "52%", s: 9 },
              { x: "43%", y: "38%", s: 16 },
              { x: "28%", y: "44%", s: 7 },
              { x: "48%", y: "68%", s: 11 },
              { x: "65%", y: "40%", s: 8 },
              { x: "55%", y: "58%", s: 13 },
            ].map((d, i) => (
              <div
                key={i}
                className="map-preview-dot"
                style={{
                  left: d.x,
                  top: d.y,
                  width: d.s,
                  height: d.s,
                }}
              />
            ))}
            <div className="map-preview-city-label">{cityName}</div>
          </div>

          {/* Layer panel */}
          <div className="map-preview-layers">
            <div className="map-preview-layers-title">Layers</div>
            {activeLayers.map((m) => (
              <Link
                key={m.id}
                href={m.short_hash ? `/m/${m.short_hash}` : `/c/${slug}`}
                className="map-preview-layer map-preview-layer--active"
              >
                <span className="map-preview-layer-dot" />
                {m.title}
              </Link>
            ))}
            {activeLayers.length === 0 && (
              <div className="map-preview-layer map-preview-layer--active">
                <span className="map-preview-layer-dot" />
                City Overview
              </div>
            )}
            {lockedLayers.map((m, i) => (
              <div key={i} className="map-preview-layer map-preview-layer--locked">
                <span className="map-preview-lock-icon">&#128274;</span>
                {m.title}
              </div>
            ))}
          </div>

          {/* Signup overlay */}
          <div className="map-preview-cta">
            <button
              type="button"
              onClick={handleSignup}
              className="map-preview-cta-btn"
            >
              Sign up to explore all map layers
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
