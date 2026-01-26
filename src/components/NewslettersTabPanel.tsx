"use client";

import { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";
import { listNewsletterReports, type NewsletterReport } from "@/lib/apiClient";
import Loader from "./Loader";
import "./NewslettersTabPanel.css";

interface NewslettersTabPanelProps {
  cityId: number;
  cityName: string;
  initialDistrict?: number | null;
}

export default function NewslettersTabPanel({
  cityId,
  cityName,
  initialDistrict,
}: NewslettersTabPanelProps) {
  const router = useRouter();
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const [selectedDistrict, setSelectedDistrict] = useState<number | null>(initialDistrict ?? null);
  const [selectedFrequency, setSelectedFrequency] = useState<string | null>(null);
  const [newsletters, setNewsletters] = useState<NewsletterReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadNewsletters = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = isAuthenticated ? await getAccessTokenSilently() : undefined;
        const reports = await listNewsletterReports(
          cityId,
          {
            district: selectedDistrict,
            frequency: selectedFrequency ?? undefined,
            limit: 50,
          },
          token
        );
        setNewsletters(reports);
      } catch (err: any) {
        console.error("Failed to load newsletters:", err);
        setError(err.message || "Failed to load newsletters");
      } finally {
        setLoading(false);
      }
    };

    loadNewsletters();
  }, [cityId, selectedDistrict, selectedFrequency, isAuthenticated, getAccessTokenSilently]);

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateString || "";
    }
  };

  const getDistrictLabel = (district: string | null | undefined) => {
    if (!district || district === "0" || district === "null") return "City-wide";
    return `District ${district}`;
  };

  const handleNewsletterClick = (newsletter: NewsletterReport) => {
    router.push(newsletter.public_url);
  };

  if (loading) {
    return (
      <div className="newsletters-tab-panel">
        <div className="newsletters-loading">
          <Loader size="md" color="dark" />
          <p>Loading newsletters...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="newsletters-tab-panel">
        <div className="newsletters-error">
          <p>Error loading newsletters: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="newsletters-tab-panel">
      <div className="newsletters-header">
        <h2>Newsletters</h2>
        <p className="newsletters-subtitle">
          Weekly and monthly research reports for {cityName}
        </p>
      </div>

      {/* Filters */}
      <div className="newsletters-filters">
        <div className="newsletter-filter-group">
          <label htmlFor="district-filter">District:</label>
          <select
            id="district-filter"
            value={selectedDistrict ?? ""}
            onChange={(e) => setSelectedDistrict(e.target.value ? Number(e.target.value) : null)}
            className="newsletter-filter-select"
          >
            <option value="">All Districts</option>
            <option value="0">City-wide</option>
            {Array.from({ length: 11 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                District {d}
              </option>
            ))}
          </select>
        </div>

        <div className="newsletter-filter-group">
          <label htmlFor="frequency-filter">Frequency:</label>
          <select
            id="frequency-filter"
            value={selectedFrequency ?? ""}
            onChange={(e) => setSelectedFrequency(e.target.value || null)}
            className="newsletter-filter-select"
          >
            <option value="">All</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      </div>

      {/* Newsletters List */}
      {newsletters.length === 0 ? (
        <div className="newsletters-empty">
          <p>No newsletters found for this city and district.</p>
        </div>
      ) : (
        <div className="newsletters-list">
          {newsletters.map((newsletter) => (
            <div
              key={newsletter.id}
              className="newsletter-card"
              onClick={() => handleNewsletterClick(newsletter)}
            >
              <div className="newsletter-card-header">
                <h3 className="newsletter-title">{newsletter.title}</h3>
                {newsletter.frequency && (
                  <span className="newsletter-frequency-badge">
                    {newsletter.frequency}
                  </span>
                )}
              </div>

              <div className="newsletter-card-meta">
                <span className="newsletter-date">
                  {formatDate(newsletter.created_at)}
                </span>
                {newsletter.district && (
                  <span className="newsletter-district">
                    {getDistrictLabel(newsletter.district)}
                  </span>
                )}
              </div>

              {newsletter.social_summary && (
                <p className="newsletter-summary">{newsletter.social_summary}</p>
              )}

              <div className="newsletter-card-footer">
                <button className="newsletter-read-btn">
                  Read Newsletter →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
