"use client";

import { ResearchItem, ResearchReport } from "@/lib/apiClient";
import Loader from "../Loader";
import styles from "./ResearchProgressView.module.css";

interface ResearchProgressViewProps {
  research: ResearchReport;
  items: ResearchItem[];
  isAdmin?: boolean;
  onSessionClick?: (sessionId: string) => void;
}

export default function ResearchProgressView({
  research,
  items,
  isAdmin = false,
  onSessionClick,
}: ResearchProgressViewProps) {
  // Organize items by status
  const completedItems = items.filter((item) => item.status === "completed");
  const inProgressItems = items.filter((item) => item.status === "in_progress");
  const pendingItems = items.filter((item) => item.status === "pending");
  const failedItems = items.filter((item) => item.status === "failed");

  // Get agenda items if available
  const agendaItems = research.agenda?.structured_items || research.agenda?.research_questions || [];

  // Group items by iteration for better visualization
  const itemsByIteration = items.reduce((acc, item) => {
    const iter = item.iteration_number || 0;
    if (!acc[iter]) acc[iter] = [];
    acc[iter].push(item);
    return acc;
  }, {} as Record<number, ResearchItem[]>);

  const getItemStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <span className={styles.statusIconCompleted}>✓</span>;
      case "failed":
        return <span className={styles.statusIconFailed}>✗</span>;
      case "in_progress":
        return (
          <div className={styles.loaderContainer}>
            <Loader size="sm" color="purple" />
          </div>
        );
      case "pending":
        return <span className={styles.statusIconPending}>○</span>;
      default:
        return <span className={styles.statusIconPending}>○</span>;
    }
  };

  const getItemStatusClass = (status: string) => {
    switch (status) {
      case "completed":
        return styles.itemCompleted;
      case "failed":
        return styles.itemFailed;
      case "in_progress":
        return styles.itemInProgress;
      default:
        return styles.itemPending;
    }
  };

  // If no items exist yet, show a simple message
  if (items.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.progressSummary}>
          <div className={styles.progressHeader}>
            <h3>Research Progress</h3>
            <span className={styles.progressPercent}>0%</span>
          </div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: "0%" }} />
          </div>
          <div className={styles.progressStats}>
            <span>Research items will appear here once execution begins.</span>
          </div>
        </div>
        {agendaItems.length > 0 && (
          <div className={styles.agendaSection}>
            <h3>Research Agenda</h3>
            <div className={styles.agendaList}>
              {Array.isArray(agendaItems) ? (
                agendaItems.map((item: any, idx: number) => {
                  const question = item.research_question || item;
                  return (
                    <div key={idx} className={styles.agendaItem}>
                      <div className={styles.agendaItemHeader}>
                        {getItemStatusIcon("pending")}
                        <span className={styles.agendaQuestion}>{question}</span>
                      </div>
                      {item.why_this_matters && (
                        <div className={styles.agendaDetail}>
                          <strong>Why:</strong> {item.why_this_matters}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className={styles.agendaItem}>
                  <span className={styles.agendaQuestion}>{research.original_prompt}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Overall Progress Summary */}
      <div className={styles.progressSummary}>
        <div className={styles.progressHeader}>
          <h3>Research Progress</h3>
          <span className={styles.progressPercent}>
            {research.progress_percent}%
          </span>
        </div>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${research.progress_percent}%` }}
          />
        </div>
        <div className={styles.progressStats}>
          <span>
            {completedItems.length} completed
            {inProgressItems.length > 0 && ` • ${inProgressItems.length} running`}
            {pendingItems.length > 0 && ` • ${pendingItems.length} pending`}
            {failedItems.length > 0 && ` • ${failedItems.length} failed`}
          </span>
        </div>
      </div>

      {/* Agenda Overview */}
      {agendaItems.length > 0 && (
        <div className={styles.agendaSection}>
          <h3>Research Agenda</h3>
          <div className={styles.agendaList}>
            {Array.isArray(agendaItems) ? (
              agendaItems.map((item: any, idx: number) => {
                const question = item.research_question || item;
                const matchingItem = items.find(
                  (it) => it.research_question === question || it.item_id === `item_${idx + 1}`
                );
                return (
                  <div key={idx} className={styles.agendaItem}>
                    <div className={styles.agendaItemHeader}>
                      {matchingItem ? getItemStatusIcon(matchingItem.status) : getItemStatusIcon("pending")}
                      <span className={styles.agendaQuestion}>{question}</span>
                    </div>
                    {item.why_this_matters && (
                      <div className={styles.agendaDetail}>
                        <strong>Why:</strong> {item.why_this_matters}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className={styles.agendaItem}>
                <span className={styles.agendaQuestion}>
                  {research.original_prompt}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Currently Running Items */}
      {inProgressItems.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>⟳</span>
            Currently Running ({inProgressItems.length})
          </h3>
          <div className={styles.itemsList}>
            {inProgressItems.map((item) => (
              <div
                key={item.item_id}
                className={`${styles.item} ${getItemStatusClass(item.status)}`}
              >
                <div className={styles.itemHeader}>
                  {getItemStatusIcon(item.status)}
                  <div className={styles.itemContent}>
                    <div className={styles.itemQuestion}>{item.research_question}</div>
                    {item.iteration_number !== undefined && (
                      <div className={styles.itemMeta}>
                        Iteration {item.iteration_number + 1}
                        {item.started_at && (
                          <span> • Started {new Date(item.started_at).toLocaleTimeString()}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {isAdmin && item.session_id && onSessionClick && (
                  <button
                    className={styles.sessionButton}
                    onClick={() => onSessionClick(item.session_id!)}
                    title="Review session"
                  >
                    Review
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Items */}
      {completedItems.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>✓</span>
            Completed ({completedItems.length})
          </h3>
          <div className={styles.itemsList}>
            {completedItems.map((item) => (
              <div
                key={item.item_id}
                className={`${styles.item} ${getItemStatusClass(item.status)}`}
              >
                <div className={styles.itemHeader}>
                  {getItemStatusIcon(item.status)}
                  <div className={styles.itemContent}>
                    <div className={styles.itemQuestion}>{item.research_question}</div>
                    <div className={styles.itemMeta}>
                      {item.iteration_number !== undefined && `Iteration ${item.iteration_number + 1}`}
                      {item.completed_at && (
                        <span> • Completed {new Date(item.completed_at).toLocaleTimeString()}</span>
                      )}
                    </div>
                    {item.result && (
                      <div className={styles.itemResult}>
                        {item.result.length > 150
                          ? `${item.result.substring(0, 150)}...`
                          : item.result}
                      </div>
                    )}
                  </div>
                </div>
                {isAdmin && item.session_id && onSessionClick && (
                  <button
                    className={styles.sessionButton}
                    onClick={() => onSessionClick(item.session_id!)}
                    title="Review session"
                  >
                    Review
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failed Items */}
      {failedItems.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>✗</span>
            Failed ({failedItems.length})
          </h3>
          <div className={styles.itemsList}>
            {failedItems.map((item) => (
              <div
                key={item.item_id}
                className={`${styles.item} ${getItemStatusClass(item.status)}`}
              >
                <div className={styles.itemHeader}>
                  {getItemStatusIcon(item.status)}
                  <div className={styles.itemContent}>
                    <div className={styles.itemQuestion}>{item.research_question}</div>
                    {item.error_message && (
                      <div className={styles.itemError}>{item.error_message}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Items */}
      {pendingItems.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>○</span>
            Pending ({pendingItems.length})
          </h3>
          <div className={styles.itemsList}>
            {pendingItems.map((item) => (
              <div
                key={item.item_id}
                className={`${styles.item} ${getItemStatusClass(item.status)}`}
              >
                <div className={styles.itemHeader}>
                  {getItemStatusIcon(item.status)}
                  <div className={styles.itemContent}>
                    <div className={styles.itemQuestion}>{item.research_question}</div>
                    {item.iteration_number !== undefined && (
                      <div className={styles.itemMeta}>
                        Queued for iteration {item.iteration_number + 1}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grouped by Iteration View (Alternative) */}
      {Object.keys(itemsByIteration).length > 1 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>By Iteration</h3>
          <div className={styles.iterationGroups}>
            {Object.entries(itemsByIteration)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([iteration, iterItems]) => (
                <div key={iteration} className={styles.iterationGroup}>
                  <h4 className={styles.iterationTitle}>
                    Iteration {Number(iteration) + 1}
                  </h4>
                  <div className={styles.iterationItems}>
                    {iterItems.map((item) => (
                      <div
                        key={item.item_id}
                        className={`${styles.itemCompact} ${getItemStatusClass(item.status)}`}
                      >
                        {getItemStatusIcon(item.status)}
                        <span className={styles.itemQuestionCompact}>
                          {item.research_question}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

