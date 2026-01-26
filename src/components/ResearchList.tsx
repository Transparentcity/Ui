"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { 
  listResearch, 
  ResearchReport, 
  deleteResearch,
  regenerateResearch,
  resynthesizeResearch,
  updateResearchTitle,
  getAvailableModels,
  ModelGroupInfo
} from "@/lib/apiClient";
import { pickDefaultModelKey } from "@/lib/modelDefaults";
import Loader from "./Loader";
import RenameDialog from "./RenameDialog";
import styles from "./SidebarLists.module.css";

interface ResearchListProps {
  isAdmin?: boolean;
  onResearchClick: (reportId: number) => void;
  currentResearchId?: number | null;
  onResearchDeleted?: (reportId: number) => void;
  onCreateNew?: () => void;
}

export default function ResearchList({
  isAdmin = false,
  onResearchClick,
  currentResearchId,
  onResearchDeleted,
  onCreateNew,
}: ResearchListProps) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const [research, setResearch] = useState<ResearchReport[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null);
  const [renamingReportId, setRenamingReportId] = useState<number | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelGroupInfo[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const lastUpdateRef = useRef<number>(0);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadResearch = async () => {
    try {
      const token = await getAccessTokenSilently();
      const data = await listResearch(token, { limit: 20 });
      setResearch(data.reports);
      setCurrentUserId(data.current_user_id || null);
    } catch (error) {
      console.error("Failed to load research:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadResearch();
      // Load available models for regenerate/resynthesize dropdowns
      (async () => {
        try {
          const token = await getAccessTokenSilently();
          const models = await getAvailableModels(token);
          setAvailableModels(models);
        } catch (error) {
          console.error("Failed to load models:", error);
        }
      })();
    }
  }, [isAuthenticated, getAccessTokenSilently]);

  // Listen for research invalidation events
  useEffect(() => {
    const handleInvalidate = () => {
      console.log("🔄 Research list invalidated, reloading...");
      loadResearch();
    };

    window.addEventListener("research:invalidate", handleInvalidate);
    return () => window.removeEventListener("research:invalidate", handleInvalidate);
  }, [isAuthenticated]);

  // Listen for job updates via WebSocket to refresh when research completes
  useEffect(() => {
    if (!isAuthenticated) return;

    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ job_id: string; data: any }>;
      const jobId = ce.detail?.job_id;
      const data = ce.detail?.data;
      
      if (!jobId) return;
      
      let shouldReload = false;
      
      // Check if this is a research-related job
      if (jobId.startsWith("research_")) {
        console.log(`🔄 ResearchList: Job update for research job ${jobId}, reloading...`);
        shouldReload = true;
      }
      
      // Check for research_progress or research_item_update message types
      if (!shouldReload && data && (data.type === "research_progress" || data.type === "research_item_update")) {
        if (data.report_id) {
          console.log(`🔄 ResearchList: Research progress update for report ${data.report_id}, reloading...`);
          shouldReload = true;
        }
      }
      
      // Check if job status changed to completed/failed (research might be done)
      if (!shouldReload && data?.status) {
        const status = data.status.toLowerCase();
        if ((status === "completed" || status === "failed") && data.description) {
          const desc = data.description.toLowerCase();
          if (desc.includes("research") || desc.includes("research:")) {
            console.log(`🔄 ResearchList: Research job ${jobId} ${status}, reloading...`);
            shouldReload = true;
          }
        }
      }
      
      // Debounce reloads to prevent rapid-fire requests (max once per 500ms)
      if (shouldReload) {
        const now = Date.now();
        if (now - lastUpdateRef.current < 500) {
          // Clear existing timeout and set a new one
          if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
          }
          debounceTimeoutRef.current = setTimeout(() => {
            lastUpdateRef.current = Date.now();
            console.log(`🔄 ResearchList: Debounced reload triggered`);
            void loadResearch();
          }, 500);
        } else {
          lastUpdateRef.current = now;
          console.log(`🔄 ResearchList: Immediate reload triggered`);
          void loadResearch();
        }
      }
    };
    
    if (typeof window !== "undefined") {
      window.addEventListener("job:update", handler);
      console.log(`👂 ResearchList: Listening for job updates`);
    }
    
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("job:update", handler);
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [isAuthenticated]);

  // Poll for running research reports periodically (fallback if WebSocket misses updates)
  useEffect(() => {
    if (!isAuthenticated) return;
    
    // Check if we have any running reports
    const hasRunningReports = research.some(
      (r) => r.status === "running" || r.status === "synthesizing" || r.status === "agenda_ready"
    );
    
    if (!hasRunningReports) {
      return; // No need to poll if nothing is running
    }
    
    console.log(`🔄 ResearchList: Polling for running reports (${research.filter(r => r.status === "running" || r.status === "synthesizing" || r.status === "agenda_ready").length} running)`);
    
    const pollInterval = setInterval(() => {
      void loadResearch();
    }, 5000); // Poll every 5 seconds for running reports
    
    return () => {
      clearInterval(pollInterval);
    };
  }, [isAuthenticated, research]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuId]);

  const handleCopyUrl = (report: ResearchReport) => {
    const url = report.short_hash ? `${window.location.origin}/r/${report.short_hash}` : "";
    if (!url) return;
    navigator.clipboard.writeText(url).catch(() => {});
  };

  const handleRegenerate = async (report: ResearchReport) => {
    if (!confirm("Are you sure you want to regenerate this research? This will re-run the research with the selected model.")) {
      return;
    }
    
    setOpenMenuId(null);
    setRegeneratingId(report.id);
    
    try {
      const token = await getAccessTokenSilently();
      const defaultModel = pickDefaultModelKey(availableModels) || report.model_key || "claude-3-5-sonnet-20241022";
      
      const response = await regenerateResearch(report.id, { model_key: defaultModel }, token);
      
      // Notify job system
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("jobCreated", { detail: response.job_id }));
        window.dispatchEvent(new CustomEvent("research:invalidate"));
      }
      
      // Reload research list
      await loadResearch();
    } catch (err: any) {
      console.error("Failed to regenerate research:", err);
      alert(err.message || "Failed to regenerate research");
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleResynthesize = async (report: ResearchReport) => {
    if (!confirm("Re-synthesize the final report from existing item results? This will NOT re-run research; it only rebuilds the final report.")) {
      return;
    }
    
    setOpenMenuId(null);
    setRegeneratingId(report.id);
    
    try {
      const token = await getAccessTokenSilently();
      const defaultModel = pickDefaultModelKey(availableModels) || report.model_key || "claude-3-5-sonnet-20241022";
      
      const response = await resynthesizeResearch(report.id, { model_key: defaultModel }, token);
      
      // Notify job system
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("jobCreated", { detail: response.job_id }));
        window.dispatchEvent(new CustomEvent("research:invalidate"));
      }
      
      // Reload research list
      await loadResearch();
    } catch (err: any) {
      console.error("Failed to re-synthesize research:", err);
      alert(err.message || "Failed to re-synthesize research");
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleRename = (report: ResearchReport) => {
    setOpenMenuId(null);
    setRenamingReportId(report.id);
  };

  const handleRenameSave = async (newTitle: string) => {
    if (!renamingReportId) return;

    try {
      const token = await getAccessTokenSilently();
      await updateResearchTitle(renamingReportId, newTitle, token);

      // Optimistically update the title in the list
      setResearch((prev) =>
        prev.map((report) =>
          report.id === renamingReportId
            ? { ...report, title: newTitle }
            : report
        )
      );

      // Emit invalidate for other components
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("research:invalidate"));
      }

      // Refresh to confirm backend persistence
      setTimeout(() => {
        loadResearch();
      }, 500);
    } catch (err) {
      console.error("Error renaming research:", err);
      throw err; // Let RenameDialog handle the error display
    } finally {
      setRenamingReportId(null);
    }
  };

  const handleDelete = (reportId: number) => {
    if (!confirm("Delete this research report?")) return;
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        await deleteResearch(reportId, token);
        setOpenMenuId(null);
        // Optimistically remove from list
        setResearch((prev) => prev.filter((r) => r.id !== reportId));
        // Emit invalidate for other components if needed
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("research:invalidate"));
        }
      } catch (err) {
        console.error("Failed to delete research:", err);
        alert("Failed to delete research");
      }
    })();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return "✓";
      case "failed":
        return "✗";
      default:
        return "○";
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "completed":
        return styles.statusCompleted;
      case "failed":
        return styles.statusFailed;
      case "cancelled":
        return styles.statusCancelled;
      case "running":
      case "synthesizing":
        return styles.statusRunning;
      default:
        return styles.statusDraft;
    }
  };

  if (loading) {
    return (
      <div className={styles.listLoading}>
        <span>Loading research...</span>
      </div>
    );
  }

  if (research.length === 0) {
    return (
      <div className={styles.list}>
        {isAdmin && onCreateNew ? (
          <button
            className={`${styles.listItem} ${styles.createNewButton}`}
            onClick={onCreateNew}
          >
            <div className={styles.listItemContent}>
              <div className={styles.listItemHeader}>
                <span className={styles.createIcon}>+</span>
                <span className={styles.listItemTitle}>
                  Create new research report
                </span>
              </div>
            </div>
          </button>
        ) : (
          <div className={styles.listLoading}>
            <span>No research reports yet.</span>
          </div>
        )}
      </div>
    );
  }

  const renamingReport = renamingReportId
    ? research.find((r) => r.id === renamingReportId)
    : null;

  return (
    <>
      <div className={styles.list} ref={rootRef}>
        {research.map((report) => {
          // For admins, identify research that belongs to other users
          const isOtherUserResearch = isAdmin && currentUserId && report.user_id && report.user_id !== currentUserId;
          
          return (
          <div
            key={report.id}
            className={`${styles.item} ${currentResearchId === report.id ? styles.itemActive : ""} ${isOtherUserResearch ? styles.itemOtherUser : ""}`}
            onClick={() => onResearchClick(report.id)}
          >
            <div className={styles.content}>
              <div className={`${styles.title} ${report.status === "cancelled" ? styles.titleCancelled : ""}`} title={report.title}>
                {(report.status === "running" || report.status === "synthesizing") ? (
                  <span className={styles.statusIconLoader}>
                    <Loader size="sm" color="dark" />
                  </span>
                ) : report.status !== "completed" ? (
                  <span className={`${styles.statusIcon} ${getStatusClass(report.status)}`}>
                    {getStatusIcon(report.status)}
                  </span>
                ) : null}{" "}
                {report.title.replace(/^(research|Research):\s*/i, "")}
              </div>
            </div>
            <button
              className={styles.menuBtn}
              aria-label="Research actions"
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuId(openMenuId === report.id ? null : report.id);
              }}
            >
              ⋯
            </button>
            <div
              className={`${styles.menu} ${openMenuId === report.id ? styles.menuShow : ""}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.menuItem} onClick={() => handleRename(report)}>
                ✏️ Rename
              </div>
              {/* Show regenerate/re-synthesize for all statuses except actively running ones */}
              {(report.status !== "running" && report.status !== "synthesizing") && (
                <>
                  <div 
                    className={styles.menuItem} 
                    onClick={() => handleRegenerate(report)}
                    style={{ opacity: regeneratingId === report.id ? 0.5 : 1 }}
                  >
                    {regeneratingId === report.id ? "Regenerating..." : "Regenerate"}
                  </div>
                  <div 
                    className={styles.menuItem} 
                    onClick={() => handleResynthesize(report)}
                    style={{ opacity: regeneratingId === report.id ? 0.5 : 1 }}
                  >
                    {regeneratingId === report.id ? "Re-synthesizing..." : "Re-synthesize"}
                  </div>
                </>
              )}
              <div className={styles.menuItem} onClick={() => handleCopyUrl(report)}>
                Copy URL
              </div>
              <div className={`${styles.menuItem} ${styles.menuItemDelete}`} onClick={() => handleDelete(report.id)}>
                Delete
              </div>
            </div>
          </div>
          );
        })}
      </div>
      {renamingReport && (
        <RenameDialog
          isOpen={true}
          currentName={renamingReport.title.replace(/^(research|Research):\s*/i, "")}
          onClose={() => setRenamingReportId(null)}
          onSave={handleRenameSave}
          title="Rename Research Report"
          maxLength={200}
        />
      )}
    </>
  );
}

