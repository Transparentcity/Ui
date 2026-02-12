"use client";

import { useState, useEffect, useCallback } from "react";
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
  /** From metrics table: subcategory. API may return as subcategory or sub_category. */
  subcategory?: string | null;
  sub_category?: string | null;
}

interface MetricOrderEditorProps {
  cityId: number;
  metrics: Metric[];
  onOrderChange?: () => void;
}

interface SubcategoryGroup {
  name: string | null;
  metrics: Array<{
    metric: Metric;
    order: number;
  }>;
}

interface CategoryGroup {
  name: string;
  order: number;
  subcategories: SubcategoryGroup[];
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
  const [draggedSubcategoryInfo, setDraggedSubcategoryInfo] = useState<{
    categoryIndex: number;
    subcategoryIndex: number;
  } | null>(null);
  const [dragOverSubcategoryInfo, setDragOverSubcategoryInfo] = useState<{
    categoryIndex: number;
    subcategoryIndex: number;
  } | null>(null);
  const [draggedMetricInfo, setDraggedMetricInfo] = useState<{
    categoryIndex: number;
    subcategoryIndex: number;
    metricIndex: number;
  } | null>(null);
  const [dragOverMetricInfo, setDragOverMetricInfo] = useState<{
    categoryIndex: number;
    subcategoryIndex: number;
    metricIndex: number;
  } | null>(null);

  // Fetch current ordering from database
  const { data: orderingData, isLoading: isLoadingOrdering } = useCityMetricOrdering(cityId);
  const saveMutation = useSaveCityMetricOrdering();
  const resetMutation = useResetCityMetricOrdering();

  // Build initial category groups from metrics and saved ordering
  // Uses the same ordering logic as the dashboard (CityView.tsx)
  useEffect(() => {
    if (!metrics || metrics.length === 0) return;

    // Create a map of saved ordering - same structure as dashboard
    const orderingMap = new Map<number, { 
      categoryOrder: number; 
      metricOrder: number; 
      categoryName: string;
      subcategoryName: string | null;
    }>();
    if (orderingData?.orderings) {
      orderingData.orderings.forEach((o) => {
        if (o.metric_id) {
          orderingMap.set(o.metric_id, {
            categoryOrder: o.category_order,
            metricOrder: o.metric_order,
            categoryName: o.category_name,
            subcategoryName: o.subcategory_name ?? null,
          });
        }
      });
    }

    // Group metrics by category using saved ordering's categoryName (same as dashboard)
    const grouped: Record<string, { metrics: Array<{ metric: Metric; order: number; overrideSubcategory?: string | null }>; categoryOrder: number }> = {};
    
    metrics.forEach((metric) => {
      const ordering = orderingMap.get(metric.id);
      // Use ordering?.categoryName first (from saved ordering), then fallback to metric.category
      const category = ordering?.categoryName || metric.category || "Uncategorized";
      const categoryOrder = ordering?.categoryOrder ?? 1000;
      const metricOrder = ordering?.metricOrder ?? 1000;
      // Use ordering's subcategory if set (allows cross-subcategory moves to persist)
      const overrideSubcategory = ordering?.subcategoryName;
      
      if (!grouped[category]) {
        grouped[category] = { metrics: [], categoryOrder };
      }
      // Update category order to match any metric in it (they should all have the same)
      grouped[category].categoryOrder = Math.min(grouped[category].categoryOrder, categoryOrder);
      
      grouped[category].metrics.push({ metric, order: metricOrder, overrideSubcategory });
    });

    // Sort categories by their order, then alphabetically (same as dashboard)
    const sortedCategoryNames = Object.keys(grouped).sort((a, b) => {
      const orderA = grouped[a].categoryOrder;
      const orderB = grouped[b].categoryOrder;
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b);
    });

    // Build category groups with subcategory grouping (matching dashboard behavior)
    const groups: CategoryGroup[] = sortedCategoryNames.map((categoryName) => {
      const { metrics: categoryMetrics, categoryOrder } = grouped[categoryName];
      
      // Sort metrics by order, then by name
      const sortedMetrics = [...categoryMetrics].sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.metric.metric_name.localeCompare(b.metric.metric_name);
      });

      // Group metrics by subcategory within this category (same as dashboard)
      // Use overrideSubcategory from saved ordering if available, otherwise use metric's native subcategory
      const subcategoryMap = new Map<string | null, Array<{ metric: Metric; order: number }>>();
      
      sortedMetrics.forEach((metricItem) => {
        // Use saved subcategory override if defined, otherwise use metric's native subcategory
        // Support both subcategory and sub_category (metrics table column is subcategory)
        const rawSub = metricItem.overrideSubcategory !== undefined
          ? metricItem.overrideSubcategory
          : (metricItem.metric.subcategory ?? metricItem.metric.sub_category ?? null);
        const subcat = (rawSub && String(rawSub).trim()) || null;
        if (!subcategoryMap.has(subcat)) {
          subcategoryMap.set(subcat, []);
        }
        // Store without overrideSubcategory for the final structure
        subcategoryMap.get(subcat)!.push({ metric: metricItem.metric, order: metricItem.order });
      });

      // Convert to array and sort (null subcategory first, then alphabetically)
      const subcategories: SubcategoryGroup[] = [];
      subcategoryMap.forEach((metrics, subcategory) => {
        subcategories.push({ name: subcategory, metrics });
      });
      subcategories.sort((a, b) => {
        if (a.name === null && b.name === null) return 0;
        if (a.name === null) return -1;
        if (b.name === null) return 1;
        return a.name.localeCompare(b.name);
      });

      return {
        name: categoryName,
        order: categoryOrder,
        subcategories,
        isExpanded: false,
      };
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

  // Subcategory drag handlers
  const handleSubcategoryDragStart = useCallback((e: React.DragEvent, categoryIndex: number, subcategoryIndex: number) => {
    e.stopPropagation();
    setDraggedSubcategoryInfo({ categoryIndex, subcategoryIndex });
  }, []);

  const handleSubcategoryDragOver = useCallback((e: React.DragEvent, categoryIndex: number, subcategoryIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      draggedSubcategoryInfo !== null &&
      draggedSubcategoryInfo.categoryIndex === categoryIndex &&
      draggedSubcategoryInfo.subcategoryIndex !== subcategoryIndex
    ) {
      setDragOverSubcategoryInfo({ categoryIndex, subcategoryIndex });
    }
  }, [draggedSubcategoryInfo]);

