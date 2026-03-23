import React, { useEffect, useState } from "react";
import "./ResearchProgressWidget.css";

export interface ResearchProgress {
  report_id: number;
  title: string;
  status: string;
  progress_percent: number;
  completed_items: number;
  total_items: number;
  current_iteration: number;
  max_iterations: number;
  error_message?: string;
}

interface ResearchProgressWidgetProps {
  reportId: number;
  initialData?: ResearchProgress;
  onComplete?: (reportId: number) => void;
  compact?: boolean;
}

export function ResearchProgressWidget({
  reportId,
  initialData,
  onComplete,
  compact = false
}: ResearchProgressWidgetProps) {
  const [progress, setProgress] = useState<ResearchProgress | null>(initialData || null);
  const [isExpanded, setIsExpanded] = useState(!compact);
  
  // WebSocket connection for real-time updates
  useEffect(() => {
    // TODO: Connect to WebSocket for real-time progress
    // const ws = new WebSocket(`ws://localhost:8000/ws/jobs?job_id=research_${reportId}`);
    // ws.onmessage = (event) => {
    //   const data = JSON.parse(event.data);
    //   if (data.type === 'research_progress' && data.report_id === reportId) {
    //     setProgress(data.data);
    //     if (data.data.status === 'completed' && onComplete) {
    //       onComplete(reportId);
    //     }
    //   }
    // };
    // return () => ws.close();
  }, [reportId, onComplete]);
  
  if (!progress) {
    return (
      <div className="research-widget loading">
        <div className="spinner" />
        <span>Loading research progress...</span>
      </div>
    );
  }
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "#28a745";
      case "failed": return "#dc3545";
      case "running": return "#007bff";
      case "synthesizing": return "#17a2b8";
      default: return "#6c757d";
    }
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return "✓";
      case "failed": return "✗";
      case "running": return "⟳";
      case "synthesizing": return "◉";
      default: return "○";
    }
  };
  
  return (
    <div className={`research-widget ${compact ? "compact" : "full"}`}>
      <div
        className="widget-header"
        onClick={() => compact && setIsExpanded(!isExpanded)}
        style={{ cursor: compact ? "pointer" : "default" }}
      >
        <div className="header-left">
          <span
            className="status-icon"
            style={{ color: getStatusColor(progress.status) }}
          >
            {getStatusIcon(progress.status)}
          </span>
          <span className="widget-title">{progress.title}</span>
        </div>
        <div className="header-right">
          <span className="progress-badge">
            {progress.progress_percent}%
          </span>
          {compact && (
            <span className="expand-icon">{isExpanded ? "▼" : "▶"}</span>
          )}
        </div>
      </div>
      
      {(isExpanded || !compact) && (
        <div className="widget-content">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${progress.progress_percent}%`,
                background: getStatusColor(progress.status)
              }}
            />
          </div>
          
          <div className="progress-details">
            <div className="detail-row">
              <span className="detail-label">Status:</span>
              <span className="detail-value" style={{ color: getStatusColor(progress.status) }}>
                {progress.status}
              </span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">Progress:</span>
              <span className="detail-value">
                {progress.completed_items} / {progress.total_items} items
              </span>
            </div>
          </div>
          
          {progress.error_message && (
            <div className="error-box">
              <strong>Error:</strong> {progress.error_message}
            </div>
          )}
          
          <div className="widget-actions">
            <a
              href={`/research/${progress.report_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="view-button"
            >
              View Full Report →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default ResearchProgressWidget;


