"use client";

import { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";
import { listResearch, ResearchReport } from "@/lib/apiClient";
import "./brand-styles.css";
import "./list-styles.css";

export default function ResearchListPage() {
  const { isAuthenticated, isLoading: authLoading, getAccessTokenSilently } = useAuth0();
  const router = useRouter();
  
  const [research, setResearch] = useState<ResearchReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Fetch research list
  useEffect(() => {
    if (isAuthenticated) {
      getAccessTokenSilently().then(token => {
        const filter = statusFilter === "all" ? undefined : statusFilter;
        listResearch(token, { status_filter: filter, limit: 100 })
          .then(data => setResearch(data.reports))
          .catch(err => {
            console.error("Failed to load research:", err);
            setError(err.message || "Failed to load research");
          })
          .finally(() => setLoading(false));
      });
    }
  }, [isAuthenticated, statusFilter, getAccessTokenSilently]);
  
  if (authLoading || loading) {
    return <div className="research-list-page loading">Loading...</div>;
  }
  
  if (!isAuthenticated) {
    return (
      <div className="research-list-page">
        <div className="auth-prompt">
          <h1>Research Library</h1>
          <p>Please log in to view your research reports.</p>
        </div>
      </div>
    );
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
    <div className="research-list-page">
      <div className="list-header">
        <div>
          <h1>Research Library</h1>
          <p>Manage and view your AI-powered research reports</p>
        </div>
        <button
          onClick={() => router.push("/research/new")}
          className="new-research-button"
        >
          + New Research
        </button>
      </div>
      
      <div className="filters">
        <label>Filter by Status:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="status-filter"
        >
          <option value="all">All</option>
          <option value="draft">Draft</option>
          <option value="agenda_ready">Agenda Ready</option>
          <option value="running">Running</option>
          <option value="synthesizing">Synthesizing</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      {research.length === 0 ? (
        <div className="empty-state">
          <h2>No research reports yet</h2>
          <p>Start your first research project to investigate complex questions using AI.</p>
          <button
            onClick={() => router.push("/research/new")}
            className="cta-button"
          >
            Create Your First Research
          </button>
        </div>
      ) : (
        <div className="research-grid">
          {research.map((report) => (
            <div
              key={report.id}
              className="research-card"
              onClick={() => router.push(`/research/${report.id}`)}
            >
              <div className="card-header">
                <h3>{report.title}</h3>
                <span className={`status-badge ${getStatusBadgeClass(report.status)}`}>
                  {report.status}
                </span>
              </div>
              
              <p className="research-prompt">{report.original_prompt}</p>
              
              <div className="card-meta">
                <div className="meta-row">
                  <span>Model: {report.model_key || "Not specified"}</span>
                  {(report.actual_cost_usd != null || report.estimated_cost_usd != null) && (
                    <span>Cost: ${Number(report.actual_cost_usd ?? report.estimated_cost_usd).toFixed(4)}</span>
                  )}
                </div>
                <div className="meta-row">
                  <span>Created: {new Date(report.created_at || "").toLocaleDateString()}</span>
                  {report.is_public && <span className="public-badge">Public</span>}
                </div>
              </div>
              
              {report.status !== "completed" && report.status !== "failed" && (
                <div className="progress-mini">
                  <div className="progress-bar-mini">
                    <div
                      className="progress-fill-mini"
                      style={{ width: `${report.progress_percent}%` }}
                    />
                  </div>
                  <span className="progress-text-mini">
                    {report.progress_percent}% complete ({report.completed_items}/{report.total_items})
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