  const handleSubcategoryDragLeave = useCallback(() => {
    setDragOverSubcategoryInfo(null);
  }, []);

  const handleSubcategoryDrop = useCallback((e: React.DragEvent, dropCategoryIndex: number, dropSubcategoryIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (
      draggedSubcategoryInfo === null ||
      draggedSubcategoryInfo.categoryIndex !== dropCategoryIndex ||
      draggedSubcategoryInfo.subcategoryIndex === dropSubcategoryIndex
    ) {
      setDraggedSubcategoryInfo(null);
      setDragOverSubcategoryInfo(null);
      return;
    }

    setCategoryGroups((prev) => {
      const newGroups = [...prev];
      const category = { ...newGroups[dropCategoryIndex] };
      const newSubcategories = [...category.subcategories];

      const [draggedSubcategory] = newSubcategories.splice(draggedSubcategoryInfo.subcategoryIndex, 1);
      const insertIndex =
        draggedSubcategoryInfo.subcategoryIndex < dropSubcategoryIndex
          ? dropSubcategoryIndex - 1
          : dropSubcategoryIndex;
      newSubcategories.splice(insertIndex, 0, draggedSubcategory);

      category.subcategories = newSubcategories;
      newGroups[dropCategoryIndex] = category;
      return newGroups;
    });

    setHasChanges(true);
    setDraggedSubcategoryInfo(null);
    setDragOverSubcategoryInfo(null);
  }, [draggedSubcategoryInfo]);

  const handleSubcategoryDragEnd = useCallback(() => {
    setDraggedSubcategoryInfo(null);
    setDragOverSubcategoryInfo(null);
  }, []);

