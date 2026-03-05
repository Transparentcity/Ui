"use client";

import { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";
import { listNewsletterReports, createResearch, type NewsletterReport, type CreateResearchRequest } from "@/lib/apiClient";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import Loader from "./Loader";
import "./NewslettersTabPanel.css";

interface NewslettersTabPanelProps {
  cityId: number;
  cityName: string;
  initialDistrict?: number | null;
  isAdmin?: boolean;
}

export default function NewslettersTabPanel({
  cityId,
  cityName,
  initialDistrict,
  isAdmin = false,
}: NewslettersTabPanelProps) {
  const router = useRouter();
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const [selectedDistrict, setSelectedDistrict] = useState<number | null>(initialDistrict ?? null);
  const [selectedFrequency, setSelectedFrequency] = useState<string | null>(null);
  const [newsletters, setNewsletters] = useState<NewsletterReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

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
      } catch (err: unknown) {
        console.error("Failed to load newsletters:", err);
        setError(err instanceof Error ? err.message : "Failed to load newsletters");
      } finally {
        setLoading(false);
      }
    };

    loadNewsletters();
  }, [cityId, selectedDistrict, selectedFrequency, isAuthenticated, getAccessTokenSilently]);

  // Clear error when filters change
  useEffect(() => {
    setError(null);
  }, [selectedDistrict, selectedFrequency]);

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

  const handleGenerateNewsletter = async () => {
    if (!selectedDistrict && selectedDistrict !== 0) {
      setError("Please select a district");
      return;
    }
    if (!selectedFrequency) {
      setError("Please select a frequency");
      return;
    }

    setGenerating(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      
      // Generate newsletter prompt
      const districtLabel = selectedDistrict === 0 ? "city-wide" : `District ${selectedDistrict}`;
      const prompt = `Create a ${selectedFrequency} newsletter report for ${cityName} (${districtLabel}).

Focus on:
- Recent changes and trends in key metrics (crime, housing, permits, 311 calls, budget)
- Notable anomalies or significant shifts
- Comparative analysis (this period vs. previous period, this district vs. city-wide)
- Actionable insights for residents and officials

The report should be:
- Accessible to general public (avoid jargon)
- Data-driven with specific numbers and percentages
- Highlight both positive and concerning trends
- Include visualizations (charts, maps) where helpful
- Suggest what these trends might mean for residents

Format as a newsletter-style summary that could be emailed to subscribers interested in ${districtLabel} news.`;

      // Create research report with newsletter metadata
      const payload: CreateResearchRequest = {
        prompt,
        city_id: cityId,
        district: selectedDistrict === 0 ? null : selectedDistrict.toString(),
        max_iterations: 1,
        max_subquestions: 1,
        model_key: "gpt-5.1",
        enable_web_search: true,
        // Mark this as a newsletter so it appears in the newsletter list
        is_newsletter: true,
        newsletter_frequency: selectedFrequency as "weekly" | "monthly",
      };
      
      const response = await createResearch(payload, token);

      // Notify the job system so the badge shows progress
      if (response.job_id) {
        notifyJobCreated(response.job_id);
      }
    } catch (err: unknown) {
      console.error("Failed to generate newsletter:", err);
      setError(err instanceof Error ? err.message : "Failed to generate newsletter");
    } finally {
      setGenerating(false);
    }
  };

  // Check if we should show the generate button
  const shouldShowGenerateButton = 
    isAdmin && 
    newsletters.length === 0 && 
    (selectedDistrict !== null || selectedDistrict === 0) && 
    selectedFrequency !== null;

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

  if (error && !newsletters.length && loading === false) {
    return (
      <div className="newsletters-tab-panel">
        <div className="newsletters-error">
          <p>Error: {error}</p>
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

      {/* Error message (if any) */}
      {error && newsletters.length > 0 && (
        <div className="newsletters-error" style={{ marginBottom: "16px", padding: "12px", borderRadius: "8px", background: "var(--bg-secondary)" }}>
          <p style={{ margin: 0 }}>Error: {error}</p>
        </div>
      )}

      {/* Newsletters List */}
      {newsletters.length === 0 ? (
        <div className="newsletters-empty">
          <p>No newsletters found for this city and district.</p>
          {shouldShowGenerateButton && (
            <button
              className="newsletter-generate-btn"
              onClick={handleGenerateNewsletter}
              disabled={generating}
            >
              {generating ? "Generating..." : "Generate New Newsletter"}
            </button>
          )}
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
