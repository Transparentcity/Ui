"use client";

import { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useJobWebSocketContext } from "@/contexts/JobWebSocketContext";
import GiftButton from "./GiftButton";
import JobBadge from "./JobBadge";
import JobDropdown from "./JobDropdown";
import styles from "./TitleBar.module.css";

interface TitleBarProps {
  onMenuToggle: () => void;
  isAdmin?: boolean;
  sidebarOpen?: boolean;
}

export default function TitleBar({
  onMenuToggle,
  isAdmin = false,
  sidebarOpen = false,
}: TitleBarProps) {
  const { isAuthenticated } = useAuth0();
  const [isJobDropdownOpen, setIsJobDropdownOpen] = useState(false);

  // Use shared job WebSocket context (single connection for entire app)
  const { jobs, activeJobs, cancelJob, cancelAllJobs, refreshJobs } = useJobWebSocketContext();

  const handleCancelJob = async (jobId: string) => {
    await cancelJob(jobId);
  };

  const handleCancelAllJobs = async () => {
    await cancelAllJobs();
  };

  // Refresh jobs when dropdown is opened to ensure data is fresh
  const handleToggleDropdown = () => {
    const willOpen = !isJobDropdownOpen;
    setIsJobDropdownOpen(willOpen);
    
    // Refresh jobs when opening the dropdown
    if (willOpen) {
      refreshJobs();
    }
  };

  return (
    <>
      <header className={`${styles.titleBar} ${!sidebarOpen ? styles.sidebarCollapsed : ""}`}>
        {/* Hamburger button - visible when sidebar is closed, appears in top left of content area */}
        {!sidebarOpen && (
          <button
            className={styles.hamburgerButton}
            onClick={onMenuToggle}
            aria-label="Open menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        )}
      </header>
      {/* Gift subscription button — admins only while feature is in beta */}
      {isAuthenticated && isAdmin && (
        <div className={styles.giftButtonContainer}>
          <GiftButton isAdmin={isAdmin} />
        </div>
      )}

      {/* Job Status Badge - Fixed in top right, only visible to admins */}
      {isAuthenticated && isAdmin && (
        <div className={styles.jobBadgeContainer}>
          <JobBadge
            activeJobCount={activeJobs.length}
            onClick={handleToggleDropdown}
          />
          <JobDropdown
            jobs={jobs}
            isOpen={isJobDropdownOpen}
            onClose={() => setIsJobDropdownOpen(false)}
            onCancelJob={handleCancelJob}
            onCancelAll={handleCancelAllJobs}
            onRefresh={refreshJobs}
          />
        </div>
      )}
    </>
  );
}

