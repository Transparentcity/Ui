"use client";

import { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useJobWebSocket } from "@/lib/useJobWebSocket";
import JobBadge from "./JobBadge";
import JobDropdown from "./JobDropdown";
import TopNavCitySearch from "./TopNavCitySearch";
import styles from "./TitleBar.module.css";

interface TitleBarProps {
  onMenuToggle: () => void;
  isAdmin?: boolean;
  onCitySelect?: (cityId: number) => void;
  onGPSLocation?: (location: { lat: number; lng: number }) => void;
}

export default function TitleBar({
  onMenuToggle,
  isAdmin = false,
  onCitySelect,
  onGPSLocation,
}: TitleBarProps) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const [isJobDropdownOpen, setIsJobDropdownOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  // Get token for WebSocket connection - enable for all authenticated users
  useEffect(() => {
    if (isAuthenticated) {
      getAccessTokenSilently()
        .then((t) => {
          setToken(t);
          console.log("✅ Job badge: Token obtained for WebSocket connection");
        })
        .catch((err) => {
          console.error("❌ Job badge: Failed to get token:", err);
        });
    } else {
      setToken(null);
    }
  }, [isAuthenticated, getAccessTokenSilently]);

  // Enable job WebSocket for all authenticated users, not just admins
  const { jobs, activeJobs, cancelJob } = useJobWebSocket(token, isAuthenticated);

  const handleCancelJob = async (jobId: string) => {
    if (!token) return;
    await cancelJob(jobId);
  };

  return (
    <header className={styles.titleBar}>
      <div className={styles.titleBarLeft}>
        <button className={styles.menuToggle} id="menu-toggle" onClick={onMenuToggle}>
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div className={styles.logo}>
          <div className={styles.logoCorners}>
            <svg
              viewBox="0 0 100 100"
              xmlns="http://www.w3.org/2000/svg"
              style={{ overflow: "visible" }}
            >
              <defs>
                <mask
                  id="logo-mask-bl"
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
                  id="logo-mask-tr"
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
                className={styles.brace}
                x="0"
                y="0"
                width="100"
                height="100"
                rx="3"
                ry="3"
                mask="url(#logo-mask-bl)"
                fill="#1f2937"
                transform="translate(23.5%, -23.5%)"
              />
              <rect
                className={styles.brace}
                x="0"
                y="0"
                width="100"
                height="100"
                rx="3"
                ry="3"
                mask="url(#logo-mask-tr)"
                fill="#1f2937"
                transform="translate(-23.5%, 23.5%)"
              />
            </svg>
          </div>
          <span className={styles.logoText}>
            <span className={styles.logoTransparent}>transparent</span>
            <span className={styles.logoCity}>.city</span>
          </span>
        </div>
      </div>
      <div className={styles.titleBarRight}>
        {onCitySelect ? (
          <div className={styles.citySearchWrap}>
            <TopNavCitySearch 
              onCitySelect={onCitySelect}
              onGPSLocation={onGPSLocation}
            />
          </div>
        ) : null}

        {/* Job Status Badge - Show for all authenticated users */}
        {isAuthenticated && (
          <div
            className={styles.jobBadgeContainer}
          >
            <JobBadge
              activeJobCount={activeJobs.length}
              onClick={() => setIsJobDropdownOpen(!isJobDropdownOpen)}
            />
            <JobDropdown
              jobs={jobs}
              isOpen={isJobDropdownOpen}
              onClose={() => setIsJobDropdownOpen(false)}
              onCancelJob={handleCancelJob}
            />
          </div>
        )}
      </div>
    </header>
  );
}

