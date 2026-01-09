"use client";

import { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useParams } from "next/navigation";
import { getResearch, ResearchReport } from "@/lib/apiClient";
import "../brand-styles.css";
import "../styles.css";

export default function ResearchDetailPage() {
  const { isAuthenticated, isLoading: authLoading, getAccessTokenSilently } = useAuth0();
  const params = useParams();
  const reportId = Number(params.id);
  
  const [research, setResearch] = useState<ResearchReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Fetch research data
  useEffect(() => {
    if (isAuthenticated && reportId) {
      getAccessTokenSilently().then(token => {
        getResearch(reportId, token)
          .then(setResearch)
          .catch(err => {
            console.error("Failed to load research:", err);
            setError(err.message || "Failed to load research");
          })
          .finally(() => setLoading(false));
      });
    }
  }, [isAuthenticated, reportId, getAccessTokenSilently]);
  
  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!research || research.status === "completed" || research.status === "failed") {
      return;
    }
    
    // TODO: Connect to WebSocket for real-time progress updates
    // const ws = new WebSocket(`ws://localhost:8000/ws/jobs?job_id=research_${reportId}`);
    // ws.onmessage = (event) => {
    //   const data = JSON.parse(event.data);
    //   if (data.type === 'research_progress') {
    //     setResearch(prev => ({ ...prev, ...data.data }));
    //   }
    // };
    // return () => ws.close();
  }, [research, reportId]);
  
  if (authLoading || loading) {
    return <div className="research-page loading">Loading...</div>;
  }
  
  if (!isAuthenticated) {
    return <div className="research-page">Please log in to view research.</div>;
  }
  
  if (error) {
    return <div className="research-page error">Error: {error}</div>;
  }
  
  if (!research) {
    return <div className="research-page">Research not found</div>;
  }
  
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "completed": return "status-completed";
      case "failed": return "status-failed";
      case "running": return "status-running";
      case "synthesizing": return "status-synthesizing";
      default: return "status-draft";
    }
  };
  
  return (
    <div className="research-detail-page">
      <div className="research-header">
        <h1>{research.title}</h1>
        <span className={`status-badge ${getStatusBadgeClass(research.status)}`}>
          {research.status}
        </span>
      </div>
      
      <div className="research-meta">
        <div className="meta-item">
          <strong>Research ID:</strong> {research.id}
        </div>
        <div className="meta-item">
          <strong>Model:</strong> {research.model_key || "Not specified"}
        </div>
        <div className="meta-item">
          <strong>Created:</strong> {research.created_at ? new Date(research.created_at).toLocaleString() : "Unknown"}
        </div>
        {research.estimated_cost_usd && (
          <div className="meta-item">
            <strong>Estimated Cost:</strong> ${research.estimated_cost_usd}
          </div>
        )}
      </div>
      
      <div className="research-question">
        <h2>Research Question</h2>
        <p>{research.original_prompt}</p>
      </div>
      
      {/* Progress Bar */}
      {research.status !== "completed" && research.status !== "failed" && (
        <div className="progress-section">
          <h2>Progress: {research.progress_percent}%</h2>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${research.progress_percent}%` }}
            />
          </div>
          <div className="progress-text">
            {research.completed_items} / {research.total_items} items completed
          </div>
        </div>
      )}
      
      {/* Results */}
      {research.status === "completed" && research.final_report_html && (
        <div className="results-section">
          <h2>Research Report</h2>
          <div
            className="report-html"
            dangerouslySetInnerHTML={{ __html: research.final_report_html }}
          />
        </div>
      )}
      
      {/* Share Controls */}
      {research.status === "completed" && (
        <div className="share-section">
          <h2>Share Research</h2>
          <div className="share-controls">
            {research.is_public ? (
              <div className="public-link">
                <strong>Public Link:</strong>
                <code>{window.location.origin}/r/{research.short_hash}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/r/{research.short_hash}`);
                    alert("Link copied!");
                  }}
                  className="copy-button"
                >
                  Copy Link
                </button>
              </div>
            ) : (
              <div className="not-public">
                This research is private. Click "Make Public" to generate a shareable link.
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Error Display */}
      {research.status === "failed" && research.error_message && (
        <div className="error-section">
          <h2>Error</h2>
          <p className="error-message">{research.error_message}</p>
        </div>
      )}
    </div>
  );
}

