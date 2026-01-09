"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  TEMPLATE_CONFIG,
  getTemplateConfig,
  getColorIndexForTemplate,
  TEMPLATE_ORDER_STORAGE_KEY,
  type TemplateConfig,
} from "@/lib/metricTemplateConfig";
import { LAYER_COLOR_PALETTE } from "@/lib/layerColors";
import styles from "./TemplateOrderEditor.module.css";

interface TemplateOrderEditorProps {
  templates: Array<{
    id: number;
    metric_name: string;
    category: string;
    subcategory?: string | null;
    template_id?: number | null;
  }>;
}

/**
 * Load saved template order from localStorage
 */
function loadSavedOrder(): Map<number, number> | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(TEMPLATE_ORDER_STORAGE_KEY);
    if (!saved) return null;
    const data = JSON.parse(saved);
    return new Map(Object.entries(data).map(([k, v]) => [Number(k), Number(v)]));
  } catch {
    return null;
  }
}

/**
 * Save template order to localStorage
 */
function saveOrder(order: Map<number, number>): void {
  if (typeof window === "undefined") return;
  try {
    const data = Object.fromEntries(order);
    localStorage.setItem(TEMPLATE_ORDER_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("Failed to save template order:", err);
  }
}

export default function TemplateOrderEditor({ templates }: TemplateOrderEditorProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [isExpanded, setIsExpanded] = useState(false);
  const [savedOrder, setSavedOrder] = useState<Map<number, number> | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Load saved order on mount
  useEffect(() => {
    setSavedOrder(loadSavedOrder());
  }, []);

  // Build ordered list of templates
  // Note: For template metrics (metric_type="template"), the id IS the template_id
  // template_id field is only used for queried metrics that reference a template
  const orderedTemplates = templates
    .filter((t) => t.id) // Only templates with IDs
    .map((template) => {
      // For template metrics, id is the template_id (template_id field is null for templates)
      // For queried metrics with template_id, use that field
      const templateId = template.template_id ?? template.id;
      const config = getTemplateConfig(templateId);
      const savedOrderValue = savedOrder?.get(templateId);
      const order = savedOrderValue !== undefined ? savedOrderValue : config?.order ?? 9999;
      
      // Color is now assigned directly from template_id
      const colorIndex = getColorIndexForTemplate(templateId);
      const color = LAYER_COLOR_PALETTE[colorIndex];
      
      return {
        ...template,
        templateId,
        config,
        order,
        colorIndex,
        color,
      };
    })
    .sort((a, b) => {
      // First sort by saved order or config order
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      // Then by category
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      // Finally by name
      return a.metric_name.localeCompare(b.metric_name);
    });

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder templates
    const newOrder = new Map(savedOrder || new Map());
    const draggedTemplate = orderedTemplates[draggedIndex];
    const newOrdered = [...orderedTemplates];
    
    // Remove dragged item
    newOrdered.splice(draggedIndex, 1);
    
    // Insert at new position
    const insertIndex = draggedIndex < dropIndex ? dropIndex - 1 : dropIndex;
    newOrdered.splice(insertIndex, 0, draggedTemplate);
    
    // Update order values
    newOrdered.forEach((template, index) => {
      // Use index + 1 as order (starting from 1)
      newOrder.set(template.templateId, index + 1);
    });

    setSavedOrder(newOrder);
    saveOrder(newOrder);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    
    const newOrder = new Map(savedOrder || new Map());
    const newOrdered = [...orderedTemplates];
    
    // Swap with previous
    [newOrdered[index - 1], newOrdered[index]] = [newOrdered[index], newOrdered[index - 1]];
    
    // Update order values
    newOrdered.forEach((template, idx) => {
      newOrder.set(template.templateId, idx + 1);
    });

    setSavedOrder(newOrder);
    saveOrder(newOrder);
  };

  const handleMoveDown = (index: number) => {
    if (index === orderedTemplates.length - 1) return;
    
    const newOrder = new Map(savedOrder || new Map());
    const newOrdered = [...orderedTemplates];
    
    // Swap with next
    [newOrdered[index], newOrdered[index + 1]] = [newOrdered[index + 1], newOrdered[index]];
    
    // Update order values
    newOrdered.forEach((template, idx) => {
      newOrder.set(template.templateId, idx + 1);
    });

    setSavedOrder(newOrder);
    saveOrder(newOrder);
  };

  const handleReset = () => {
    if (!confirm("Reset template order to default? This will remove your custom ordering.")) {
      return;
    }
    
    if (typeof window !== "undefined") {
      localStorage.removeItem(TEMPLATE_ORDER_STORAGE_KEY);
    }
    setSavedOrder(null);
  };

  if (orderedTemplates.length === 0) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button
          className={styles.toggleButton}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <i className={`fas fa-chevron-${isExpanded ? "down" : "right"}`} />
          <span>Template Ordering</span>
          <span className={styles.badge}>
            {orderedTemplates.length} template{orderedTemplates.length !== 1 ? "s" : ""}
          </span>
        </button>
        {isExpanded && (
          <div className={styles.headerActions}>
            <button className={styles.resetButton} onClick={handleReset} title="Reset to default order">
              <i className="fas fa-undo" /> Reset
            </button>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className={styles.content}>
          <div className={styles.description}>
            Drag templates to reorder them. The order determines how metrics appear in the Map Layers Panel.
            Metrics with the same template_id will use the same color and order across all cities.
          </div>

          <div className={styles.templateList}>
            {orderedTemplates.map((template, index) => (
              <div
                key={template.id}
                className={`${styles.templateItem} ${
                  draggedIndex === index ? styles.dragging : ""
                } ${dragOverIndex === index ? styles.dragOver : ""}`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
              >
                <div className={styles.templateDragHandle}>
                  <i className="fas fa-grip-vertical" />
                </div>

                <div
                  className={styles.templateColor}
                  style={{ backgroundColor: template.color }}
                  title={`Color: ${template.color}`}
                />

                <div className={styles.templateInfo}>
                  <div className={styles.templateName}>{template.metric_name}</div>
                  <div className={styles.templateMeta}>
                    <span className={styles.badge}>{template.category}</span>
                    {template.subcategory && (
                      <span className={styles.badge}>{template.subcategory}</span>
                    )}
                    <span className={styles.muted}>ID: {template.id}</span>
                  </div>
                </div>

                <div className={styles.templateActions}>
                  <button
                    className={styles.moveButton}
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    title="Move up"
                  >
                    <i className="fas fa-arrow-up" />
                  </button>
                  <button
                    className={styles.moveButton}
                    onClick={() => handleMoveDown(index)}
                    disabled={index === orderedTemplates.length - 1}
                    title="Move down"
                  >
                    <i className="fas fa-arrow-down" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {orderedTemplates.length === 0 && (
            <div className={styles.empty}>
              No templates found. Templates are metrics with metric_type="template".
            </div>
          )}
        </div>
      )}
    </div>
  );
}

