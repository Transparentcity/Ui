/** Shared category presets used across onboarding and settings. */
export const CATEGORY_PRESETS = [
  {
    id: "crime-safety",
    label: "Crime & Safety",
    prompt:
      "Create a newsletter focused on crime and safety trends: violent and property crime trends, 311 calls related to safety and encampments, and any notable changes or anomalies. Compare to prior period and highlight actionable insights for residents.",
    metricCategories: ["crime", "safety"],
  },
  {
    id: "economy",
    label: "Economy & Jobs",
    prompt:
      "Create a newsletter focused on local economy and jobs: business permits, employment-related metrics, economic development, government spending, budgets, contracts, procurement, and key indicators. Include period-over-period comparison and notable shifts.",
    metricCategories: ["economy", "government", "budget"],
  },
  {
    id: "real-estate",
    label: "Real Estate & Housing",
    prompt:
      "Create a newsletter focused on housing and real estate: permits, construction, affordability indicators, and housing-related 311 or code data. Highlight trends and anomalies relevant to residents and renters.",
    metricCategories: ["housing"],
  },
  {
    id: "transportation",
    label: "Transportation & Traffic",
    prompt:
      "Create a newsletter focused on transportation and traffic: transit usage, traffic volumes, 311 street and sidewalk issues, and mobility trends. Include comparisons and notable changes.",
    metricCategories: ["transportation", "transit", "mobility"],
  },
  {
    id: "environment",
    label: "Environment & Sustainability",
    prompt:
      "Create a newsletter focused on environment and sustainability: air quality, waste, green infrastructure, and sustainability metrics. Compare to prior period and highlight key takeaways.",
    metricCategories: ["environment", "sustainability"],
  },
];

export type CategoryPreset = typeof CATEGORY_PRESETS[number];
