"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  useCityMetricOrdering,
  useSaveCityMetricOrdering,
  useResetCityMetricOrdering,
} from "@/lib/hooks/useCityAdmin";
import type { MetricOrderingItem } from "@/lib/apiClient";
import styles from "./MetricOrderEditor.module.css";

interface Metric {
  id: number;
  metric_name: string;
  category?: string;
  subcategory?: string | null;
}

interface MetricOrderEditorProps {
  cityId: number;
  metrics: Metric[];
  onOrderChange?: () => void;
}

interface CategoryGroup {
  name: string;
  order: number;
  metrics: Array<{
    metric: Metric;
    order: number;
  }>;
  isExpanded: boolean;
}

/**
 * MetricOrderEditor - Drag and drop editor for category and metric ordering
 * 
 * Features:
 * - Drag categories to reorder them
 * - Drag metrics within categories to reorder
 * - Save ordering to database
 * - Reset to default ordering
 */
export default function MetricOrderEditor({
  cityId,
  metrics,
  onOrderChange,
}: MetricOrderEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [draggedCategoryIndex, setDraggedCategoryIndex] = useState<number | null>(null);
  const [dragOverCategoryIndex, setDragOverCategoryIndex] = useState<number | null>(null);
  const [draggedMetricInfo, setDraggedMetricInfo] = useState<{
    categoryIndex: number;
    metricIndex: number;
  } | null>(null);
  const [dragOverMetricInfo, setDragOverMetricInfo] = useState<{
    categoryIndex: number;
    metricIndex: number;
  } | null>(null);

  // Fetch current ordering from database
  const { data: orderingData, isLoading: isLoadingOrdering } = useCityMetricOrdering(cityId);
  const saveMutation = useSaveCityMetricOrdering();
  const resetMutation = useResetCityMetricOrdering();

  // Build initial category groups from metrics and saved ordering
  useEffect(() => {
    if (!metrics || metrics.length === 0) return;

    // Create a map of saved ordering
    const orderingMap = new Map<string, { categoryOrder: number; metricOrder: number }>();
    if (orderingData?.orderings) {
      orderingData.orderings.forEach((o) => {
        if (o.metric_id) {
          orderingMap.set(`metric_${o.metric_id}`, {
            categoryOrder: o.category_order,
            metricOrder: o.metric_order,
          });
        }
      });
    }

    // Group metrics by category
    const grouped: Record<string, Metric[]> = {};
    metrics.forEach((metric) => {
      const category = metric.category || "Uncategorized";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(metric);
    });

    // Build category groups with ordering
    const groups: CategoryGroup[] = Object.entries(grouped).map(([categoryName, categoryMetrics]) => {
      // Get category order (use first metric's category order or default)
      let categoryOrder = 1000;
      const firstMetricOrder = orderingMap.get(`metric_${categoryMetrics[0]?.id}`);
      if (firstMetricOrder) {
        categoryOrder = firstMetricOrder.categoryOrder;
      }

      // Sort metrics by order, then by name
      const sortedMetrics = categoryMetrics
        .map((metric) => {
          const order = orderingMap.get(`metric_${metric.id}`)?.metricOrder ?? 1000;
          return { metric, order };
        })
        .sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          return a.metric.metric_name.localeCompare(b.metric.metric_name);
        });

      return {
        name: categoryName,
        order: categoryOrder,
        metrics: sortedMetrics,
        isExpanded: false,
      };
    });

    // Sort categories by order, then by name
    groups.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name);
    });

    setCategoryGroups(groups);
    setHasChanges(false);
  }, [metrics, orderingData]);

  // Toggle category expansion
  const toggleCategory = useCallback((index: number) => {
    setCategoryGroups((prev) =>
      prev.map((cat, i) =>
        i === index ? { ...cat, isExpanded: !cat.isExpanded } : cat
      )
    );
  }, []);

  // Category drag handlers
  const handleCategoryDragStart = useCallback((index: number) => {
    setDraggedCategoryIndex(index);
  }, []);

  const handleCategoryDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedCategoryIndex !== null && draggedCategoryIndex !== index) {
      setDragOverCategoryIndex(index);
    }
  }, [draggedCategoryIndex]);

  const handleCategoryDragLeave = useCallback(() => {
    setDragOverCategoryIndex(null);
  }, []);

  const handleCategoryDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedCategoryIndex === null || draggedCategoryIndex === dropIndex) {
      setDraggedCategoryIndex(null);
      setDragOverCategoryIndex(null);
      return;
    }

    setCategoryGroups((prev) => {
      const newGroups = [...prev];
      const [draggedCategory] = newGroups.splice(draggedCategoryIndex, 1);
      const insertIndex = draggedCategoryIndex < dropIndex ? dropIndex - 1 : dropIndex;
      newGroups.splice(insertIndex, 0, draggedCategory);

      // Update order values
      return newGroups.map((cat, i) => ({
        ...cat,
        order: (i + 1) * 100,
      }));
    });

    setHasChanges(true);
    setDraggedCategoryIndex(null);
    setDragOverCategoryIndex(null);
  }, [draggedCategoryIndex]);

  const handleCategoryDragEnd = useCallback(() => {
    setDraggedCategoryIndex(null);
    setDragOverCategoryIndex(null);
  }, []);

  // Metric drag handlers
  const handleMetricDragStart = useCallback((categoryIndex: number, metricIndex: number) => {
    setDraggedMetricInfo({ categoryIndex, metricIndex });
  }, []);

  const handleMetricDragOver = useCallback((e: React.DragEvent, categoryIndex: number, metricIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      draggedMetricInfo !== null &&
      (draggedMetricInfo.categoryIndex !== categoryIndex || draggedMetricInfo.metricIndex !== metricIndex)
    ) {
      setDragOverMetricInfo({ categoryIndex, metricIndex });
    }
  }, [draggedMetricInfo]);

  const handleMetricDragLeave = useCallback(() => {
    setDragOverMetricInfo(null);
  }, []);

  const handleMetricDrop = useCallback((e: React.DragEvent, dropCategoryIndex: number, dropMetricIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (
      draggedMetricInfo === null ||
      (draggedMetricInfo.categoryIndex === dropCategoryIndex &&
        draggedMetricInfo.metricIndex === dropMetricIndex)
    ) {
      setDraggedMetricInfo(null);
      setDragOverMetricInfo(null);
      return;
    }

    // Only allow reordering within the same category
    if (draggedMetricInfo.categoryIndex !== dropCategoryIndex) {
      setDraggedMetricInfo(null);
      setDragOverMetricInfo(null);
      return;
    }

    setCategoryGroups((prev) => {
      const newGroups = [...prev];
      const category = { ...newGroups[dropCategoryIndex] };
      const newMetrics = [...category.metrics];

      const [draggedMetric] = newMetrics.splice(draggedMetricInfo.metricIndex, 1);
      const insertIndex =
        draggedMetricInfo.metricIndex < dropMetricIndex
          ? dropMetricIndex - 1
          : dropMetricIndex;
      newMetrics.splice(insertIndex, 0, draggedMetric);

      // Update order values
      category.metrics = newMetrics.map((m, i) => ({
        ...m,
        order: (i + 1) * 10,
      }));

      newGroups[dropCategoryIndex] = category;
      return newGroups;
    });

    setHasChanges(true);
    setDraggedMetricInfo(null);
    setDragOverMetricInfo(null);
  }, [draggedMetricInfo]);

  const handleMetricDragEnd = useCallback(() => {
    setDraggedMetricInfo(null);
    setDragOverMetricInfo(null);
  }, []);

  // Save ordering to database
  const handleSave = useCallback(async () => {
    const orderings: MetricOrderingItem[] = [];

    categoryGroups.forEach((category, catIndex) => {
      const categoryOrder = (catIndex + 1) * 100;
      category.metrics.forEach((metricItem, metricIndex) => {
        orderings.push({
          category_name: category.name,
          category_order: categoryOrder,
          metric_id: metricItem.metric.id,
          metric_order: (metricIndex + 1) * 10,
        });
      });
    });

    try {
      await saveMutation.mutateAsync({ cityId, orderings });
      setHasChanges(false);
      onOrderChange?.();
    } catch (err) {
      console.error("Failed to save ordering:", err);
    }
  }, [cityId, categoryGroups, saveMutation, onOrderChange]);

  // Reset to default ordering
  const handleReset = useCallback(async () => {
    if (!confirm("Are you sure you want to reset to default ordering?")) {
      return;
    }

    try {
      await resetMutation.mutateAsync(cityId);
      setHasChanges(false);
      onOrderChange?.();
    } catch (err) {
      console.error("Failed to reset ordering:", err);
    }
  }, [cityId, resetMutation, onOrderChange]);

  if (isLoadingOrdering) {
    return <div className={styles.loading}>Loading ordering...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header} onClick={() => setIsExpanded(!isExpanded)}>
        <span className={styles.expandIcon}>{isExpanded ? "▼" : "▶"}</span>
        <h4 className={styles.title}>Reorder Categories & Metrics</h4>
        {hasChanges && <span className={styles.unsavedBadge}>Unsaved changes</span>}
      </div>

      {isExpanded && (
        <div className={styles.content}>
          <div className={styles.instructions}>
            Drag categories to reorder them. Expand a category to reorder metrics within it.
          </div>

          <div className={styles.categoryList}>
            {categoryGroups.map((category, catIndex) => (
              <div
                key={category.name}
                className={`${styles.categoryItem} ${
                  draggedCategoryIndex === catIndex ? styles.dragging : ""
                } ${dragOverCategoryIndex === catIndex ? styles.dragOver : ""}`}
                draggable
                onDragStart={() => handleCategoryDragStart(catIndex)}
                onDragOver={(e) => handleCategoryDragOver(e, catIndex)}
                onDragLeave={handleCategoryDragLeave}
                onDrop={(e) => handleCategoryDrop(e, catIndex)}
                onDragEnd={handleCategoryDragEnd}
              >
                <div className={styles.categoryHeader}>
                  <span className={styles.dragHandle}>⋮⋮</span>
                  <span
                    className={styles.expandToggle}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCategory(catIndex);
                    }}
                  >
                    {category.isExpanded ? "▼" : "▶"}
                  </span>
                  <span className={styles.categoryName}>{category.name}</span>
                  <span className={styles.metricCount}>
                    ({category.metrics.length} metrics)
                  </span>
                </div>

                {category.isExpanded && (
                  <div className={styles.metricList}>
                    {category.metrics.map((metricItem, metricIndex) => (
                      <div
                        key={metricItem.metric.id}
                        className={`${styles.metricItem} ${
                          draggedMetricInfo?.categoryIndex === catIndex &&
                          draggedMetricInfo?.metricIndex === metricIndex
                            ? styles.dragging
                            : ""
                        } ${
                          dragOverMetricInfo?.categoryIndex === catIndex &&
                          dragOverMetricInfo?.metricIndex === metricIndex
                            ? styles.dragOver
                            : ""
                        }`}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          handleMetricDragStart(catIndex, metricIndex);
                        }}
                        onDragOver={(e) => handleMetricDragOver(e, catIndex, metricIndex)}
                        onDragLeave={handleMetricDragLeave}
                        onDrop={(e) => handleMetricDrop(e, catIndex, metricIndex)}
                        onDragEnd={handleMetricDragEnd}
                      >
                        <span className={styles.dragHandle}>⋮⋮</span>
                        <span className={styles.metricName}>
                          {metricItem.metric.metric_name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            <button
              className={styles.saveButton}
              onClick={handleSave}
              disabled={!hasChanges || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving..." : "Save Order"}
            </button>
            <button
              className={styles.resetButton}
              onClick={handleReset}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? "Resetting..." : "Reset to Default"}
            </button>
          </div>

          {saveMutation.isError && (
            <div className={styles.error}>
              Failed to save: {(saveMutation.error as Error)?.message}
            </div>
          )}
          {resetMutation.isError && (
            <div className={styles.error}>
              Failed to reset: {(resetMutation.error as Error)?.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
