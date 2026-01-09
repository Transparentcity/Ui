"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { getResearchByHash, ResearchReport } from "@/lib/apiClient";
import "../../research/brand-styles.css";
import "./styles.css";

export default function PublicResearchPage() {
  const params = useParams();
  const hash = params.hash as string;
  
  const [research, setResearch] = useState<ResearchReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
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
  
  return (
    <div className="public-research-page">
      <div className="public-header">
        <div className="brand">
          <h1>TransparentCity Research</h1>
          <p>AI-Powered Civic Data Analysis</p>
        </div>
        <div className="view-count">
          Viewed {research.view_count} times
        </div>
      </div>
      
      <article className="research-article">
        <header className="article-header">
          <h1>{research.title}</h1>
          <div className="article-meta">
            <span>Published {research.created_at ? new Date(research.created_at).toLocaleDateString() : "Recently"}</span>
            {research.city_id && <span> • City Research</span>}
          </div>
        </header>
        
        <section className="research-question-section">
          <h2>Research Question</h2>
          <p className="research-question">{research.original_prompt}</p>
        </section>
        
        {research.final_report_html && (
          <section className="research-content">
            <div
              className="report-html"
              dangerouslySetInnerHTML={{ __html: research.final_report_html }}
            />
          </section>
        )}
        
        <footer className="article-footer">
          <div className="research-info">
            <p>
              This research was conducted using{" "}
              <strong>{research.model_key || "AI analysis"}</strong> with{" "}
              {research.max_iterations} iteration(s) and{" "}
              {research.max_subquestions} subquestion(s) per iteration.
            </p>
            {research.total_items > 0 && (
              <p>
                Total research items analyzed: {research.total_items}
              </p>
            )}
          </div>
          
          <div className="share-section">
            <h3>Share This Research</h3>
            <div className="share-buttons">
              <button
                onClick={() => {
                  const text = encodeURIComponent(`Check out this research: ${research.title}`);
                  const url = encodeURIComponent(window.location.href);
                  window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
                }}
                className="share-button twitter"
              >
                Share on Twitter
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  alert("Link copied to clipboard!");
                }}
                className="share-button copy"
              >
                Copy Link
              </button>
            </div>
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

