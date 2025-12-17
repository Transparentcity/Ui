"use client";

import { Job } from "@/lib/useJobWebSocket";

interface JobBadgeProps {
  activeJobCount: number;
  onClick: () => void;
}

export default function JobBadge({ activeJobCount, onClick }: JobBadgeProps) {
  if (activeJobCount === 0) {
    return null;
  }

  return (
    <button className="job-badge" onClick={onClick}>
      <span className="job-icon">⚙️</span>
      <span className="job-count">{activeJobCount}</span>
    </button>
  );
}


