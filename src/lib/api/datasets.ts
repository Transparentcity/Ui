import { request } from "./request";

// Datasets Admin API
export interface DatasetStats {
  total_datasets: number;
  datasets_by_status: {
    success: number;
    pending: number;
    error: number;
  };
}

export interface DatasetCategory {
  name: string;
  count: number;
}

export interface Dataset {
  id: number;
  dataset_id: string;
  title?: string;
  description?: string;
  city_name?: string;
  category?: string;
  publishing_department?: string;
  update_frequency?: string;
  row_count?: number;
  file_size_bytes?: number;
  fetch_status: "success" | "pending" | "error";
  last_updated_date?: string;
  url?: string;
  api_url?: string | null;
  source_data_url?: string | null;
}

export function getDatasetStats(token: string): Promise<DatasetStats> {
  return request<DatasetStats>("/api/admin/stats", "GET", undefined, token);
}

export function getDatasetCategories(token: string): Promise<DatasetCategory[]> {
  return request<DatasetCategory[]>("/api/admin/datasets/categories/list", "GET", undefined, token);
}

export function listDatasets(
  token: string,
  options?: {
    limit?: number;
    search?: string;
    category?: string;
    fetch_status?: string;
    city_id?: number;
  }
): Promise<Dataset[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.append("limit", options.limit.toString());
  if (options?.search) params.append("search", options.search);
  if (options?.category) params.append("category", options.category);
  if (options?.fetch_status) params.append("fetch_status", options.fetch_status);
  if (options?.city_id) params.append("city_id", options.city_id.toString());
  
  const query = params.toString();
  const path = `/api/admin/datasets${query ? `?${query}` : ""}`;
  return request<Dataset[]>(path, "GET", undefined, token);
}

export function getDataset(datasetId: number, token: string): Promise<Dataset> {
  return request<Dataset>(`/api/admin/datasets/${datasetId}`, "GET", undefined, token);
}

