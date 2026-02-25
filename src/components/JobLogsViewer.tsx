"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getJobStats,
  JobStats,
  getScheduledJobSummary,
  ScheduledJobSummary,
  getAllScheduledJobs,
  CustomScheduledJob,
} from "@/lib/apiClient";
import { useJobWebSocketContext } from "@/contexts/JobWebSocketContext";
import Loader from "./Loader";
import ScheduledJobsPanel from "./ScheduledJobsPanel";
import JobListPanel from "./JobListPanel";
import styles from "./JobLogsViewer.module.css";

type TabId = "logs" | "scheduled";

interface TabConfig {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  { id: "logs", label: "Job Logs", icon: "📋" },
  { id: "scheduled", label: "Scheduled Jobs", icon: "🗓" },
];

export default function JobLogsViewer() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [scheduleSummaries, setScheduleSummaries] = useState<ScheduledJobSummary[]>([]);
  const [customSchedules, setCustomSchedules] = useState<CustomScheduledJob[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const jobIdParam = searchParams.get("job_id");
  const [activeTab, setActiveTab] = useState<TabId>(
    tabParam === "scheduled" ? "scheduled" : "logs"
  );

  const { jobs: webSocketJobs, isConnected, refreshJobs } = useJobWebSocketContext();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync tab from URL (e.g. /dashboard?tab=logs&job_id=xxx)
  useEffect(() => {
    if (tabParam === "scheduled") setActiveTab("scheduled");
    else if (tabParam === "logs" || jobIdParam) setActiveTab("logs");
  }, [tabParam, jobIdParam]);

  // Get token for API calls
  useEffect(() => {
    if (isAuthenticated) {
      getAccessTokenSilently()
        .then((t) => {
          setToken(t);
        })
        .catch((err) => {
          console.error("Failed to get token:", err);
        });
    } else {
      setToken(null);
    }
  }, [isAuthenticated, getAccessTokenSilently]);

  // Load stats function
  const loadStats = async () => {
    try {
      const currentToken = token || (await getAccessTokenSilently());
      const response = await getJobStats(currentToken);
      setStats(response.stats);
    } catch (err) {
      console.error("Error loading job stats:", err);
    }
  };

  const loadScheduleSummary = async () => {
    try {
      setScheduleLoading(true);
      setScheduleError(null);
      const currentToken = token || (await getAccessTokenSilently());
      const [schedules, allSchedules] = await Promise.all([
        getScheduledJobSummary(currentToken),
        getAllScheduledJobs(currentToken),
      ]);
      setScheduleSummaries(schedules);
      setCustomSchedules(allSchedules.custom_schedules || []);
    } catch (err) {
      console.error("Error loading schedule summary:", err);
      setScheduleError("Failed to load scheduled jobs.");
    } finally {
      setScheduleLoading(false);
    }
  };

  // Refresh all data
  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      await refreshJobs();
      await loadStats();
      await loadScheduleSummary();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // Load stats on mount
  useEffect(() => {
    if (token) {
      loadStats();
      loadScheduleSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Set loading to false once we have jobs or WebSocket is connected
  useEffect(() => {
    if (isAuthenticated && (isConnected || webSocketJobs.length > 0)) {
      setLoading(false);
    }
  }, [isAuthenticated, isConnected, webSocketJobs.length]);

  // Listen for job update events to refresh stats
  useEffect(() => {
    const handleJobUpdate = () => {
      if (token) {
        setTimeout(() => loadStats(), 1000);
      }
    };

    window.addEventListener("job:update", handleJobUpdate);
    return () => {
      window.removeEventListener("job:update", handleJobUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading && webSocketJobs.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <Loader size="sm" color="dark" />
          <span>Loading jobs...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.title}>Job Administration</h2>
          <div className={styles.connectionStatus}>
            {isConnected ? (
              <span className={styles.connected}>
                <span className={styles.statusDot} />
                Real-time
              </span>
            ) : (
              <span className={styles.disconnected}>
                <span className={styles.statusDotYellow} />
                Polling
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleRefreshAll}
          className={`${styles.refreshButton} ${isRefreshing ? styles.refreshing : ""}`}
          disabled={isRefreshing}
        >
          {isRefreshing ? "Refreshing..." : "Refresh All"}
        </button>
      </div>

      <div className={styles.tabNav}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabButtonActive : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className={styles.tabIcon}>{tab.icon}</span>
            <span className={styles.tabLabel}>{tab.label}</span>
            {tab.id === "logs" && stats && (
              <span className={styles.tabBadge}>{stats.active_count}</span>
            )}
          </button>
        ))}
      </div>

      <div className={styles.tabContent}>
        {activeTab === "logs" && (
          <JobListPanel
            stats={stats}
            getAccessTokenSilently={getAccessTokenSilently}
            token={token}
            initialJobId={jobIdParam || undefined}
          />
        )}
        {activeTab === "scheduled" && (
          <ScheduledJobsPanel
            scheduleSummaries={scheduleSummaries}
            customSchedules={customSchedules}
            scheduleLoading={scheduleLoading}
            scheduleError={scheduleError}
            onRefresh={loadScheduleSummary}
            getAccessTokenSilently={getAccessTokenSilently}
            token={token}
          />
        )}
      </div>
    </div>
  );
}
