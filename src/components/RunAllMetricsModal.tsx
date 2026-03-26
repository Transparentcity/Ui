"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useBatchExecuteMetrics } from "@/lib/hooks/useCityAdmin";
import { useJobWebSocketContext } from "@/contexts/JobWebSocketContext";
import { notifyJobCreated } from "@/lib/useJobWebSocket";
import { getDefaultBatchDateRange } from "@/lib/apiClient";
import styles from "./RunAllMetricsModal.module.css";

interface Metric {
  id: number;
  metric_name: string;
  category?: string;
  subcategory?: string | null;
  freshness?: {
    date_grouping_level?: string;
  };
}

interface MetricResult {
  metric_id: number;
  metric_name: string;
  category?: string;
  status: string;
  job_id?: string;
  period_type?: string;
  error?: string;
}

interface RunAllMetricsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cityId: number;
  cityName: string;
  metrics: Metric[];
}

type PeriodType = "day" | "week" | "month" | "year" | "auto";

/**
 * RunAllMetricsModal - Modal for batch executing metrics
 * 
 * Features:
 * - Date range picker with sensible defaults
 * - Period type selector with auto-detect option
 * - Metric selection with category grouping
 * - Detailed progress tracking with individual metric results
 */
export default function RunAllMetricsModal({
  isOpen,
  onClose,
  cityId,
  cityName,
  metrics,
}: RunAllMetricsModalProps) {
  const { getAccessTokenSilently } = useAuth0();
  const batchExecuteMutation = useBatchExecuteMetrics();
  const { jobs } = useJobWebSocketContext();
  
  // Form state
  const defaultDates = useMemo(() => getDefaultBatchDateRange(), []);
  const [startDate, setStartDate] = useState(defaultDates.startDate);
  const [endDate, setEndDate] = useState(defaultDates.endDate);
  const [periodType, setPeriodType] = useState<PeriodType>("auto");
  const [maxConcurrent, setMaxConcurrent] = useState(3);
  const [selectedMetricIds, setSelectedMetricIds] = useState<Set<number>>(new Set());
  const [selectAll, setSelectAll] = useState(true);
  
  // Job tracking state
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const currentJob = currentJobId ? jobs.find(j => j.job_id === currentJobId) : null;

  // Parse metric results from job result
  const metricResults = useMemo((): MetricResult[] => {
    if (!currentJob?.result) return [];
    try {
      const result = typeof currentJob.result === 'string' 
        ? JSON.parse(currentJob.result) 
        : currentJob.result;
      return result.metrics || [];
    } catch {
      return [];
    }
  }, [currentJob?.result]);

  // Calculate summary stats
  const resultSummary = useMemo(() => {
    const completed = metricResults.filter(r => r.status === 'completed').length;
    const failed = metricResults.filter(r => r.status !== 'completed').length;
    return { completed, failed, total: metricResults.length };
  }, [metricResults]);

  // Initialize selected metrics when modal opens
  useEffect(() => {
    if (isOpen) {
      const allIds = new Set(metrics.map(m => m.id));
      setSelectedMetricIds(allIds);
      setSelectAll(true);
      setCurrentJobId(null);
      setShowResults(false);
    }
  }, [isOpen, metrics]);

  // Group metrics by category
  const groupedMetrics = useMemo(() => {
    const grouped: Record<string, Metric[]> = {};
    metrics.forEach(metric => {
      const category = metric.category || "Uncategorized";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(metric);
    });
    
    // Sort categories and metrics within
    const sorted: Array<{ category: string; metrics: Metric[] }> = [];
    Object.keys(grouped).sort().forEach(category => {
      sorted.push({
        category,
        metrics: grouped[category].sort((a, b) => 
          a.metric_name.localeCompare(b.metric_name)
        ),
      });
    });
    
    return sorted;
  }, [metrics]);

  // Group metric results by category for display
  const groupedResults = useMemo(() => {
    const grouped: Record<string, MetricResult[]> = {};
    metricResults.forEach(result => {
      const category = result.category || "Uncategorized";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(result);
    });
    
    const sorted: Array<{ category: string; results: MetricResult[] }> = [];
    Object.keys(grouped).sort().forEach(category => {
      sorted.push({
        category,
        results: grouped[category].sort((a, b) => 
          (a.metric_name || '').localeCompare(b.metric_name || '')
        ),
      });
    });
    
    return sorted;
  }, [metricResults]);

  // Handle select all toggle
  const handleSelectAllToggle = useCallback(() => {
    if (selectAll) {
      setSelectedMetricIds(new Set());
      setSelectAll(false);
    } else {
      setSelectedMetricIds(new Set(metrics.map(m => m.id)));
      setSelectAll(true);
    }
  }, [selectAll, metrics]);

  // Handle individual metric toggle
  const handleMetricToggle = useCallback((metricId: number) => {
    setSelectedMetricIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(metricId)) {
        newSet.delete(metricId);
      } else {
        newSet.add(metricId);
      }
      setSelectAll(newSet.size === metrics.length);
      return newSet;
    });
  }, [metrics.length]);

  // Handle category toggle (select/deselect all metrics in category)
  const handleCategoryToggle = useCallback((categoryMetrics: Metric[]) => {
    const categoryIds = categoryMetrics.map(m => m.id);
    const allSelected = categoryIds.every(id => selectedMetricIds.has(id));
    
    setSelectedMetricIds(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        categoryIds.forEach(id => newSet.delete(id));
      } else {
        categoryIds.forEach(id => newSet.add(id));
      }
      setSelectAll(newSet.size === metrics.length);
      return newSet;
    });
  }, [selectedMetricIds, metrics.length]);

  // Submit batch execution
  const handleSubmit = useCallback(async () => {
    if (selectedMetricIds.size === 0) {
      alert("Please select at least one metric to execute.");
      return;
    }

    try {
      const result = await batchExecuteMutation.mutateAsync({
        city_id: cityId,
        metric_ids: Array.from(selectedMetricIds),
        period_type: periodType === "auto" ? null : periodType,
        start_date: startDate,
        end_date: endDate,
        max_concurrent: maxConcurrent,
      });

      if (result.job_id) {
        setCurrentJobId(result.job_id);
        notifyJobCreated(result.job_id);
      }
    } catch (err) {
      console.error("Failed to start batch execution:", err);
    }
  }, [
    cityId,
    selectedMetricIds,
    periodType,
    startDate,
    endDate,
    maxConcurrent,
    batchExecuteMutation,
  ]);

  // Reset to run again
  const handleRunAgain = useCallback(() => {
    setCurrentJobId(null);
    setShowResults(false);
  }, []);

  // Don't render if not open
  if (!isOpen) return null;

  const isRunning = currentJob?.status === "running" || currentJob?.status === "pending";
  const isCompleted = currentJob?.status === "completed" || currentJob?.status === "failed";

  const modalContent = (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Run All Metrics</h2>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.content}>
          {/* Progress Section - shown when job is running or completed */}
          {currentJobId && (
            <div className={styles.progressSection}>
              <div className={styles.progressHeader}>
                <h3 className={styles.sectionTitle}>Execution Progress</h3>
                {isCompleted && metricResults.length > 0 && (
                  <button
                    className={styles.toggleResultsBtn}
                    onClick={() => setShowResults(!showResults)}
                  >
                    {showResults ? "Hide Details" : "Show Details"}
                  </button>
                )}
              </div>
              <div className={styles.progressInfo}>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${currentJob?.progress || 0}%` }}
                  />
                </div>
                <div className={styles.progressText}>
                  {currentJob?.progress || 0}% complete
                </div>
                <div className={styles.statusMessage}>
                  {currentJob?.status_message || currentJob?.description || "Starting..."}
                </div>
                
                {/* Summary stats when completed */}
                {isCompleted && metricResults.length > 0 && (
                  <div className={styles.resultSummary}>
                    <span className={styles.summaryCompleted}>
                      ✓ {resultSummary.completed} succeeded
                    </span>
                    {resultSummary.failed > 0 && (
                      <span className={styles.summaryFailed}>
                        ✕ {resultSummary.failed} failed
                      </span>
                    )}
                  </div>
                )}

                {currentJob?.status === "completed" && resultSummary.failed === 0 && (
                  <div className={styles.successMessage}>
                    ✓ All metrics executed successfully
                  </div>
                )}
                {currentJob?.status === "completed" && resultSummary.failed > 0 && (
                  <div className={styles.warningMessage}>
                    ⚠ Completed with {resultSummary.failed} failures
                  </div>
                )}
                {currentJob?.status === "failed" && (
                  <div className={styles.errorMessage}>
                    ✕ Batch execution failed: {currentJob?.error || currentJob?.status_message || "Unknown error"}
                  </div>
                )}
              </div>

              {/* Detailed Results - show after completion */}
              {showResults && metricResults.length > 0 && (
                <div className={styles.resultsSection}>
                  <h4 className={styles.resultsTitle}>Individual Metric Results</h4>
                  <div className={styles.resultsList}>
                    {groupedResults.map(({ category, results }) => (
                      <div key={category} className={styles.resultCategory}>
                        <div className={styles.resultCategoryHeader}>
                          <span className={styles.resultCategoryName}>{category}</span>
                          <span className={styles.resultCategoryCount}>
                            {results.filter(r => r.status === 'completed').length}/{results.length} succeeded
                          </span>
                        </div>
                        <div className={styles.resultItems}>
                          {results.map((result, idx) => (
                            <div
                              key={result.metric_id || idx}
                              className={`${styles.resultItem} ${
                                result.status === 'completed' 
                                  ? styles.resultSuccess 
                                  : styles.resultError
                              }`}
                            >
                              <span className={styles.resultIcon}>
                                {result.status === 'completed' ? '✓' : '✕'}
                              </span>
                              <span className={styles.resultName}>
                                {result.metric_name}
                              </span>
                              {result.period_type && (
                                <span className={styles.resultPeriod}>
                                  {result.period_type}
                                </span>
                              )}
                              {result.error && (
                                <span className={styles.resultErrorText} title={result.error}>
                                  {result.error.length > 50 
                                    ? result.error.substring(0, 50) + '...' 
                                    : result.error}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Configuration Section - shown when not running */}
          {!isRunning && !showResults && !currentJobId && (
            <>
              <div className={styles.cityInfo}>
                <strong>City:</strong> {cityName}
              </div>

              {/* Date Range */}
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Date Range</h3>
                <div className={styles.dateInputs}>
                  <div className={styles.inputGroup}>
                    <label htmlFor="startDate">Start Date</label>
                    <input
                      id="startDate"
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.inputGroup}>
                    <label htmlFor="endDate">End Date</label>
                    <input
                      id="endDate"
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className={styles.input}
                    />
                  </div>
                </div>
              </div>

              {/* Period Type */}
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Period Type</h3>
                <div className={styles.periodTypeSelect}>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="periodType"
                      value="auto"
                      checked={periodType === "auto"}
                      onChange={() => setPeriodType("auto")}
                    />
                    <span>Auto-detect (recommended)</span>
                    <span className={styles.hint}>
                      Uses metric&apos;s date_grouping_level
                    </span>
                  </label>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="periodType"
                      value="day"
                      checked={periodType === "day"}
                      onChange={() => setPeriodType("day")}
                    />
                    <span>Day</span>
                  </label>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="periodType"
                      value="week"
                      checked={periodType === "week"}
                      onChange={() => setPeriodType("week")}
                    />
                    <span>Week</span>
                    <span className={styles.hint}>
                      Weekly time series and weekly anomaly detection
                    </span>
                  </label>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="periodType"
                      value="month"
                      checked={periodType === "month"}
                      onChange={() => setPeriodType("month")}
                    />
                    <span>Month</span>
                  </label>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="periodType"
                      value="year"
                      checked={periodType === "year"}
                      onChange={() => setPeriodType("year")}
                    />
                    <span>Year</span>
                  </label>
                </div>
              </div>

              {/* Concurrency */}
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Concurrency</h3>
                <div className={styles.inputGroup}>
                  <label htmlFor="maxConcurrent">Max concurrent executions</label>
                  <select
                    id="maxConcurrent"
                    value={maxConcurrent}
                    onChange={e => setMaxConcurrent(Number(e.target.value))}
                    className={styles.select}
                  >
                    <option value={1}>1 (slowest, safest)</option>
                    <option value={2}>2</option>
                    <option value={3}>3 (default)</option>
                    <option value={5}>5</option>
                    <option value={10}>10 (fastest)</option>
                  </select>
                </div>
              </div>

              {/* Metric Selection */}
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>
                  Select Metrics ({selectedMetricIds.size} of {metrics.length})
                </h3>
                <div className={styles.selectAllRow}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={selectAll}
                      onChange={handleSelectAllToggle}
                    />
                    <span>Select All</span>
                  </label>
                </div>
                <div className={styles.metricList}>
                  {groupedMetrics.map(({ category, metrics: categoryMetrics }) => {
                    const allSelected = categoryMetrics.every(m =>
                      selectedMetricIds.has(m.id)
                    );
                    const someSelected = categoryMetrics.some(m =>
                      selectedMetricIds.has(m.id)
                    );

                    return (
                      <div key={category} className={styles.categoryGroup}>
                        <label className={styles.categoryLabel}>
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={input => {
                              if (input) {
                                input.indeterminate = someSelected && !allSelected;
                              }
                            }}
                            onChange={() => handleCategoryToggle(categoryMetrics)}
                          />
                          <span className={styles.categoryName}>{category}</span>
                          <span className={styles.categoryCount}>
                            ({categoryMetrics.filter(m => selectedMetricIds.has(m.id)).length}/
                            {categoryMetrics.length})
                          </span>
                        </label>
                        <div className={styles.categoryMetrics}>
                          {categoryMetrics.map(metric => (
                            <label
                              key={metric.id}
                              className={styles.metricLabel}
                            >
                              <input
                                type="checkbox"
                                checked={selectedMetricIds.has(metric.id)}
                                onChange={() => handleMetricToggle(metric.id)}
                              />
                              <span>{metric.metric_name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <div className={styles.footer}>
          {isRunning ? (
            <button className={styles.cancelButton} onClick={onClose}>
              Close (job continues in background)
            </button>
          ) : isCompleted ? (
            <>
              <button className={styles.secondaryButton} onClick={handleRunAgain}>
                Run Again
              </button>
              <button className={styles.primaryButton} onClick={onClose}>
                Done
              </button>
            </>
          ) : (
            <>
              <button className={styles.cancelButton} onClick={onClose}>
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                onClick={handleSubmit}
                disabled={
                  batchExecuteMutation.isPending || selectedMetricIds.size === 0
                }
              >
                {batchExecuteMutation.isPending
                  ? "Starting..."
                  : `Run ${selectedMetricIds.size} Metrics`}
              </button>
            </>
          )}
        </div>

        {batchExecuteMutation.isError && (
          <div className={styles.errorBanner}>
            Failed to start batch execution:{" "}
            {(batchExecuteMutation.error as Error)?.message}
          </div>
        )}
      </div>
    </div>
  );

  // Use portal to render outside the normal DOM hierarchy
  if (typeof window !== "undefined") {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
}
