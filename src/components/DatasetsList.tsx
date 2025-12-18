"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  getDatasetStats,
  getDatasetCategories,
  listDatasets,
  getDataset,
  listCities,
  type DatasetStats,
  type DatasetCategory,
  type Dataset,
  type CityListItem,
} from "@/lib/apiClient";
import Loader from "./Loader";
import styles from "./DatasetsList.module.css";

interface DatasetsListProps {
  cityId?: number;
  showStats?: boolean;
  showCityFilter?: boolean;
}

export default function DatasetsList({
  cityId,
  showStats = true,
  showCityFilter = true,
}: DatasetsListProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [stats, setStats] = useState<DatasetStats | null>(null);
  const [categories, setCategories] = useState<DatasetCategory[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [cities, setCities] = useState<CityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedCityId, setSelectedCityId] = useState<number | null>(cityId || null);
  const [citySearchQuery, setCitySearchQuery] = useState("");
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  // Refs for debouncing
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideDropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();

      const promises: Promise<any>[] = [
        getDatasetCategories(token),
        listDatasets(token, {
          limit: 100,
          city_id: cityId || selectedCityId || undefined,
        }),
      ];

      // Only load stats if showStats is true
      if (showStats) {
        promises.unshift(getDatasetStats(token));
      }

      // Only load cities if showCityFilter is true
      if (showCityFilter) {
        promises.push(listCities(token, undefined, undefined, true));
      }

      const results = await Promise.all(promises);

      let resultIndex = 0;
      if (showStats) {
        setStats(results[resultIndex++]);
      }
      setCategories(results[resultIndex++]);
      setDatasets(results[resultIndex++]);
      if (showCityFilter) {
        setCities(results[resultIndex++]);
      }
    } catch (err) {
      console.error("Error loading datasets data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently, cityId, showStats, showCityFilter, selectedCityId]);

  // Load datasets with filters
  const loadDatasets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();

      const datasetsData = await listDatasets(token, {
        limit: 100,
        search: searchQuery || undefined,
        category: selectedCategory || undefined,
        fetch_status: selectedStatus || undefined,
        city_id: cityId || selectedCityId || undefined,
      });

      setDatasets(datasetsData);
    } catch (err) {
      console.error("Error loading datasets:", err);
      setError(err instanceof Error ? err.message : "Failed to load datasets");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently, searchQuery, selectedCategory, selectedStatus, cityId, selectedCityId]);

  // Debounced search
  const debouncedSearch = useCallback(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      loadDatasets();
    }, 500);
  }, [loadDatasets]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    debouncedSearch();
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, debouncedSearch]);

  useEffect(() => {
    loadDatasets();
  }, [selectedCategory, selectedStatus, selectedCityId, loadDatasets]);

  // Update selectedCityId when cityId prop changes
  useEffect(() => {
    if (cityId !== undefined) {
      setSelectedCityId(cityId);
    }
  }, [cityId]);

  // Filter cities for dropdown
  const filteredCities = cities.filter((city) =>
    `${city.city_name || ""}${city.state ? `, ${city.state}` : ""}`
      .toLowerCase()
      .includes(citySearchQuery.toLowerCase())
  );

  const handleCitySelect = (cityId: number, cityName: string) => {
    setSelectedCityId(cityId);
    setCitySearchQuery(cityName);
    setShowCityDropdown(false);
  };

  const handleClearCityFilter = () => {
    setSelectedCityId(null);
    setCitySearchQuery("");
  };

  const handleViewDataset = async (datasetId: number) => {
    try {
      const token = await getAccessTokenSilently();
      const dataset = await getDataset(datasetId, token);

      const details = `
Dataset ID: ${dataset.dataset_id}
Title: ${dataset.title || "N/A"}
City: ${dataset.city_name || "N/A"}
Category: ${dataset.category || "N/A"}
Department: ${dataset.publishing_department || "N/A"}
Status: ${dataset.fetch_status}
Rows: ${dataset.row_count || "N/A"}
Size: ${dataset.file_size_bytes ? (dataset.file_size_bytes / 1024 / 1024).toFixed(2) + " MB" : "N/A"}
URL: ${dataset.url || "N/A"}
      `.trim();

      alert(details);
    } catch (err) {
      console.error("Error viewing dataset:", err);
      alert("Error loading dataset details: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const handleShowCityDropdown = () => {
    if (hideDropdownTimeoutRef.current) {
      clearTimeout(hideDropdownTimeoutRef.current);
    }
    setShowCityDropdown(true);
  };

  const handleHideCityDropdown = () => {
    hideDropdownTimeoutRef.current = setTimeout(() => {
      setShowCityDropdown(false);
    }, 200);
  };

  if (loading && !stats && showStats) {
    return (
      <div className={styles.loadingContainer} style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center" }}>
        <Loader size="sm" color="dark" />
        <span className={styles.loadingText}>Loading datasets...</span>
      </div>
    );
  }

  return (
    <div className={styles.datasetsList}>
      {/* Stats Cards */}
      {showStats && stats && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statCardContent}>
              <div className={styles.statCardInner}>
                <div className={styles.statIcon}>
                  <i className="fas fa-database" style={{ fontSize: "32px", color: "var(--brand-primary)" }}></i>
                </div>
                <div className={styles.statText}>
                  <div className={styles.statLabel}>Total Datasets</div>
                  <div className={styles.statValue}>{stats.total_datasets ?? 0}</div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statCardContent}>
              <div className={styles.statCardInner}>
                <div className={styles.statIcon}>
                  <i className="fas fa-check-circle" style={{ fontSize: "32px", color: "var(--success)" }}></i>
                </div>
                <div className={styles.statText}>
                  <div className={styles.statLabel}>Successfully Fetched</div>
                  <div className={styles.statValue}>{stats.datasets_by_status?.success ?? 0}</div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statCardContent}>
              <div className={styles.statCardInner}>
                <div className={styles.statIcon}>
                  <i className="fas fa-clock" style={{ fontSize: "32px", color: "var(--brand-primary)" }}></i>
                </div>
                <div className={styles.statText}>
                  <div className={styles.statLabel}>Pending</div>
                  <div className={styles.statValue}>{stats.datasets_by_status?.pending ?? 0}</div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statCardContent}>
              <div className={styles.statCardInner}>
                <div className={styles.statIcon}>
                  <i className="fas fa-exclamation-triangle" style={{ fontSize: "32px", color: "var(--error)" }}></i>
                </div>
                <div className={styles.statText}>
                  <div className={styles.statLabel}>Errors</div>
                  <div className={styles.statValue}>{stats.datasets_by_status?.error ?? 0}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div className={styles.filtersContainer}>
        <div className={styles.filtersRow}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search datasets..."
            className={styles.searchInput}
          />
          {showCityFilter && (
            <div className={styles.cityFilterWrapper}>
              <input
                type="text"
                value={citySearchQuery}
                onChange={(e) => {
                  setCitySearchQuery(e.target.value);
                  setShowCityDropdown(true);
                }}
                onFocus={handleShowCityDropdown}
                onBlur={handleHideCityDropdown}
                placeholder="Filter by city..."
                className={styles.cityInput}
                autoComplete="off"
              />
              {selectedCityId && (
                <button
                  onClick={handleClearCityFilter}
                  className={styles.clearCityBtn}
                  title="Clear city filter"
                >
                  <i className="fas fa-times"></i>
                </button>
              )}
              {showCityDropdown && (
                <div className={styles.cityDropdown}>
                  {filteredCities.length === 0 ? (
                    <div className={styles.cityDropdownEmpty}>No cities found</div>
                  ) : (
                    filteredCities.map((city) => {
                      const displayName = `${city.city_name || ""}${city.state ? `, ${city.state}` : ""}`;
                      return (
                        <div
                          key={city.city_id}
                          className={styles.cityDropdownItem}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleCitySelect(city.city_id, displayName);
                          }}
                        >
                          {displayName}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className={styles.select}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.name} value={cat.name}>
                {cat.name} ({cat.count})
              </option>
            ))}
          </select>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className={styles.select}
          >
            <option value="">All Status</option>
            <option value="success">Success</option>
            <option value="pending">Pending</option>
            <option value="error">Error</option>
          </select>
          <button onClick={() => loadData()} className={styles.refreshBtn}>
            <i className="fas fa-sync-alt"></i> Refresh
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className={styles.errorMessage}>
          {error}
        </div>
      )}

      {/* Datasets Table */}
      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <div className={styles.tableHeaderContent}>
            <h2 className={styles.tableTitle}>Datasets List</h2>
            <div className={styles.filterSummary}>
              <span className={styles.datasetCount}>
                {loading ? (
                  <span className={styles.loadingText} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <Loader size="sm" color="dark" />
                    Loading...
                  </span>
                ) : (
                  <>
                    <strong>{datasets.length}</strong> dataset{datasets.length !== 1 ? "s" : ""} found
                  </>
                )}
              </span>
              {(searchQuery || selectedCategory || selectedStatus || selectedCityId) && (
                <div className={styles.activeFilters}>
                  <span className={styles.activeFiltersLabel}>Active filters:</span>
                  <div className={styles.filterTags}>
                    {searchQuery && (
                      <span className={styles.filterTag}>
                        Search: "{searchQuery}"
                        <button
                          onClick={() => setSearchQuery("")}
                          className={styles.filterTagRemove}
                          title="Remove search filter"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </span>
                    )}
                    {selectedCategory && (
                      <span className={styles.filterTag}>
                        Category: {selectedCategory}
                        <button
                          onClick={() => setSelectedCategory("")}
                          className={styles.filterTagRemove}
                          title="Remove category filter"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </span>
                    )}
                    {selectedStatus && (
                      <span className={styles.filterTag}>
                        Status: {selectedStatus}
                        <button
                          onClick={() => setSelectedStatus("")}
                          className={styles.filterTagRemove}
                          title="Remove status filter"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </span>
                    )}
                    {selectedCityId && (
                      <span className={styles.filterTag}>
                        City: {citySearchQuery || cities.find(c => c.city_id === selectedCityId)?.city_name || `City ${selectedCityId}`}
                        <button
                          onClick={handleClearCityFilter}
                          className={styles.filterTagRemove}
                          title="Remove city filter"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setSelectedCategory("");
                        setSelectedStatus("");
                        handleClearCityFilter();
                      }}
                      className={styles.clearAllFiltersBtn}
                      title="Clear all filters"
                    >
                      Clear all
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead className={styles.tableHead}>
              <tr>
                <th className={styles.tableHeaderCell}>ID</th>
                <th className={styles.tableHeaderCell}>Dataset ID / Title</th>
                {!cityId && <th className={styles.tableHeaderCell}>City</th>}
                <th className={styles.tableHeaderCell}>Category</th>
                <th className={styles.tableHeaderCell}>Department</th>
                <th className={styles.tableHeaderCell}>Update Frequency</th>
                <th className={styles.tableHeaderCell}>Rows</th>
                <th className={styles.tableHeaderCell}>Status</th>
                <th className={styles.tableHeaderCell}>Last Updated</th>
                <th className={styles.tableHeaderCell}>Actions</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {loading ? (
                <tr>
                  <td colSpan={cityId ? 9 : 10} className={styles.tableCell} style={{ textAlign: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                      <Loader size="sm" color="dark" />
                      <span className={styles.loadingText}>Loading datasets...</span>
                    </div>
                  </td>
                </tr>
              ) : datasets.length === 0 ? (
                <tr>
                  <td colSpan={cityId ? 9 : 10} className={styles.emptyState}>
                    No datasets found matching the current filters.
                  </td>
                </tr>
              ) : (
                datasets.map((dataset) => {
                  const statusClass =
                    dataset.fetch_status === "success"
                      ? styles.statusSuccess
                      : dataset.fetch_status === "error"
                      ? styles.statusError
                      : styles.statusPending;

                  const statusText =
                    dataset.fetch_status === "success"
                      ? "Success"
                      : dataset.fetch_status === "error"
                      ? "Error"
                      : "Pending";

                  return (
                    <tr key={dataset.id} className={styles.tableRow}>
                      <td className={styles.tableCell}>{dataset.id}</td>
                      <td className={styles.tableCell}>
                        <div className={styles.tableCellText}>
                          {dataset.title || dataset.dataset_id}
                        </div>
                        <div className={styles.tableCellSubtext}>{dataset.dataset_id}</div>
                        {dataset.description && (
                          <div className={styles.tableCellDescription}>
                            {dataset.description.length > 100
                              ? `${dataset.description.substring(0, 100)}...`
                              : dataset.description}
                          </div>
                        )}
                      </td>
                      {!cityId && (
                        <td className={styles.tableCell}>
                          {dataset.city_name || <span style={{ color: "var(--text-tertiary)" }}>N/A</span>}
                        </td>
                      )}
                      <td className={styles.tableCell}>
                        {dataset.category || <span style={{ color: "var(--text-tertiary)" }}>N/A</span>}
                      </td>
                      <td className={styles.tableCell}>
                        {dataset.publishing_department || <span style={{ color: "var(--text-tertiary)" }}>N/A</span>}
                      </td>
                      <td className={styles.tableCell}>
                        {dataset.update_frequency || <span style={{ color: "var(--text-tertiary)" }}>N/A</span>}
                      </td>
                      <td className={styles.tableCell}>
                        {dataset.row_count ? dataset.row_count.toLocaleString() : "N/A"}
                      </td>
                      <td className={styles.tableCell}>
                        <span className={`${styles.statusBadge} ${statusClass}`}>
                          {statusText}
                        </span>
                      </td>
                      <td className={styles.tableCell}>
                        {dataset.last_updated_date
                          ? new Date(dataset.last_updated_date).toLocaleDateString()
                          : "N/A"}
                      </td>
                      <td className={styles.tableCell}>
                        <button
                          onClick={() => handleViewDataset(dataset.id)}
                          className={styles.actionBtn}
                          title="View Details"
                        >
                          <i className="fas fa-eye"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

