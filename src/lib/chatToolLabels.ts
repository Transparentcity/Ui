/**
 * Plain-language labels for Seymour's tool calls, in the past tense for a
 * finished step and the present tense while one runs. Unknown tools fall back
 * to the tool name with underscores spaced out.
 */
const TOOL_LABELS: Record<string, { done: string; running: string }> = {
  set_dataset: { done: "Chose a dataset", running: "Choosing a dataset" },
  get_metric_data: { done: "Looked up metric data", running: "Looking up metric data" },
  show_time_series: { done: "Built a time series chart", running: "Building a time series chart" },
  show_map: { done: "Showed a map", running: "Showing a map" },
  generate_map: { done: "Made a map", running: "Making a map" },
  show_anomaly: { done: "Pulled an anomaly", running: "Pulling an anomaly" },
  show_cross_city_comparison: { done: "Compared cities", running: "Comparing cities" },
  search_datasets: { done: "Searched datasets", running: "Searching datasets" },
  web_search: { done: "Searched the web", running: "Searching the web" },
};

/** "get_metric_data" -> "get metric data". */
export function humanizeToolName(name: string): string {
  return name.replace(/[_-]+/g, " ").trim();
}

export function describeToolCall(toolName: string, running = false): string {
  const known = TOOL_LABELS[toolName];
  if (known) return running ? known.running : known.done;
  const words = humanizeToolName(toolName) || "tool";
  if (running) return `Running ${words}`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
