"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  getResearch,
  getResearchItems,
  submitScopeAnswers,
  runResearchFromAgenda,
  cancelResearch,
  ResearchItem,
  ResearchReport,
  publishResearch,
  regenerateResearch,
  resynthesizeResearch,
  getAvailableModels,
  ModelGroupInfo,
  generateFeedStoriesFromResearch,
  listFeedStories,
} from "@/lib/apiClient";
import { pickDefaultModelKey } from "@/lib/modelDefaults";
import Loader from "./Loader";
import ResearchProgressView from "./research/ResearchProgressView";
import ReportContent from "./ReportContent";
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
  
  // Feed stories state
  const [feedStoriesCount, setFeedStoriesCount] = useState<number | null>(null);
  const [isCheckingFeedStories, setIsCheckingFeedStories] = useState(false);
  const [isGeneratingFeedStories, setIsGeneratingFeedStories] = useState(false);
  const [scopeAnswerValues, setScopeAnswerValues] = useState<string[]>([]);
  const [isSubmittingScope, setIsSubmittingScope] = useState(false);

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

  // Check for existing feed stories when research is completed
  useEffect(() => {
    const checkFeedStories = async () => {
      if (!research || research.status !== "completed") {
        setFeedStoriesCount(null);
        return;
      }
      
      setIsCheckingFeedStories(true);
      try {
        const token = await getAccessTokenSilently();
        const response = await listFeedStories(token, {
          research_report_id: reportId,
          limit: 100,
        });
        setFeedStoriesCount(response.count);
      } catch (err) {
        console.error("Failed to check feed stories:", err);
        setFeedStoriesCount(null);
      } finally {
        setIsCheckingFeedStories(false);
      }
    };
    
    void checkFeedStories();
  }, [research, reportId, getAccessTokenSilently]);

  // Poll for updates when research is in draft state (waiting for agenda)
  // Once agenda is ready or research is running, WebSocket handles updates
  useEffect(() => {
    if (!research) return;
    
    // Poll when waiting for scoping or agenda (draft / scoping_ready)
    const shouldPoll = research.status === "draft" || research.status === "scoping_ready";
    if (!shouldPoll) {
      return;
    }
    
    const pollInterval = setInterval(() => {
      void loadAll(true); // Skip loading state
    }, 3000); // Poll every 3 seconds when waiting for agenda
    
    return () => {
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
        shouldReload = true;
      }
      
      // Also check for research-specific updates (format: research_{report_id})
      if (!shouldReload && jobId.startsWith("research_")) {
        const reportIdFromJob = parseInt(jobId.replace("research_", ""));
        if (reportId === reportIdFromJob) {
          shouldReload = true;
        }
      }
      
      // Check for research_progress or research_item_update message types
      if (!shouldReload && data && (data.type === "research_progress" || data.type === "research_item_update")) {
        if (data.report_id === reportId) {
          shouldReload = true;
        }
      }
      
      // Also check job description for research mentions
      if (!shouldReload && data?.description) {
        const desc = data.description.toLowerCase();
        if (desc.includes(`research ${reportId}`) || desc.includes(`research_${reportId}`)) {
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
            void loadAll(true); // Skip loading state to avoid flicker
          }, 500);
        } else {
          lastUpdateRef.current = now;
          void loadAll(true); // Skip loading state to avoid flicker
        }
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("job:update", handler);
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

  const handleSubmitScopeAndRun = async () => {
    if (!research || research.status !== "scoping_ready") return;
    const sq = research.scoping_questions;
    const questions = sq?.questions ?? [];
    const answers = questions.length > 0
      ? scopeAnswerValues.slice(0, questions.length).map((a) => a.trim()).filter(Boolean)
      : [research.original_prompt];
    if (answers.length === 0) {
      alert("Please answer at least one scoping question or describe your focus.");
      return;
    }
    setIsSubmittingScope(true);
    try {
      const token = await getAccessTokenSilently();
      await submitScopeAnswers(reportId, { answers }, token);
      const resp = await runResearchFromAgenda(reportId, token);
      if (resp?.job_id && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("jobCreated", { detail: resp.job_id }));
      }
      await loadAll();
    } catch (err: any) {
      console.error("Failed to submit scope and run:", err);
      alert(err.message || "Failed to start research");
    } finally {
      setIsSubmittingScope(false);
    }
  };

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
      const modelKey = selectedModel || research.model_key || "claude-sonnet-4.6";
      
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
      const modelKey = selectedModel || research.model_key || "claude-sonnet-4.6";
      
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

  const handleGenerateFeedStories = async () => {
    if (!research) return;
    
    setIsGeneratingFeedStories(true);
    try {
      const token = await getAccessTokenSilently();
      
      // Extract city_id and district from research report
      const cityId = research.city_id;
      const district = research.district ? parseInt(research.district) : 0;
      const frequency = (research as any).metadata?.frequency || "weekly";
      
      if (!cityId) {
        alert("Cannot generate feed stories: Research report missing city_id. Please provide city_id manually.");
        return;
      }
      
      const response = await generateFeedStoriesFromResearch(
        reportId,
        {
          city_id: cityId,
          district: district,
          newsletter_frequency: frequency,
          story_count: 3,
        },
        token
      );
      
      // Update feed stories count
      setFeedStoriesCount(response.stories_created);
      
      alert(`Successfully generated ${response.stories_created} feed stories!`);
    } catch (err: any) {
      console.error("Failed to generate feed stories:", err);
      alert(err.message || "Failed to generate feed stories");
    } finally {
      setIsGeneratingFeedStories(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "completed": return styles.statusCompleted;
      case "failed": return styles.statusFailed;
      case "running": return styles.statusRunning;
      case "synthesizing": return styles.statusSynthesizing;
      case "scoping_ready": return styles.statusDraft;
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
      <div className={`${styles.header} dashboard-page-header`}>
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
          {research.actual_cost_usd != null && (
            <span>Cost: ${Number(research.actual_cost_usd).toFixed(4)}</span>
          )}
          <span>Created: {research.created_at ? new Date(research.created_at).toLocaleString() : "Unknown"}</span>
          {isAdmin && research.session_id && (
            <span>
              <button
                type="button"
                className={styles.copyButton}
                onClick={() => handleSessionClick(research.session_id!)}
              >
                Review Job Session
              </button>
            </span>
          )}
          {isAdmin && research.synthesis_session_id && (
            <span>
              <button
                type="button"
                className={styles.copyButton}
                onClick={() => handleSessionClick(research.synthesis_session_id!)}
              >
                Review Synthesis Session
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

        {/* Scoping: when status is scoping_ready, show questions and submit + run */}
        {research.status === "scoping_ready" && research.scoping_questions && (
          <div className={styles.section}>
            <h2>Narrow your focus</h2>
            {research.scoping_questions.narrative && (
              <p className={styles.prompt}>{research.scoping_questions.narrative}</p>
            )}
            <div className={styles.agendaContainer}>
              {(research.scoping_questions.questions ?? []).map((q: string, idx: number) => (
                <div key={idx} className={styles.agendaListItem}>
                  <label className={styles.agendaItemQuestion}>{q}</label>
                  <input
                    type="text"
                    className={styles.copyButton}
                    style={{ display: "block", marginTop: 4, padding: 8, width: "100%", maxWidth: 480 }}
                    placeholder="Your answer..."
                    value={scopeAnswerValues[idx] ?? ""}
                    onChange={(e) => {
                      const next = [...scopeAnswerValues];
                      next[idx] = e.target.value;
                      setScopeAnswerValues(next);
                    }}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={handleSubmitScopeAndRun}
              disabled={isSubmittingScope}
              className={styles.publishButton}
            >
              {isSubmittingScope ? "Starting…" : "Submit focus & Start research"}
            </button>
          </div>
        )}

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
                <ReportContent
                  content={research.final_report_html || ""}
                  className={styles.reportHtml}
                />
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


        {/* Feed Stories section for completed research */}
        {research.status === "completed" && (
          <div className={styles.section}>
            <h2>Feed Stories</h2>
            <div className={styles.shareControls}>
              {isCheckingFeedStories ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Loader size="sm" color="dark" />
                  <span>Checking for existing feed stories...</span>
                </div>
              ) : feedStoriesCount !== null && feedStoriesCount > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
                    ✓ {feedStoriesCount} feed {feedStoriesCount === 1 ? "story" : "stories"} already generated
                  </div>
                  <button
                    onClick={handleGenerateFeedStories}
                    disabled={isGeneratingFeedStories}
                    className={styles.publishButton}
                    style={{ alignSelf: "flex-start" }}
                  >
                    {isGeneratingFeedStories ? (
                      <>
                        <Loader size="sm" color="white" />
                        <span style={{ marginLeft: "8px" }}>Generating...</span>
                      </>
                    ) : (
                      "Generate More Feed Stories"
                    )}
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
                    No feed stories generated yet. Generate stories to add this research to the feed.
                  </div>
                  <button
                    onClick={handleGenerateFeedStories}
                    disabled={isGeneratingFeedStories}
                    className={styles.publishButton}
                    style={{ alignSelf: "flex-start" }}
                  >
                    {isGeneratingFeedStories ? (
                      <>
                        <Loader size="sm" color="white" />
                        <span style={{ marginLeft: "8px" }}>Generating...</span>
                      </>
                    ) : (
                      "Generate Feed Stories"
                    )}
                  </button>
                </div>
              )}
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

