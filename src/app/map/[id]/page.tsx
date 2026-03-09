"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

/**
 * Redirect /map/[id] -> /m/[short_hash].
 * Feed stories and old links sometimes use map ID; the app only has /m/[hash].
 * This page resolves the map by ID and redirects to the canonical URL.
 */
export default function MapIdRedirectPage() {
  const params = useParams();
  const id = params.id as string;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const numericId = parseInt(id, 10);
    if (Number.isNaN(numericId)) {
      setError("Invalid map ID");
      return;
    }
    fetch(`/api/maps/public/by-id/${numericId}`)
      .then((res) => {
        if (!res.ok) {
          setError("Map not found");
          return null;
        }
        return res.json();
      })
      .then((data: { short_hash?: string } | null) => {
        if (data?.short_hash) {
          window.location.replace(`/m/${data.short_hash}`);
        } else if (!error) {
          setError("Map not found");
        }
      })
      .catch(() => setError("Map not found"));
  }, [id]);

  if (error) {
    return (
      <div className="map-redirect-error" style={{ padding: "2rem", textAlign: "center" }}>
        <h1>Map not found</h1>
        <p>{error}</p>
        <p>
          <a href="/">Return home</a>
        </p>
      </div>
    );
  }

  return (
    <div className="map-redirect-loading" style={{ padding: "2rem", textAlign: "center" }}>
      <p>Redirecting to map…</p>
    </div>
  );
}
