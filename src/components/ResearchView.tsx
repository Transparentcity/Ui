"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  getResearch,
  getResearchItems,
  runResearchFromAgenda,
  cancelResearch,
  ResearchItem,
  ResearchReport,
  publishResearch,
  regenerateResearch,
  resynthesizeResearch,
  getAvailableModels,
  ModelGroupInfo,
} from "@/lib/apiClient";
import { pickDefaultModelKey } from "@/lib/modelDefaults";
import Loader from "./Loader";
import ResearchProgressView from "./research/ResearchProgressView";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./ResearchView.module.css";

type TabType = "report" | "agenda";

interface ResearchViewProps {
  reportId: number;
  isAdmin?: boolean;
}

export default function ResearchView({ reportId, isAdmin = false }: ResearchViewProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [research, setResearch] = useState<ResearchReport | null>(null);
  const [items, setItems] = useState<ResearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("report");
  const lastUpdateRef = useRef<number>(0);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Regenerate/Resynthesize state
  const [availableModels, setAvailableModels] = useState<ModelGroupInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isResynthesizing, setIsResynthesizing] = useState(false);

  const loadAll = useCallback(async (skipLoadingState = false) => {
    try {
      // Only set loading on initial load (when skipLoadingState is false)
      if (!skipLoadingState) {
        setLoading(true);
      }
      const token = await getAccessTokenSilently();
      const [report, itemsResp] = await Promise.all([
        getResearch(reportId, token),
        getResearchItems(reportId, token),
      ]);
      setResearch(report);
      setItems(itemsResp.items || []);
      setError(null);
    } catch (err: any) {
      console.error("Failed to load research:", err);
      setError(err.message || "Failed to load research");
    } finally {
      setLoading(false);
    }
  }, [reportId, getAccessTokenSilently]);

  useEffect(() => {
    void loadAll();
  }, [reportId, loadAll]);

  // Load available models for regenerate/resynthesize
  useEffect(() => {
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const models = await getAvailableModels(token);
        setAvailableModels(models);
        // Set default model from research or pick a default
        if (research?.model_key) {
          setSelectedModel(research.model_key);
        } else {
          const defaultKey = pickDefaultModelKey(models);
          if (defaultKey) setSelectedModel(defaultKey);
        }
      } catch (err) {
        console.error("Failed to load models:", err);
      }
    })();
  }, [getAccessTokenSilently, research?.model_key]);

  // Poll for updates when research is in draft state (waiting for agenda)
  // Once agenda is ready or research is running, WebSocket handles updates
  useEffect(() => {
    if (!research) return;
    
    // Only poll when research is waiting for agenda (draft status)
    // Once agenda_ready or running, WebSocket takes over
    const shouldPoll = research.status === "draft";
    if (!shouldPoll) {
      console.log(`✅ ResearchView: Research ${reportId} is ${research.status}, using WebSocket (no polling)`);
      return;
    }
    
    console.log(`🔄 ResearchView: Starting polling for research ${reportId} (status: ${research.status}, waiting for agenda)`);
    const pollInterval = setInterval(() => {
      console.log(`🔄 ResearchView: Polling for agenda updates (current status: ${research?.status})`);
      void loadAll(true); // Skip loading state
    }, 3000); // Poll every 3 seconds when waiting for agenda
    
    return () => {
      console.log(`🔄 ResearchView: Stopping polling for research ${reportId}`);
      clearInterval(pollInterval);
    };
  }, [research?.status, reportId, loadAll, research]);

  // Listen for job updates via WebSocket (no polling needed)
  // Use a ref to track current job_id to avoid stale closures
  const currentJobIdRef = useRef<string | null>(null);
  
  // Update ref when research changes
  useEffect(() => {
    currentJobIdRef.current = research?.job_id ?? null;
  }, [research?.job_id]);
  
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ job_id: string; data: any }>;
      const jobId = ce.detail?.job_id;
      const data = ce.detail?.data;
      
      if (!jobId) return;
      
      let shouldReload = false;
      
      // Reload if this job matches our research's job_id (check ref for current value)
      const currentJobId = currentJobIdRef.current;
      if (currentJobId && jobId === currentJobId) {
        console.log(`🔄 ResearchView: Job update for current job ${jobId}, reloading...`);
        shouldReload = true;
      }
      
      // Also check for research-specific updates (format: research_{report_id})
      if (!shouldReload && jobId.startsWith("research_")) {
        const reportIdFromJob = parseInt(jobId.replace("research_", ""));
        if (reportId === reportIdFromJob) {
          console.log(`🔄 ResearchView: Job update for research ${reportId}, reloading...`);
          shouldReload = true;
        }
      }
      
      // Check for research_progress or research_item_update message types
      if (!shouldReload && data && (data.type === "research_progress" || data.type === "research_item_update")) {
        if (data.report_id === reportId) {
          console.log(`🔄 ResearchView: Research progress update for ${reportId}, reloading...`);
          shouldReload = true;
        }
      }
      
      // Also check job description for research mentions
      if (!shouldReload && data?.description) {
        const desc = data.description.toLowerCase();
        if (desc.includes(`research ${reportId}`) || desc.includes(`research_${reportId}`)) {
          console.log(`🔄 ResearchView: Job description mentions research ${reportId}, reloading...`);
          shouldReload = true;
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
            console.log(`🔄 ResearchView: Debounced reload triggered`);
            void loadAll(true); // Skip loading state to avoid flicker
          }, 500);
        } else {
          lastUpdateRef.current = now;
          console.log(`🔄 ResearchView: Immediate reload triggered`);
          void loadAll(true); // Skip loading state to avoid flicker
        }
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("job:update", handler);
      console.log(`👂 ResearchView: Listening for job updates (reportId: ${reportId})`);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("job:update", handler);
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [reportId, loadAll]);

  const handleRun = async () => {
    if (!research) return;
    try {
      const token = await getAccessTokenSilently();
      
      // Optimistic update: show research as running immediately
      setResearch((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: "running" as any,
          job_id: prev.job_id, // Keep existing job_id if any
        };
      });
      
      const resp = await runResearchFromAgenda(reportId, token);
      console.log(`🚀 ResearchView: Started research run, job_id: ${resp.job_id}`);
      
      // Ensure job badge starts tracking immediately
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("jobCreated", { detail: resp.job_id }));
      }
      
      // Update with actual job_id from response
      setResearch((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          job_id: resp.job_id,
        };
      });
      
      // Don't reload immediately - optimistic update is sufficient
      // WebSocket will handle subsequent updates automatically
      // Only do a delayed reload to catch any immediate server-side updates
      setTimeout(() => {
        console.log(`🔄 ResearchView: Delayed reload after start (skip loading state)`);
        void loadAll(true); // Skip loading state to avoid flicker
      }, 1000);
    } catch (err: any) {
      console.error("Failed to start research run:", err);
      // Revert optimistic update on error
      void loadAll();
      alert(err.message || "Failed to start research run");
    }
  };

  const handleCancel = async () => {
    if (!research) return;
    if (!confirm("Cancel this research run?")) return;
    try {
      const token = await getAccessTokenSilently();
      const resp = await cancelResearch(reportId, token);
      // Ensure job badge picks it up
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("jobCreated", { detail: resp.job_id }));
        window.dispatchEvent(new CustomEvent("research:invalidate"));
      }
      await loadAll();
    } catch (err: any) {
      console.error("Failed to cancel research:", err);
      alert(err.message || "Failed to cancel research");
    }
  };

  const handlePublish = async () => {
    if (!research) return;
    
    try {
      const token = await getAccessTokenSilently();
      await publishResearch(reportId, !research.is_public, token);
      await loadAll(); // Reload to get updated state
    } catch (err: any) {
      console.error("Failed to publish research:", err);
      alert("Failed to update research visibility");
    }
  };

  const handleRegenerate = async () => {
    if (!research) return;
    if (!confirm("Are you sure you want to regenerate this research? This will re-run the entire research with the selected model.")) {
      return;
    }
    
    setIsRegenerating(true);
    try {
      const token = await getAccessTokenSilently();
      const modelKey = selectedModel || research.model_key || "claude-3-5-sonnet-20241022";
      
      const response = await regenerateResearch(reportId, { model_key: modelKey }, token);
      
      // Notify job system
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("jobCreated", { detail: response.job_id }));
        window.dispatchEvent(new CustomEvent("research:invalidate"));
      }
      
      // Reload to show updated status
      await loadAll();
    } catch (err: any) {
      console.error("Failed to regenerate research:", err);
      alert(err.message || "Failed to regenerate research");
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleResynthesize = async () => {
    if (!research) return;
    if (!confirm("Re-synthesize the final report from existing item results? This will NOT re-run research; it only rebuilds the final report with the selected model.")) {
      return;
    }
    
    setIsResynthesizing(true);
    try {
      const token = await getAccessTokenSilently();
      const modelKey = selectedModel || research.model_key || "claude-3-5-sonnet-20241022";
      
      const response = await resynthesizeResearch(reportId, { model_key: modelKey }, token);
      
      // Notify job system
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("jobCreated", { detail: response.job_id }));
        window.dispatchEvent(new CustomEvent("research:invalidate"));
      }
      
      // Reload to show updated status
      await loadAll();
    } catch (err: any) {
      console.error("Failed to re-synthesize research:", err);
      alert(err.message || "Failed to re-synthesize research");
    } finally {
      setIsResynthesizing(false);
    }
  };

  const handleSessionClick = (sessionId: string) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("job-session:open", {
          detail: { session_id: sessionId },
        })
      );
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "completed": return styles.statusCompleted;
      case "failed": return styles.statusFailed;
      case "running": return styles.statusRunning;
      case "synthesizing": return styles.statusSynthesizing;
      default: return styles.statusDraft;
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingRow}>
          <Loader size="sm" color="dark" />
          <span>Loading research...</span>
        </div>
      </div>
    );
  }

  if (error || !research) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error || "Research not found"}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>{research.title}</h1>
          <span className={`${styles.statusBadge} ${getStatusBadgeClass(research.status)}`}>
            {research.status}
          </span>
          {(research.status === "running" || research.status === "synthesizing") && research.job_id && (
            <button onClick={handleCancel} className={styles.copyButton}>
              Cancel
            </button>
          )}
        </div>
        
        <div className={styles.meta}>
          <span>Model: {research.model_key || "Not specified"}</span>
          {research.estimated_cost_usd && (
            <span>Est. Cost: ${research.estimated_cost_usd}</span>
          )}
          <span>Created: {research.created_at ? new Date(research.created_at).toLocaleString() : "Unknown"}</span>
          {isAdmin && research.session_id && (
            <span>
              <button
                type="button"
                className={styles.copyButton}
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(
                      new CustomEvent("job-session:open", {
                        detail: { session_id: research.session_id },
                      })
                    );
                  }
                }}
              >
                Review Job Session
              </button>
            </span>
          )}
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.section}>
          <h2>Research Question</h2>
          <p className={styles.prompt}>{research.original_prompt}</p>
        </div>

        {/* Agenda (plan) - Show when agenda exists and status is agenda_ready */}
        {/* Only show "Start Research Run" button when status is agenda_ready */}
        {research.agenda && research.status === "agenda_ready" && (
          <div className={styles.section}>
            <h2>Agenda</h2>
            <div className={styles.agendaContainer}>
              {Array.isArray((research.agenda as any).structured_items) ? (
                <ol className={styles.agendaList}>
                  {(research.agenda as any).structured_items.map((it: any, idx: number) => (
                    <li key={idx} className={styles.agendaListItem}>
                      <div className={styles.agendaItemContent}>
                        <strong className={styles.agendaItemQuestion}>{it.research_question || it}</strong>
                        {it.why_this_matters && (
                          <div className={styles.agendaItemWhy}>
                            <strong>Why:</strong> {it.why_this_matters}
                          </div>
                        )}
                        {it.what_good_looks_like && (
                          <div className={styles.agendaItemCriteria}>
                            <strong>What a good answer looks like:</strong> {it.what_good_looks_like}
                          </div>
                        )}
                        {Array.isArray(it.what_good_looks_like) && it.what_good_looks_like.length > 0 && (
                          <ul className={styles.agendaItemSubList}>
                            {it.what_good_looks_like.map((c: string, subIdx: number) => (
                              <li key={subIdx}>{c}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : Array.isArray((research.agenda as any).items) ? (
                <ol className={styles.agendaList}>
                  {(research.agenda as any).items.map((it: any) => (
                    <li key={it.item_id || it.research_question} className={styles.agendaListItem}>
                      <div className={styles.agendaItemContent}>
                        <strong className={styles.agendaItemQuestion}>{it.research_question}</strong>
                        {Array.isArray(it.what_good_looks_like) && it.what_good_looks_like.length > 0 && (
                          <ul className={styles.agendaItemSubList}>
                            {it.what_good_looks_like.slice(0, 6).map((c: string, idx: number) => (
                              <li key={idx}>{c}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <pre className={styles.errorBox}>{JSON.stringify(research.agenda, null, 2)}</pre>
              )}
            </div>
            <button onClick={handleRun} className={styles.publishButton}>
              Start Research Run
            </button>
          </div>
        )}

        {/* Show agenda when it exists (even during running/synthesizing) */}
        {research.agenda && (research.status === "running" || research.status === "synthesizing") && (
          <div className={styles.section}>
            <h2>Research Agenda</h2>
            <div className={styles.agendaContainer}>
              {Array.isArray((research.agenda as any).structured_items) ? (
                <ol className={styles.agendaList}>
                  {(research.agenda as any).structured_items.map((it: any, idx: number) => {
                    const matchingItem = items.find(
                      (item) => item.research_question === it.research_question
                    );
                    return (
                      <li key={idx} className={styles.agendaListItem}>
                        <div className={styles.agendaItemContent}>
                          <strong className={styles.agendaItemQuestion}>{it.research_question || it}</strong>
                          {matchingItem && (
                            <div className={styles.agendaItemMeta}>
                              <span className={styles.agendaItemStatus}>
                                Status: {matchingItem.status}
                              </span>
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
            </div>
          </div>
        )}

        {/* Compact Progress View - Show when research is running or synthesizing */}
        {(research.status === "running" || research.status === "synthesizing") && (
          <div className={styles.section}>
            <ResearchProgressView
              research={research}
              items={items}
              isAdmin={isAdmin}
              onSessionClick={handleSessionClick}
            />
          </div>
        )}

        {/* Results for completed research */}
        {research.status === "completed" && research.final_report_html && (
          <div className={styles.section}>
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${activeTab === "report" ? styles.tabActive : ""}`}
                onClick={() => setActiveTab("report")}
              >
                Research Report
              </button>
              {research.agenda && (
                <button
                  className={`${styles.tab} ${activeTab === "agenda" ? styles.tabActive : ""}`}
                  onClick={() => setActiveTab("agenda")}
                >
                  Research Agenda
                </button>
              )}
            </div>
            
            {activeTab === "report" && (
              <div className={styles.reportContent}>
                {(() => {
                  const content = research.final_report_html || "";
                  if (!content) {
                    return <p>No report content available.</p>;
                  }
                  
                  // Detect if content is HTML - check for HTML tags
                  // The synthesis prompt now always generates HTML, but we check to be safe
                  const trimmedContent = content.trim();
                  const clearlyHtml = /^<[a-z][a-z0-9]*\b/i.test(trimmedContent) || 
                                     trimmedContent.includes('<h1>') || 
                                     trimmedContent.includes('<h2>') ||
                                     trimmedContent.includes('<p>') ||
                                     trimmedContent.includes('<div>');
                  
                  if (clearlyHtml) {
                    // Render HTML directly
                    return (
                      <div
                        dangerouslySetInnerHTML={{ __html: content }}
                        className={styles.reportHtml}
                      />
                    );
                  } else {
                    // Render markdown (fallback for legacy content)
                    return (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {content}
                      </ReactMarkdown>
                    );
                  }
                })()}
              </div>
            )}
            
            {activeTab === "agenda" && research.agenda && (
              <div className={styles.agendaContainer}>
                {Array.isArray((research.agenda as any).structured_items) ? (
                  <ol className={styles.agendaList}>
                    {(research.agenda as any).structured_items.map((it: any, idx: number) => {
                      // Find matching research item by research_question
                      const matchingItem = items.find(
                        (item) => item.research_question === it.research_question
                      );
                      
                      return (
                        <li key={idx} className={styles.agendaListItem}>
                          <div className={styles.agendaItemContent}>
                            <strong className={styles.agendaItemQuestion}>{it.research_question || it}</strong>
                            {it.why_this_matters && (
                              <div className={styles.agendaItemWhy}>
                                <strong>Why:</strong> {it.why_this_matters}
                              </div>
                            )}
                            {it.what_good_looks_like && (
                              <div className={styles.agendaItemCriteria}>
                                <strong>What a good answer looks like:</strong> {it.what_good_looks_like}
                              </div>
                            )}
                            {Array.isArray(it.what_good_looks_like) && it.what_good_looks_like.length > 0 && (
                              <ul className={styles.agendaItemSubList}>
                                {it.what_good_looks_like.map((c: string, subIdx: number) => (
                                  <li key={subIdx}>{c}</li>
                                ))}
                              </ul>
                            )}
                            
                            {/* Show summary answer if item is completed */}
                            {matchingItem && matchingItem.status === "completed" && matchingItem.result && (
                              <div className={styles.agendaItemResult}>
                                <strong>Summary Answer:</strong>
                                <div className={styles.agendaItemResultText}>
                                  {matchingItem.result.length > 500 
                                    ? `${matchingItem.result.substring(0, 500)}...` 
                                    : matchingItem.result}
                                </div>
                              </div>
                            )}
                            
                            {/* Show status and session link */}
                            {matchingItem && (
                              <div className={styles.agendaItemMeta}>
                                <span className={styles.agendaItemStatus}>
                                  Status: {matchingItem.status}
                                </span>
                                {matchingItem.session_id && isAdmin && (
                                  <button
                                    type="button"
                                    className={styles.agendaSessionLink}
                                    onClick={() => handleSessionClick(matchingItem.session_id!)}
                                  >
                                    Review Agent Session
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : Array.isArray((research.agenda as any).items) ? (
                  <ol className={styles.agendaList}>
                    {(research.agenda as any).items.map((it: any) => {
                      // Find matching research item
                      const matchingItem = items.find(
                        (item) => item.research_question === it.research_question || item.item_id === it.item_id
                      );
                      
                      return (
                        <li key={it.item_id || it.research_question} className={styles.agendaListItem}>
                          <div className={styles.agendaItemContent}>
                            <strong className={styles.agendaItemQuestion}>{it.research_question}</strong>
                            {Array.isArray(it.what_good_looks_like) && it.what_good_looks_like.length > 0 && (
                              <ul className={styles.agendaItemSubList}>
                                {it.what_good_looks_like.slice(0, 6).map((c: string, idx: number) => (
                                  <li key={idx}>{c}</li>
                                ))}
                              </ul>
                            )}
                            
                            {/* Show summary answer if item is completed */}
                            {matchingItem && matchingItem.status === "completed" && matchingItem.result && (
                              <div className={styles.agendaItemResult}>
                                <strong>Summary Answer:</strong>
                                <div className={styles.agendaItemResultText}>
                                  {matchingItem.result.length > 500 
                                    ? `${matchingItem.result.substring(0, 500)}...` 
                                    : matchingItem.result}
                                </div>
                              </div>
                            )}
                            
                            {/* Show status and session link */}
                            {matchingItem && (
                              <div className={styles.agendaItemMeta}>
                                <span className={styles.agendaItemStatus}>
                                  Status: {matchingItem.status}
                                </span>
                                {matchingItem.session_id && isAdmin && (
                                  <button
                                    type="button"
                                    className={styles.agendaSessionLink}
                                    onClick={() => handleSessionClick(matchingItem.session_id!)}
                                  >
                                    Review Agent Session
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <pre className={styles.errorBox}>{JSON.stringify(research.agenda, null, 2)}</pre>
                )}
              </div>
            )}
          </div>
        )}

        {/* Share controls for completed research */}
        {research.status === "completed" && (
          <div className={styles.section}>
            <h2>Share Research</h2>
            <div className={styles.shareControls}>
              <button
                onClick={handlePublish}
                className={styles.publishButton}
              >
                {research.is_public ? "Make Private" : "Make Public"}
              </button>
              {research.is_public && (
                <div className={styles.publicLink}>
                  <strong>Public Link:</strong>
                  <code>{window.location.origin}/r/{research.short_hash}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/r/${research.short_hash}`);
                      alert("Link copied!");
                    }}
                    className={styles.copyButton}
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Regenerate/Re-synthesize options for completed or failed research */}
        {(research.status === "completed" || research.status === "failed") && (
          <div className={styles.section}>
            <h2>Regenerate Options</h2>
            <div className={styles.regenerateControls}>
              <div className={styles.modelSelector}>
                <label htmlFor="model-select" className={styles.modelLabel}>Model:</label>
                <select
                  id="model-select"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className={styles.modelSelect}
                  disabled={isRegenerating || isResynthesizing}
                >
                  {availableModels.map((group) => (
                    <optgroup key={group.label} label={`${group.emoji} ${group.label}`}>
                      {group.models.filter((m) => m.is_available).map((model) => (
                        <option key={model.key} value={model.key}>
                          {model.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className={styles.regenerateActions}>
                <button
                  onClick={handleResynthesize}
                  disabled={isRegenerating || isResynthesizing}
                  className={styles.resynthesizeButton}
                  title="Re-synthesize the final report from existing item results without re-running research"
                >
                  {isResynthesizing ? "Re-synthesizing..." : "Re-synthesize Report"}
                </button>
                <button
                  onClick={handleRegenerate}
                  disabled={isRegenerating || isResynthesizing}
                  className={styles.regenerateButton}
                  title="Re-run the entire research with the selected model"
                >
                  {isRegenerating ? "Regenerating..." : "Regenerate Research"}
                </button>
              </div>
              <p className={styles.regenerateHint}>
                <strong>Re-synthesize:</strong> Rebuilds only the final report from existing research.
                <br />
                <strong>Regenerate:</strong> Re-runs the entire research process from scratch.
              </p>
            </div>
          </div>
        )}

        {/* Error display */}
        {research.status === "failed" && research.error_message && (
          <div className={styles.section}>
            <h2>Error</h2>
            <div className={styles.errorBox}>{research.error_message}</div>
          </div>
        )}
      </div>
    </div>
  );
}

