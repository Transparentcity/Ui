"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useCityMetricOrdering,
  useSaveCityMetricOrdering,
  useResetCityMetricOrdering,
  useUserMetricOrdering,
  useSaveUserMetricOrdering,
  useResetUserMetricOrdering,
} from "@/lib/hooks/useCityAdmin";
import type { MetricOrderingItem, MetricOrderingResponse } from "@/lib/apiClient";
import styles from "./MetricOrderEditor.module.css";

/** localStorage key prefix for pending metric order (signed-out users). Export for migration on login. */
export const PENDING_ORDER_STORAGE_KEY_PREFIX = "pending_metric_order_";

interface Metric {
  id: number;
  metric_name: string;
  category?: string;
  /** From metrics table: subcategory. API may return as subcategory or sub_category. */
  subcategory?: string | null;
  sub_category?: string | null;
  /** When true (or undefined), metric is shown on dashboard by default; used for checkbox initial state. */
  show_on_dash?: boolean;
}

interface MetricOrderEditorProps {
  cityId: number;
  metrics: Metric[];
  onOrderChange?: () => void;
  /** "admin" = city-level (admin/analyst); "user" = per-user dashboard order */
  variant?: "admin" | "user";
  /** When variant="user", pass auth state so we use API vs localStorage */
  isAuthenticated?: boolean;
  /** When variant="user" and user saves while signed out, call this (e.g. show signup modal) */
  onSaveWhenSignedOut?: () => void;
  /** When true (e.g. in a modal), start with content expanded */
  defaultExpanded?: boolean;
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

/** For inline rename: which category or subcategory is being edited. */
type EditingTarget =
  | { type: "category"; catIndex: number }
  | { type: "subcategory"; catIndex: number; subIndex: number }
  | null;

/**
 * MetricOrderEditor - Editor for category and metric ordering with visibility controls
 */
export default function MetricOrderEditor({
  cityId,
  metrics,
  onOrderChange,
  variant = "admin",
  isAuthenticated = false,
  onSaveWhenSignedOut,
  defaultExpanded = false,
}: MetricOrderEditorProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [localStorageOrdering, setLocalStorageOrdering] = useState<MetricOrderingResponse | null>(null);
  /** Metric IDs to show on dashboard (user can toggle). When empty, fall back to show_on_dash. */
  const [visibleMetricIds, setVisibleMetricIds] = useState<Set<number>>(new Set());
  /** Inline edit state for custom category/subcategory names. */
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null);
  const [editingValue, setEditingValue] = useState("");

  const isUserMode = variant === "user";
  const useCityOrdering = !isUserMode;
  const useUserOrdering = isUserMode && isAuthenticated;
  const useLocalStorageOrdering = isUserMode && !isAuthenticated;

  const { data: cityOrderingData, isLoading: cityOrderingLoading } = useCityMetricOrdering(useCityOrdering ? cityId : null);
  const { data: userOrderingData, isLoading: userOrderingLoading } = useUserMetricOrdering(useUserOrdering ? cityId : null);
  const saveCityMutation = useSaveCityMetricOrdering();
  const resetCityMutation = useResetCityMetricOrdering();
  const saveUserMutation = useSaveUserMetricOrdering();
  const resetUserMutation = useResetUserMetricOrdering();

  const orderingData = useCityOrdering
    ? cityOrderingData
    : useUserOrdering
      ? userOrderingData
      : localStorageOrdering;
  const isLoadingOrdering = useCityOrdering
    ? cityOrderingLoading
    : useUserOrdering
      ? userOrderingLoading
      : false;

  const activeSaveMutation = useUserOrdering
    ? saveUserMutation
    : useLocalStorageOrdering
      ? null
      : saveCityMutation;
  const activeResetMutation = useUserOrdering
    ? resetUserMutation
    : useLocalStorageOrdering
      ? null
      : resetCityMutation;