  // Metric drag handlers
  const handleMetricDragStart = useCallback((e: React.DragEvent, categoryIndex: number, subcategoryIndex: number, metricIndex: number) => {
    // Clear any stale state from previous incomplete drags
    setDragOverMetricInfo(null);
    setDraggedMetricInfo({ categoryIndex, subcategoryIndex, metricIndex });
    // Required for Firefox to allow dragging
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `metric-${categoryIndex}-${subcategoryIndex}-${metricIndex}`);
  }, []);

  const handleMetricDragOver = useCallback((e: React.DragEvent, categoryIndex: number, subcategoryIndex: number, metricIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      draggedMetricInfo !== null &&
      (draggedMetricInfo.categoryIndex !== categoryIndex || 
       draggedMetricInfo.subcategoryIndex !== subcategoryIndex ||
       draggedMetricInfo.metricIndex !== metricIndex)
    ) {
      setDragOverMetricInfo({ categoryIndex, subcategoryIndex, metricIndex });
    }
  }, [draggedMetricInfo]);

  const handleMetricDragLeave = useCallback(() => {
    setDragOverMetricInfo(null);
  }, []);

  const handleMetricDrop = useCallback((e: React.DragEvent, dropCategoryIndex: number, dropSubcategoryIndex: number, dropMetricIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (
      draggedMetricInfo === null ||
      (draggedMetricInfo.categoryIndex === dropCategoryIndex &&
        draggedMetricInfo.subcategoryIndex === dropSubcategoryIndex &&
        draggedMetricInfo.metricIndex === dropMetricIndex)
    ) {
      setDraggedMetricInfo(null);
      setDragOverMetricInfo(null);
      return;
    }

    setCategoryGroups((prev) => {
      const newGroups = [...prev];
      
      // Get source info
      const sourceCategory = { ...newGroups[draggedMetricInfo.categoryIndex] };
      const sourceSubcategories = [...sourceCategory.subcategories];
      const sourceSubcategory = { ...sourceSubcategories[draggedMetricInfo.subcategoryIndex] };
      const sourceMetrics = [...sourceSubcategory.metrics];
      
      // Remove from source
      const [draggedMetric] = sourceMetrics.splice(draggedMetricInfo.metricIndex, 1);
      
      // Check if moving to a different category or subcategory
      const isCrossCategory = draggedMetricInfo.categoryIndex !== dropCategoryIndex;
      const isCrossSubcategory = draggedMetricInfo.subcategoryIndex !== dropSubcategoryIndex;
      
      if (isCrossCategory || isCrossSubcategory) {
        // Moving to different category/subcategory - update metric's category/subcategory
        const targetCategoryName = newGroups[dropCategoryIndex].name;
        const targetSubcategoryName = newGroups[dropCategoryIndex].subcategories[dropSubcategoryIndex]?.name || null;
        
        // Update the metric object with new category/subcategory
        draggedMetric.metric = {
          ...draggedMetric.metric,
          category: targetCategoryName,
          subcategory: targetSubcategoryName,
        };
      }
      
      // Update source subcategory
      sourceSubcategory.metrics = sourceMetrics.map((m, i) => ({
        ...m,
        order: (i + 1) * 10,
      }));
      sourceSubcategories[draggedMetricInfo.subcategoryIndex] = sourceSubcategory;
      sourceCategory.subcategories = sourceSubcategories;
      newGroups[draggedMetricInfo.categoryIndex] = sourceCategory;
      
      // Get target info (re-fetch since we may have modified source which could be same as target)
      const targetCategory = { ...newGroups[dropCategoryIndex] };
      const targetSubcategories = [...targetCategory.subcategories];
      const targetSubcategory = { ...targetSubcategories[dropSubcategoryIndex] };
      const targetMetrics = [...targetSubcategory.metrics];
      
      // Calculate insert index
      let insertIndex = dropMetricIndex;
      // If moving within the same subcategory and from before the drop point, adjust index
      if (
        draggedMetricInfo.categoryIndex === dropCategoryIndex &&
        draggedMetricInfo.subcategoryIndex === dropSubcategoryIndex &&
        draggedMetricInfo.metricIndex < dropMetricIndex
      ) {
        insertIndex = dropMetricIndex - 1;
      }
      
      // Insert at target
      targetMetrics.splice(insertIndex, 0, draggedMetric);
      
      // Update order values for target
      targetSubcategory.metrics = targetMetrics.map((m, i) => ({
        ...m,
        order: (i + 1) * 10,
      }));
      
      targetSubcategories[dropSubcategoryIndex] = targetSubcategory;
      targetCategory.subcategories = targetSubcategories;
      newGroups[dropCategoryIndex] = targetCategory;
      
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
      let metricOrderCounter = 0;
      
      // Iterate through subcategories to maintain proper metric ordering
      category.subcategories.forEach((subcategory) => {
        subcategory.metrics.forEach((metricItem) => {
          metricOrderCounter++;
          orderings.push({
            category_name: category.name,
            category_order: categoryOrder,
            subcategory_name: subcategory.name,  // Include subcategory for cross-subcategory moves
            metric_id: metricItem.metric.id,
            metric_order: metricOrderCounter * 10,
          });
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
            Drag categories to reorder them. Expand a category to see subcategories and reorder metrics. 
            <strong> You can drag metrics between categories or subcategories</strong> — they will be updated to the new category and subcategory when you save.
          </div>

          <div className={styles.categoryList}>
            {categoryGroups.map((category, catIndex) => {
              // Safety check for subcategories
              const subcategories = category.subcategories || [];
              
              // Count total metrics across all subcategories
              const totalMetrics = subcategories.reduce(
                (sum, sub) => sum + sub.metrics.length, 0
              );
              
              // Always show subcategory level so users can drag metrics between subcategories
              const showSubcategoryHeaders = true;
              
              return (
                <div
                  key={category.name}
                  className={`${styles.categoryItem} ${
                    draggedCategoryIndex === catIndex ? styles.dragging : ""
                  } ${dragOverCategoryIndex === catIndex ? styles.dragOver : ""}`}
                  onDragOver={(e) => handleCategoryDragOver(e, catIndex)}
                  onDragLeave={handleCategoryDragLeave}
                  onDrop={(e) => handleCategoryDrop(e, catIndex)}
                >
                  <div 
                    className={styles.categoryHeader}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', `category-${catIndex}`);
                      handleCategoryDragStart(catIndex);
                    }}
                    onDragEnd={handleCategoryDragEnd}
                  >
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
                      ({totalMetrics} metrics)
                    </span>
                  </div>

                  {category.isExpanded && (
                    <div className={styles.metricList}>
                      {subcategories.map((subcategory, subIndex) => (
                        <div key={subcategory.name ?? 'uncategorized'}>
                          {/* Subcategory header - draggable if we have multiple subcategories */}
                          {showSubcategoryHeaders && (
                            <div 
                              className={`${styles.subcategoryHeader} ${
                                subcategories.length > 1 ? styles.draggableSubcategory : ''
                              } ${
                                draggedSubcategoryInfo?.categoryIndex === catIndex &&
                                draggedSubcategoryInfo?.subcategoryIndex === subIndex
                                  ? styles.dragging
                                  : ""
                              } ${
                                dragOverSubcategoryInfo?.categoryIndex === catIndex &&
                                dragOverSubcategoryInfo?.subcategoryIndex === subIndex
                                  ? styles.dragOver
                                  : ""
                              }`}
                              draggable={subcategories.length > 1}
                              onDragStart={(e) => handleSubcategoryDragStart(e, catIndex, subIndex)}
                              onDragOver={(e) => handleSubcategoryDragOver(e, catIndex, subIndex)}
                              onDragLeave={handleSubcategoryDragLeave}
                              onDrop={(e) => handleSubcategoryDrop(e, catIndex, subIndex)}
                              onDragEnd={handleSubcategoryDragEnd}
                            >
                              {subcategories.length > 1 && (
                                <span className={styles.dragHandle}>⋮⋮</span>
                              )}
                              <span className={styles.subcategoryName}>
                                {subcategory.name ?? "(Uncategorized)"}
                              </span>
                              <span className={styles.subcategoryCount}>
                                ({subcategory.metrics.length})
                              </span>
                            </div>
                          )}
                          
                          {/* Metrics in this subcategory */}
                          {subcategory.metrics.map((metricItem, metricIndex) => (
                            <div
                              key={metricItem.metric.id}
                              className={`${styles.metricItem} ${
                                draggedMetricInfo?.categoryIndex === catIndex &&
                                draggedMetricInfo?.subcategoryIndex === subIndex &&
                                draggedMetricInfo?.metricIndex === metricIndex
                                  ? styles.dragging
                                  : ""
                              } ${
                                dragOverMetricInfo?.categoryIndex === catIndex &&
                                dragOverMetricInfo?.subcategoryIndex === subIndex &&
                                dragOverMetricInfo?.metricIndex === metricIndex
                                  ? styles.dragOver
                                  : ""
                              }`}
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation();
                                handleMetricDragStart(e, catIndex, subIndex, metricIndex);
                              }}
                              onDragOver={(e) => handleMetricDragOver(e, catIndex, subIndex, metricIndex)}
                              onDragLeave={handleMetricDragLeave}
                              onDrop={(e) => handleMetricDrop(e, catIndex, subIndex, metricIndex)}
                              onDragEnd={handleMetricDragEnd}
                            >
                              <span className={styles.dragHandle}>⋮⋮</span>
                              <span className={styles.metricName}>
                                {metricItem.metric.metric_name}
                              </span>
                            </div>
                          ))}
                          {/* Drop zone at the end of each subcategory for cross-category drops */}
                          {draggedMetricInfo !== null && (
                            <div
                              className={`${styles.dropZone} ${
                                dragOverMetricInfo?.categoryIndex === catIndex &&
                                dragOverMetricInfo?.subcategoryIndex === subIndex &&
                                dragOverMetricInfo?.metricIndex === subcategory.metrics.length
                                  ? styles.dropZoneActive
                                  : ""
                              }`}
                              onDragOver={(e) => handleMetricDragOver(e, catIndex, subIndex, subcategory.metrics.length)}
                              onDragLeave={handleMetricDragLeave}
                              onDrop={(e) => handleMetricDrop(e, catIndex, subIndex, subcategory.metrics.length)}
                            >
                              Drop metric here
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
