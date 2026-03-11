"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { getResearchByHash, ResearchReport } from "@/lib/apiClient";
import ReportContent from "@/components/ReportContent";
import "../../research/brand-styles.css";
import "./styles.css";

export default function PublicResearchPage() {
  const params = useParams();
  const hash = params.hash as string;
  
  const [research, setResearch] = useState<ResearchReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  
  // Fetch research data (no auth required)
  useEffect(() => {
    if (hash) {
      getResearchByHash(hash)
        .then(setResearch)
        .catch(err => {
          console.error("Failed to load research:", err);
          setError(err.message || "Research not found or private");
        })
        .finally(() => setLoading(false));
    }
  }, [hash]);

  // Deep link: scroll to #story-{short_hash} when report has multiple feed stories
  useEffect(() => {
    if (!research?.final_report_html || typeof window === "undefined") return;
    const hashId = window.location.hash?.slice(1);
    if (!hashId || !hashId.startsWith("story-")) return;
    const el = document.getElementById(hashId);
    if (el) {
      const t = setTimeout(
        () => el.scrollIntoView({ behavior: "smooth", block: "start" }),
        150
      );
      return () => clearTimeout(t);
    }
  }, [research?.final_report_html, research?.id]);
  
  if (loading) {
    return <div className="public-research-page loading">Loading...</div>;
  }
  
  if (error) {
    return (
      <div className="public-research-page">
        <div className="error-container">
          <h1>Research Not Available</h1>
          <p>{error}</p>
          <p>This research may be private or the link may be incorrect.</p>
        </div>
      </div>
    );
  }
  
  if (!research) {
    return <div className="public-research-page">Research not found</div>;
  }
  
  // Share functionality
  const handleShare = async () => {
    const url = window.location.href;
    const title = research.title || "Research Report | TransparentCity";
    const text = `Check out this research: ${research.title}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        // User cancelled or error - fall through to fallback
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      alert("Link copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  return (
    <div className="public-research-page">
      <header className="research-header">
        <a href="/" className="brand">
          <div className="logo-corners">
            <svg
              viewBox="0 0 100 100"
              xmlns="http://www.w3.org/2000/svg"
              style={{ overflow: "visible" }}
            >
              <defs>
                <mask
                  id="logo-mask-bl-research"
                  x="-400"
                  y="-400"
                  width="1200"
                  height="1200"
                  maskUnits="userSpaceOnUse"
                  maskContentUnits="userSpaceOnUse"
                >
                  <rect
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    fill="white"
                  />
                  <rect
                    x="8.333"
                    y="8.333"
                    width="83.333"
                    height="83.333"
                    rx="3"
                    ry="3"
                    fill="black"
                  />
                  <rect
                    x="16.666"
                    y="-33.333"
                    width="66.666"
                    height="166.666"
                    fill="black"
                    transform="rotate(-45 50 50)"
                  />
                  <rect
                    x="50"
                    y="-400"
                    width="1200"
                    height="1200"
                    fill="black"
                    transform="rotate(-45 50 50)"
                  />
                </mask>
                <mask
                  id="logo-mask-tr-research"
                  x="-400"
                  y="-400"
                  width="1200"
                  height="1200"
                  maskUnits="userSpaceOnUse"
                  maskContentUnits="userSpaceOnUse"
                >
                  <rect
                    x="-400"
                    y="-400"
                    width="1200"
                    height="1200"
                    fill="white"
                  />
                  <rect
                    x="8.333"
                    y="8.333"
                    width="83.333"
                    height="83.333"
                    rx="3"
                    ry="3"
                    fill="black"
                  />
                  <rect
                    x="16.666"
                    y="-33.333"
                    width="66.666"
                    height="166.666"
                    fill="black"
                    transform="rotate(-45 50 50)"
                  />
                  <rect
                    x="-1150"
                    y="-400"
                    width="1200"
                    height="1200"
                    fill="black"
                    transform="rotate(-45 50 50)"
                  />
                </mask>
              </defs>
              <rect
                className="brace"
                x="0"
                y="0"
                width="100"
                height="100"
                rx="3"
                ry="3"
                mask="url(#logo-mask-bl-research)"
                fill="var(--text-primary)"
                transform="translate(23.5%, -23.5%)"
              />
              <rect
                className="brace"
                x="0"
                y="0"
                width="100"
                height="100"
                rx="3"
                ry="3"
                mask="url(#logo-mask-tr-research)"
                fill="var(--text-primary)"
                transform="translate(-23.5%, 23.5%)"
              />
            </svg>
          </div>
          <span className="brand-text">
            <span className="brand-transparent">transparent</span>
            <span className="brand-city">.city</span>
          </span>
        </a>
        <div className="header-right">
          <button
            onClick={handleShare}
            className="share-button-header"
            aria-label="Share this research"
            title="Share this research"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
              <polyline points="16 6 12 2 8 6"></polyline>
              <line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>
            Share
          </button>
        </div>
      </header>
      
      <article className="research-article">
        <header className="article-header">
          <h1>{research.title}</h1>
          <div className="article-meta">
            <span>Published {research.created_at ? new Date(research.created_at).toLocaleDateString() : "Recently"}</span>
            {research.city_id && <span> • City Research</span>}
          </div>
        </header>
        
        {research.final_report_html && (
          <section className="research-content">
            <ReportContent
              content={research.final_report_html}
              className="report-html"
            />
          </section>
        )}
        
        <footer className="article-footer">
          <div className="research-info">
            <p>
              This research was generated by <strong>Seymour</strong>, an AI research assistant.
            </p>
            {research.total_items > 0 && (
              <p>
                Total research items analyzed: {research.total_items}
              </p>
            )}
            <p>
              <a href="/methodology" className="methodology-link">
                Learn more about our research methodology →
              </a>
            </p>
          </div>

          <div className="research-details-collapsible">
            <button
              className="details-toggle"
              onClick={() => setIsInfoExpanded(!isInfoExpanded)}
              aria-expanded={isInfoExpanded}
            >
              <span className="toggle-text">
                {isInfoExpanded ? "Hide" : "Show"} Research Details
              </span>
              <svg
                className={`toggle-icon ${isInfoExpanded ? "expanded" : ""}`}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            {isInfoExpanded && (
              <div className="details-content">
                <div className="research-question-section">
                  <h3>Research Question</h3>
                  <p className="research-question">{research.original_prompt}</p>
                </div>
              </div>
            )}
          </div>
          
          <div className="cta-section">
            <h3>Create Your Own Research</h3>
            <p>
              Investigate complex questions about your city using AI-powered analysis
              of public data.
            </p>
            <a href="/research/new" className="cta-button">
              Start Researching
            </a>
          </div>
        </footer>
      </article>
    </div>
  );
}

