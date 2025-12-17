"use client";

import { useEffect, useState, useRef } from "react";
import { Job } from "@/lib/useJobWebSocket";

interface JobDropdownProps {
  jobs: Job[];
  isOpen: boolean;
  onClose: () => void;
  onCancelJob: (jobId: string) => Promise<void>;
}

function formatElapsedTime(startTime: string | null | undefined, endTime: string | null | undefined): string {
  if (!startTime) {
    return "Not started";
  }

  const startDate = new Date(startTime);
  if (isNaN(startDate.getTime())) {
    return "Not started";
  }

  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const start = startDate.getTime();

  let elapsed = Math.floor((end - start) / 1000);

  if (elapsed < 0) {
    console.warn("Negative elapsed time detected, using 0:", { start, end, elapsed });
    elapsed = 0;
  }

  if (elapsed < 60) return `${elapsed}s`;
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  return `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;
}

function JobItem({ job, onCancel }: { job: Job; onCancel: (jobId: string) => Promise<void> }) {
  const [isCancelling, setIsCancelling] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(
    formatElapsedTime(job.started_at, job.completed_at)
  );
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const isRunning = job.status === "running" || job.status === "pending";

  // Update elapsed time every second for running jobs
  useEffect(() => {
    if (isRunning && job.started_at) {
      intervalRef.current = setInterval(() => {
        setElapsedTime(formatElapsedTime(job.started_at, null));
      }, 1000);
    } else {
      setElapsedTime(formatElapsedTime(job.started_at, job.completed_at));
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, job.started_at, job.completed_at]);

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await onCancel(job.job_id);
    } catch (error) {
      console.error("Failed to cancel job:", error);
    } finally {
      setIsCancelling(false);
    }
  };

  const canCancel = job.status === "running" || job.status === "pending";

  // Escape HTML in job description and status message
  const description = (job.description || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const statusMessage = (job.status_message || "Processing...")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return (
    <div className="job-item" data-job-id={job.job_id}>
      <div className="job-item-header">
        <h4 className="job-item-title" dangerouslySetInnerHTML={{ __html: description }} />
        <span className={`job-status-badge ${job.status}`}>{job.status}</span>
      </div>
      <div className="job-status-message" dangerouslySetInnerHTML={{ __html: statusMessage }} />
      <div className="job-progress-bar">
        <div className="job-progress-fill" style={{ width: `${job.progress}%` }} />
      </div>
      <div className="job-item-footer">
        <span className="job-elapsed-time">{elapsedTime}</span>
        {canCancel && (
          <button
            className="job-cancel-btn"
            data-job-id={job.job_id}
            onClick={handleCancel}
            disabled={isCancelling}
          >
            {isCancelling ? "Cancelling..." : "Cancel"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function JobDropdown({
  jobs,
  isOpen,
  onClose,
  onCancelJob,
}: JobDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  // Sort jobs by created_at (newest first)
  const sortedJobs = [...jobs].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateB - dateA;
  });

  return (
    <div className="job-dropdown" ref={dropdownRef}>
      <div className="job-dropdown-header">
        <h3>Background Jobs</h3>
        <button className="job-close-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="job-list">
        {sortedJobs.length === 0 ? (
          <div className="job-empty-state">No active jobs</div>
        ) : (
          sortedJobs.map((job) => (
            <JobItem key={job.job_id} job={job} onCancel={onCancelJob} />
          ))
        )}
      </div>
    </div>
  );
}