  // When variant="user" and not authenticated, init from localStorage
  useEffect(() => {
    if (!useLocalStorageOrdering || !cityId) return;
    try {
      const key = `${PENDING_ORDER_STORAGE_KEY_PREFIX}${cityId}`;
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as MetricOrderingResponse;
        if (parsed?.city_id === cityId && Array.isArray(parsed.orderings)) {
          setLocalStorageOrdering(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }
    setLocalStorageOrdering(null);
  }, [useLocalStorageOrdering, cityId]);

  // Build initial category groups from metrics and saved ordering
  // Uses the same ordering logic as the dashboard (CityView.tsx)
  useEffect(() => {
    if (!metrics || metrics.length === 0) return;

    // Initial "visible on dashboard" set: from saved ordering if present, else from show_on_dash
    const orderingIds = (orderingData?.orderings?.map((o) => o.metric_id).filter(Boolean) ?? []) as number[];
    const initialVisible =
      orderingIds.length > 0
        ? new Set(orderingIds)
        : new Set(metrics.filter((m) => m.show_on_dash !== false).map((m) => m.id));
    setVisibleMetricIds(initialVisible);

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
        isExpanded: defaultExpanded,
      };
    });

    setCategoryGroups(groups);
    setHasChanges(false);
  }, [metrics, orderingData]);

  const toggleMetricVisible = useCallback((metricId: number) => {
    setVisibleMetricIds((prev) => {
      const next = new Set(prev);
      if (next.has(metricId)) next.delete(metricId);
      else next.add(metricId);
      return next;
    });
    setHasChanges(true);
  }, []);

  // Toggle category expansion
  const toggleCategory = useCallback((index: number) => {
    setCategoryGroups((prev) =>
      prev.map((cat, i) =>
        i === index ? { ...cat, isExpanded: !cat.isExpanded } : cat
      )
    );
  }, []);

  // Move metric up/down within its subcategory (reliable alternative to drag)
  const moveMetric = useCallback((catIndex: number, subIndex: number, metricIndex: number, direction: -1 | 1) => {
    const newIndex = metricIndex + direction;
    setCategoryGroups((prev) => {
      const newGroups = prev.map((cat) => ({
        ...cat,
        subcategories: cat.subcategories.map((sub) => ({
          ...sub,
          metrics: [...sub.metrics],
        })),
      }));
      const metrics = newGroups[catIndex].subcategories[subIndex].metrics;
      if (newIndex < 0 || newIndex >= metrics.length) return prev;
      [metrics[metricIndex], metrics[newIndex]] = [metrics[newIndex], metrics[metricIndex]];
      metrics.forEach((m, i) => { m.order = (i + 1) * 10; });
      return newGroups;
    });
    setHasChanges(true);
  }, []);

  // Move category up/down
  const moveCategory = useCallback((catIndex: number, direction: -1 | 1) => {
    const newIndex = catIndex + direction;
    setCategoryGroups((prev) => {
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const newGroups = [...prev];
      [newGroups[catIndex], newGroups[newIndex]] = [newGroups[newIndex], newGroups[catIndex]];
      return newGroups.map((cat, i) => ({ ...cat, order: (i + 1) * 100 }));
    });
    setHasChanges(true);
  }, []);

  // Add new category (user-defined name)
  const addCategory = useCallback(() => {
    const name = window.prompt("New category name:");
    const trimmed = name?.trim();
    if (!trimmed) return;
    setCategoryGroups((prev) => [
      ...prev,
      {
        name: trimmed,
        order: (prev.length + 1) * 100,
        subcategories: [{ name: null, metrics: [] }],
        isExpanded: true,
      },
    ]);
    setHasChanges(true);
  }, []);

  // Start or commit renaming a category
  const startRenameCategory = useCallback((catIndex: number) => {
    const cat = categoryGroups[catIndex];
    if (!cat) return;
    setEditingTarget({ type: "category", catIndex });
    setEditingValue(cat.name);
  }, [categoryGroups]);

  const startRenameSubcategory = useCallback((catIndex: number, subIndex: number) => {
    const cat = categoryGroups[catIndex];
    const sub = cat?.subcategories?.[subIndex];
    if (!sub) return;
    setEditingTarget({ type: "subcategory", catIndex, subIndex });
    setEditingValue(sub.name ?? "");
  }, [categoryGroups]);

  const commitEditing = useCallback(() => {
    if (!editingTarget || editingValue === undefined) return;
    const trimmed = String(editingValue).trim();
    setCategoryGroups((prev) => {
      const next = prev.map((c) => ({
        ...c,
        subcategories: c.subcategories.map((s) => ({ ...s, metrics: [...s.metrics] })),
      }));
      if (editingTarget.type === "category") {
        const cat = next[editingTarget.catIndex];
        if (cat && trimmed) cat.name = trimmed;
      } else {
        const cat = next[editingTarget.catIndex];
        const sub = cat?.subcategories?.[editingTarget.subIndex];
        if (sub) sub.name = trimmed || null;
      }
      return next;
    });
    setEditingTarget(null);
    setEditingValue("");
    setHasChanges(true);
  }, [editingTarget, editingValue]);

  // Add new subcategory under a category (user-defined name)
  const addSubcategory = useCallback((catIndex: number) => {
    const name = window.prompt("New subcategory name:");
    const trimmed = name?.trim() || null;
    setCategoryGroups((prev) => {
      const next = prev.map((c, i) => {
        if (i !== catIndex) return c;
        return {
          ...c,
          subcategories: [
            ...c.subcategories,
            { name: trimmed, metrics: [] },
          ],
        };
      });
      return next;
    });
    setHasChanges(true);
  }, []);

  // Move a metric to another category/subcategory
  const moveMetricTo = useCallback(
    (fromCat: number, fromSub: number, metricIndex: number, toCat: number, toSub: number) => {
      if (fromCat === toCat && fromSub === toSub) return;
      setCategoryGroups((prev) => {
        const next = prev.map((c) => ({
          ...c,
          subcategories: c.subcategories.map((s) => ({
            ...s,
            metrics: [...s.metrics],
          })),
        }));
        const metricItem = next[fromCat].subcategories[fromSub].metrics[metricIndex];
        if (!metricItem) return prev;
        next[fromCat].subcategories[fromSub].metrics.splice(metricIndex, 1);
        next[toCat].subcategories[toSub].metrics.push(metricItem);
        return next;
      });
      setHasChanges(true);
    },
    []
  );

  // Save ordering to database or localStorage (only visible metrics are included)
  const handleSave = useCallback(async () => {
    const orderings: MetricOrderingItem[] = [];

    categoryGroups.forEach((category, catIndex) => {
      const categoryOrder = (catIndex + 1) * 100;
      let metricOrderCounter = 0;
      category.subcategories.forEach((subcategory) => {
        subcategory.metrics.forEach((metricItem) => {
          if (!visibleMetricIds.has(metricItem.metric.id)) return;
          metricOrderCounter++;
          orderings.push({
            category_name: category.name,
            category_order: categoryOrder,
            subcategory_name: subcategory.name,
            metric_id: metricItem.metric.id,
            metric_order: metricOrderCounter * 10,
          });
        });
      });
    });

    if (useUserOrdering) {
      try {
        await saveUserMutation.mutateAsync({ cityId, orderings });
        setHasChanges(false);
        onOrderChange?.();
      } catch (err) {
        console.error("Failed to save user ordering:", err);
      }
      return;
    }
    if (useLocalStorageOrdering) {
      const payload: MetricOrderingResponse = { city_id: cityId, orderings };
      try {
        const key = `${PENDING_ORDER_STORAGE_KEY_PREFIX}${cityId}`;
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(payload));
        }
        setLocalStorageOrdering(payload);
        setHasChanges(false);
        onSaveWhenSignedOut?.();
      } catch (err) {
        console.error("Failed to save to localStorage:", err);
      }
      return;
    }
    try {
      await saveCityMutation.mutateAsync({ cityId, orderings });
      setHasChanges(false);
      onOrderChange?.();
    } catch (err) {
      console.error("Failed to save ordering:", err);
    }
  }, [
    cityId,
    categoryGroups,
    visibleMetricIds,
    useUserOrdering,
    useLocalStorageOrdering,
    saveCityMutation,
    saveUserMutation,
    onOrderChange,
    onSaveWhenSignedOut,
  ]);

  // Reset to default ordering
  const handleReset = useCallback(async () => {
    if (!confirm("Are you sure you want to reset to default ordering?")) {
      return;
    }
    if (useUserOrdering) {
      try {
        await resetUserMutation.mutateAsync(cityId);
        setHasChanges(false);
        onOrderChange?.();
      } catch (err) {
        console.error("Failed to reset user ordering:", err);
      }
      return;
    }
    if (useLocalStorageOrdering) {
      try {
        const key = `${PENDING_ORDER_STORAGE_KEY_PREFIX}${cityId}`;
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(key);
        }
        setLocalStorageOrdering(null);
        setHasChanges(false);
      } catch (err) {
        console.error("Failed to clear localStorage:", err);
      }
      return;
    }
    try {
      await resetCityMutation.mutateAsync(cityId);
      setHasChanges(false);
      onOrderChange?.();
    } catch (err) {
      console.error("Failed to reset ordering:", err);
    }
  }, [
    cityId,
    useUserOrdering,
    useLocalStorageOrdering,
    resetCityMutation,
    resetUserMutation,
    onOrderChange,
  ]);

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
            Add or rename categories and subcategories, reorder with ▲▼, and use checkboxes to show or hide metrics. Move metrics between groups with the dropdown. Save to persist; empty categories are not saved.
          </div>

          <div className={styles.categoryList}>
            {categoryGroups.map((category, catIndex) => {
              // Safety check for subcategories
              const subcategories = category.subcategories || [];
              
              // Count total metrics across all subcategories
              const totalMetrics = subcategories.reduce(
                (sum, sub) => sum + sub.metrics.length, 0
              );
              
              const showSubcategoryHeaders = subcategories.length >= 1;
              const isEditingCategory =
                editingTarget?.type === "category" && editingTarget.catIndex === catIndex;
              
              return (
                <div
                  key={`${category.name}-${catIndex}`}
                  className={styles.categoryItem}
                >
                  <div className={styles.categoryHeader}>
                    <span className={styles.moveButtons}>
                      <button
                        type="button"
                        className={styles.moveBtn}
                        disabled={catIndex === 0}
                        onClick={(e) => { e.stopPropagation(); moveCategory(catIndex, -1); }}
                        title="Move category up"
                      >▲</button>
                      <button
                        type="button"
                        className={styles.moveBtn}
                        disabled={catIndex === categoryGroups.length - 1}
                        onClick={(e) => { e.stopPropagation(); moveCategory(catIndex, 1); }}
                        title="Move category down"
                      >▼</button>
                    </span>
                    <span
                      className={styles.expandToggle}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCategory(catIndex);
                      }}
                    >
                      {category.isExpanded ? "▼" : "▶"}
                    </span>
                    {isEditingCategory ? (
                      <input
                        type="text"
                        className={styles.categoryNameInput}
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onBlur={commitEditing}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEditing();
                          if (e.key === "Escape") {
                            setEditingTarget(null);
                            setEditingValue("");
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        aria-label="Category name"
                      />
                    ) : (
                      <>
                        <span
                          className={styles.categoryNameEditable}
                          onClick={(e) => { e.stopPropagation(); startRenameCategory(catIndex); }}
                          title="Click to rename category"
                        >
                          {category.name}
                        </span>
                        <button
                          type="button"
                          className={styles.renameBtn}
                          onClick={(e) => { e.stopPropagation(); startRenameCategory(catIndex); }}
                          title="Rename category"
                          aria-label="Rename category"
                        >
                          Rename
                        </button>
                      </>
                    )}
                    <span className={styles.metricCount}>
                      ({totalMetrics} metrics)
                    </span>
                  </div>

                  {category.isExpanded && (
                    <div className={styles.metricList}>
                      {subcategories.map((subcategory, subIndex) => {
                        const isEditingSub =
                          editingTarget?.type === "subcategory" &&
                          editingTarget.catIndex === catIndex &&
                          editingTarget.subIndex === subIndex;
                        return (
                          <div key={subcategory.name ?? `sub-${subIndex}`}>
                            {/* Subcategory header */}
                            {showSubcategoryHeaders && (
                              <div className={styles.subcategoryHeader}>
                                {isEditingSub ? (
                                  <input
                                    type="text"
                                    className={styles.subcategoryNameInput}
                                    value={editingValue}
                                    onChange={(e) => setEditingValue(e.target.value)}
                                    onBlur={commitEditing}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") commitEditing();
                                      if (e.key === "Escape") {
                                        setEditingTarget(null);
                                        setEditingValue("");
                                      }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    autoFocus
                                    placeholder="Subcategory name"
                                    aria-label="Subcategory name"
                                  />
                                ) : (
                                  <>
                                    <span
                                      className={styles.subcategoryNameEditable}
                                      onClick={(e) => { e.stopPropagation(); startRenameSubcategory(catIndex, subIndex); }}
                                      title="Click to rename subcategory"
                                    >
                                      {subcategory.name ?? "(Uncategorized)"}
                                    </span>
                                    <button
                                      type="button"
                                      className={styles.renameBtnSmall}
                                      onClick={(e) => { e.stopPropagation(); startRenameSubcategory(catIndex, subIndex); }}
                                      title="Rename subcategory"
                                      aria-label="Rename subcategory"
                                    >
                                      Rename
                                    </button>
                                  </>
                                )}
                                <span className={styles.subcategoryCount}>
                                  ({subcategory.metrics.length})
                                </span>
                              </div>
                            )}
                            
                            {/* Metrics in this subcategory */}
                            {subcategory.metrics.map((metricItem, metricIndex) => {
                              const isVisible =
                                visibleMetricIds.size === 0
                                  ? true
                                  : visibleMetricIds.has(metricItem.metric.id);
                              return (
                                <div
                                  key={metricItem.metric.id}
                                  className={`${styles.metricItem} ${
                                    !isVisible ? styles.metricItemHidden : ""
                                  }`}
                                >
                                  <label
                                    className={styles.metricCheckbox}
                                    title={isVisible ? "Hide from dashboard" : "Show on dashboard"}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isVisible}
                                      onChange={() => toggleMetricVisible(metricItem.metric.id)}
                                    />
                                  </label>
                                  <span className={styles.moveButtons}>
                                    <button
                                      type="button"
                                      className={styles.moveBtn}
                                      disabled={metricIndex === 0}
                                      onClick={(e) => { e.stopPropagation(); moveMetric(catIndex, subIndex, metricIndex, -1); }}
                                      title="Move up"
                                    >▲</button>
                                    <button
                                      type="button"
                                      className={styles.moveBtn}
                                      disabled={metricIndex === subcategory.metrics.length - 1}
                                      onClick={(e) => { e.stopPropagation(); moveMetric(catIndex, subIndex, metricIndex, 1); }}
                                      title="Move down"
                                    >▼</button>
                                  </span>
                                  <span className={styles.metricName}>
                                    {metricItem.metric.metric_name}
                                  </span>
                                  <select
                                    className={styles.moveToSelect}
                                    value=""
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      e.target.value = "";
                                      if (!v) return;
                                      const [toCatStr, toSubStr] = v.split(",");
                                      const toCat = parseInt(toCatStr, 10);
                                      const toSub = parseInt(toSubStr, 10);
                                      if (!Number.isNaN(toCat) && !Number.isNaN(toSub)) {
                                        moveMetricTo(catIndex, subIndex, metricIndex, toCat, toSub);
                                      }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    title="Move to another category or subcategory"
                                    aria-label="Move to"
                                  >
                                    <option value="">Move to…</option>
                                    {categoryGroups.map((c, ci) =>
                                      c.subcategories.map((s, si) => (
                                        <option
                                          key={`${ci}-${si}`}
                                          value={`${ci},${si}`}
                                          disabled={ci === catIndex && si === subIndex}
                                        >
                                          {c.name} → {s.name ?? "(Uncategorized)"}
                                        </option>
                                      ))
                                    )}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                      <div className={styles.addSubcategoryRow}>
                        <button
                          type="button"
                          className={styles.addSubcategoryBtn}
                          onClick={(e) => { e.stopPropagation(); addSubcategory(catIndex); }}
                        >
                          + Add subcategory
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div className={styles.addCategoryRow}>
              <button
                type="button"
                className={styles.addCategoryBtn}
                onClick={addCategory}
              >
                + Add category
              </button>
            </div>
          </div>

          <div className={styles.actions}>
            <button
              className={styles.saveButton}
              onClick={handleSave}
              disabled={!hasChanges || (activeSaveMutation?.isPending ?? false)}
            >
              {activeSaveMutation?.isPending ? "Saving..." : "Save Order"}
            </button>
            <button
              className={styles.resetButton}
              onClick={handleReset}
              disabled={activeResetMutation?.isPending ?? false}
            >
              {activeResetMutation?.isPending ? "Resetting..." : "Reset to Default"}
            </button>
          </div>

          {activeSaveMutation?.isError && (
            <div className={styles.error}>
              Failed to save: {(activeSaveMutation.error as Error)?.message}
            </div>
          )}
          {activeResetMutation?.isError && (
            <div className={styles.error}>
              Failed to reset: {(activeResetMutation.error as Error)?.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
