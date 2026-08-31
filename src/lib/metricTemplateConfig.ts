/**
 * Template Metric Ordering and Color Configuration
 * 
 * This configuration defines:
 * 1. The default order of template metrics (by template_id)
 * 2. Color assignments for each template (consistent across cities)
 * 3. Category groupings for display
 * 
 * Metrics with the same template_id will have the same color and order
 * across all cities, ensuring consistency.
 */

import { LAYER_COLOR_PALETTE, getStableColorIndexForKey } from "./layerColors";

export interface TemplateConfig {
  template_id: number;
  category: string;
  subcategory?: string;
  displayName: string;
  order: number;
  // colorIndex is now calculated dynamically from template_id
}

/**
 * Template metric configuration ordered by display priority.
 * 
 * Order determines:
 * - Display order in the metrics panel
 * - Color assignment (consistent across cities)
 * 
 * Metrics without a template_id will appear at the end,
 * sorted by category and name.
 * 
 * NOTE: Template IDs should be verified against the actual database.
 * Query templates with: GET /api/metrics?metric_type=template
 * Then update the template_id values below to match actual IDs.
 */
export const TEMPLATE_CONFIG: TemplateConfig[] = [
  // Crime Category
  {
    template_id: 18, // Violent Crime - FBI Type I
    // TODO: Verify actual template_id from database
    category: "crime",
    subcategory: "violent",
    displayName: "Violent Crime",
    order: 1,
  },
  {
    template_id: 44, // Property Crime - FBI Type II
    // TODO: Verify actual template_id from database
    category: "crime",
    subcategory: "property",
    displayName: "Property Crime",
    order: 2,
  },
  {
    template_id: 6, // Drug Crime
    // TODO: Verify actual template_id from database
    category: "crime",
    subcategory: "drug",
    displayName: "Drug Crime",
    order: 3,
  },
  
  // Safety Category
  {
    template_id: 7, // 911 Calls
    // TODO: Verify actual template_id from database
    category: "safety",
    subcategory: "emergency",
    displayName: "911 Calls",
    order: 4,
  },
  
  // Services Category
  {
    template_id: 19, // 311 Calls
    category: "services",
    subcategory: "311",
    displayName: "311 Calls",
    order: 5,
  },
  
  // Development Category
  {
    template_id: 4, // Building Permits
    // TODO: Verify actual template_id from database
    category: "development",
    subcategory: "permits",
    displayName: "Building Permits",
    order: 6,
  },
  
  // Economy Category
  {
    template_id: 8, // Business Registrations
    // TODO: Verify actual template_id from database
    category: "economy",
    subcategory: "business",
    displayName: "Business Registrations",
    order: 7,
  },
  
  // Finance Category
  {
    template_id: 5, // City Spending
    // TODO: Verify actual template_id from database
    category: "finance",
    subcategory: "budget",
    displayName: "City Spending",
    order: 8,
  },
];

/**
 * Get template configuration by template_id
 */
export function getTemplateConfig(templateId: number | null | undefined): TemplateConfig | null {
  if (!templateId) return null;
  return TEMPLATE_CONFIG.find((config) => config.template_id === templateId) || null;
}

/**
 * Get color index for a template_id
 * Each template_id gets its own distinct color based on its ID value
 * Template ID 1 gets purple (var(--brand-primary)), ID 2 gets coral (#FF6B5A), then variations
 * This ensures consistent color assignment: same template_id = same color everywhere
 */
export function getColorIndexForTemplate(templateId: number | null | undefined): number {
  if (!templateId) {
    return 0; // Default to purple
  }
  
  // Use template_id directly to get a unique color index
  // Template ID 1 → color 0 (purple), ID 2 → color 1 (coral), etc.
  // Colors cycle through the palette if there are more templates than colors
  return (templateId - 1) % LAYER_COLOR_PALETTE.length;
}

/**
 * Get color for a template_id
 */
export function getColorForTemplate(templateId: number | null | undefined): string {
  const index = getColorIndexForTemplate(templateId);
  return LAYER_COLOR_PALETTE[index];
}

export const TEMPLATE_ORDER_STORAGE_KEY = "transparentcity_template_order";

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
 * Get display order for a template_id
 * Returns a high number if template not found (appears at end)
 * Uses saved order from localStorage if available, otherwise uses config order
 */
export function getOrderForTemplate(templateId: number | null | undefined): number {
  if (!templateId) return 9999;
  
  // Check for saved order first
  const savedOrder = loadSavedOrder();
  if (savedOrder?.has(templateId)) {
    return savedOrder.get(templateId)!;
  }
  
  // Fall back to config order
  const config = getTemplateConfig(templateId);
  return config ? config.order : 9999;
}

/**
 * Get category display name
 */
export function getCategoryDisplayName(category: string): string {
  const categoryMap: Record<string, string> = {
    crime: "Crime",
    safety: "Safety",
    services: "Services",
    development: "Development",
    economy: "Economy",
    finance: "Finance",
    housing: "Housing",
    transportation: "Transportation",
    environment: "Environment",
    health: "Health",
    education: "Education",
  };
  return categoryMap[category.toLowerCase()] || category;
}

/**
 * Group metrics by category for display
 */
export interface GroupedMetric {
  category: string;
  categoryDisplayName: string;
  metrics: Array<{
    id: number;
    metric_name: string;
    template_id: number | null | undefined;
    category: string;
    subcategory?: string | null;
    order: number;
    colorIndex: number;
    color: string;
  }>;
}

/**
 * Sort and group metrics by template order and category
 */
export function sortAndGroupMetrics(
  metrics: Array<{
    id: number;
    metric_name: string;
    template_id?: number | null;
    category?: string | null;
    subcategory?: string | null;
  }>
): GroupedMetric[] {
  // Sort metrics by template order, then category, then name
  const sorted = [...metrics].sort((a, b) => {
    const orderA = getOrderForTemplate(a.template_id);
    const orderB = getOrderForTemplate(b.template_id);
    
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    
    const catA = a.category || "other";
    const catB = b.category || "other";
    if (catA !== catB) {
      return catA.localeCompare(catB);
    }
    
    return (a.metric_name || "").localeCompare(b.metric_name || "");
  });
  
  // Group by category
  const grouped = new Map<string, GroupedMetric>();
  
  for (const metric of sorted) {
    const category = metric.category || "other";
    const categoryDisplayName = getCategoryDisplayName(category);
    
    if (!grouped.has(category)) {
      grouped.set(category, {
        category,
        categoryDisplayName,
        metrics: [],
      });
    }
    
    const group = grouped.get(category)!;
    const templateId = metric.template_id;
    // Color is now assigned from metric_id to ensure each metric gets a unique color
    // even if they share the same template_id
    const colorIndex = getStableColorIndexForKey(`metric:${metric.id}`);
    
    group.metrics.push({
      id: metric.id,
      metric_name: metric.metric_name,
      template_id: templateId,
      category,
      subcategory: metric.subcategory || undefined,
      order: getOrderForTemplate(templateId),
      colorIndex,
      color: LAYER_COLOR_PALETTE[colorIndex],
    });
  }
  
  // Convert to array and sort by category order (based on template order)
  const categoryOrder = new Map<string, number>();
  for (const config of TEMPLATE_CONFIG) {
    if (!categoryOrder.has(config.category)) {
      categoryOrder.set(config.category, config.order);
    }
  }
  
  return Array.from(grouped.values()).sort((a, b) => {
    const orderA = categoryOrder.get(a.category) || 9999;
    const orderB = categoryOrder.get(b.category) || 9999;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.category.localeCompare(b.category);
  });
}

