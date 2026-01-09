"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import Link from "next/link";
import "./styles.css";

interface MapListItem {
  id: number;
  short_hash: string;
  title: string;
  description: string | null;
  map_type: string;
  city_id: number | null;
  city_name: string | null;
  is_public: boolean;
  view_count: number;
  user_id: string | null;
  created_at: string;
  point_count: number;
}

interface MapStats {
  total_maps: number;
  public_maps: number;
  private_maps: number;
  total_views: number;
  maps_by_type: Record<string, number>;
  maps_by_city: Record<string, number>;
  top_viewed: MapListItem[];
}

interface MapListResponse {
  maps: MapListItem[];
  total: number;
  limit: number;
  offset: number;
}

export default function AdminMapsPage() {
  const { isAuthenticated, isLoading: authLoading, getAccessTokenSilently, user } = useAuth0();
  
  const [maps, setMaps] = useState<MapListItem[]>([]);
  const [stats, setStats] = useState<MapStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMaps, setSelectedMaps] = useState<Set<number>>(new Set());
  const [actionInProgress, setActionInProgress] = useState(false);
  const [previewMap, setPreviewMap] = useState<MapListItem | null>(null);
  
  // Filters
  const [filterPublic, setFilterPublic] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Check if user is admin
  const isAdmin = user?.["https://transparentcity.co/role"] === "admin";
  
  const fetchMaps = useCallback(async () => {
    if (!isAuthenticated || !isAdmin) return;
    
    try {
      setLoading(true);
      const token = await getAccessTokenSilently();
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
      
      // Build query params
      const params = new URLSearchParams();
      params.set("limit", "100");
      
      if (filterPublic !== "all") {
        params.set("is_public", filterPublic === "public" ? "true" : "false");
      }
      if (filterType !== "all") {
        params.set("map_type", filterType);
      }
      
      const response = await fetch(`${apiBase}/api/admin/maps?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("Admin access required");
        }
        throw new Error("Failed to fetch maps");
      }
      
      const data: MapListResponse = await response.json();
      setMaps(data.maps);
      setSelectedMaps(new Set());
    } catch (err) {
      console.error("Error fetching maps:", err);
      setError(err instanceof Error ? err.message : "Failed to load maps");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, isAdmin, getAccessTokenSilently, filterPublic, filterType]);
  
  const fetchStats = useCallback(async () => {
    if (!isAuthenticated || !isAdmin) return;
    
    try {
      const token = await getAccessTokenSilently();
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
      
      const response = await fetch(`${apiBase}/api/admin/maps/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const data: MapStats = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  }, [isAuthenticated, isAdmin, getAccessTokenSilently]);
  
  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      fetchMaps();
      fetchStats();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [isAuthenticated, authLoading, isAdmin, fetchMaps, fetchStats]);
  
  // Filter by search query locally
  const filteredMaps = maps.filter(map => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      map.title.toLowerCase().includes(query) ||
      (map.description?.toLowerCase().includes(query) ?? false) ||
      (map.city_name?.toLowerCase().includes(query) ?? false)
    );
  });
  
  const handleSelectAll = () => {
    if (selectedMaps.size === filteredMaps.length) {
      setSelectedMaps(new Set());
    } else {
      setSelectedMaps(new Set(filteredMaps.map(m => m.id)));
    }
  };
  
  const handleSelect = (mapId: number) => {
    const newSelected = new Set(selectedMaps);
    if (newSelected.has(mapId)) {
      newSelected.delete(mapId);
    } else {
      newSelected.add(mapId);
    }
    setSelectedMaps(newSelected);
  };
  
  const handleBulkPublish = async (publish: boolean) => {
    if (selectedMaps.size === 0) return;
    
    if (!confirm(`Are you sure you want to ${publish ? "publish" : "unpublish"} ${selectedMaps.size} maps?`)) {
      return;
    }
    
    try {
      setActionInProgress(true);
      const token = await getAccessTokenSilently();
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
      
      const response = await fetch(`${apiBase}/api/admin/maps/bulk/publish`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          map_ids: Array.from(selectedMaps),
          is_public: publish,
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to update maps");
      }
      
      await fetchMaps();
      await fetchStats();
    } catch (err) {
      console.error("Error updating maps:", err);
      alert("Failed to update maps");
    } finally {
      setActionInProgress(false);
    }
  };
  
  const handleBulkDelete = async () => {
    if (selectedMaps.size === 0) return;
    
    if (!confirm(`Are you sure you want to DELETE ${selectedMaps.size} maps? This cannot be undone.`)) {
      return;
    }
    
    try {
      setActionInProgress(true);
      const token = await getAccessTokenSilently();
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
      
      const response = await fetch(`${apiBase}/api/admin/maps/bulk`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          map_ids: Array.from(selectedMaps),
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete maps");
      }
      
      await fetchMaps();
      await fetchStats();
    } catch (err) {
      console.error("Error deleting maps:", err);
      alert("Failed to delete maps");
    } finally {
      setActionInProgress(false);
    }
  };
  
  // Auth loading
  if (authLoading) {
    return (
      <div className="admin-maps-page">
        <div className="loading-container">Loading...</div>
      </div>
    );
  }
  
  // Not authenticated or not admin
  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="admin-maps-page">
        <div className="access-denied">
          <h1>Access Denied</h1>
          <p>You must be an admin to view this page.</p>
          <Link href="/" className="back-link">Back to Home</Link>
        </div>
      </div>
    );
  }
  
  // Loading
  if (loading) {
    return (
      <div className="admin-maps-page">
        <div className="loading-container">Loading maps...</div>
      </div>
    );
  }
  
  // Error
  if (error) {
    return (
      <div className="admin-maps-page">
        <div className="error-container">
          <p>{error}</p>
          <button onClick={fetchMaps} className="retry-button">Retry</button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="admin-maps-page">
      <header className="page-header">
        <div className="header-content">
          <h1>Map Administration</h1>
          <p className="subtitle">Manage all saved maps across the platform</p>
        </div>
      </header>
      
      {/* Stats Cards */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.total_maps}</div>
            <div className="stat-label">Total Maps</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.public_maps}</div>
            <div className="stat-label">Public</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.private_maps}</div>
            <div className="stat-label">Private</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.total_views.toLocaleString()}</div>
            <div className="stat-label">Total Views</div>
          </div>
        </div>
      )}
      
      {/* Filters */}
      <div className="filters-bar">
        <div className="filter-group">
          <label>Visibility:</label>
          <select 
            value={filterPublic} 
            onChange={(e) => setFilterPublic(e.target.value)}
          >
            <option value="all">All</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label>Type:</label>
          <select 
            value={filterType} 
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="point">Point</option>
            <option value="choropleth">Choropleth</option>
            <option value="symbol">Symbol</option>
            <option value="heatmap">Heatmap</option>
          </select>
        </div>
        
        <div className="filter-group search">
          <input
            type="text"
            placeholder="Search maps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <button onClick={fetchMaps} className="refresh-button">
          Refresh
        </button>
      </div>
      
      {/* Bulk Actions */}
      {selectedMaps.size > 0 && (
        <div className="bulk-actions">
          <span>{selectedMaps.size} selected</span>
          <button 
            onClick={() => handleBulkPublish(true)}
            disabled={actionInProgress}
            className="bulk-button publish"
          >
            Make Public
          </button>
          <button 
            onClick={() => handleBulkPublish(false)}
            disabled={actionInProgress}
            className="bulk-button unpublish"
          >
            Make Private
          </button>
          <button 
            onClick={handleBulkDelete}
            disabled={actionInProgress}
            className="bulk-button delete"
          >
            Delete Selected
          </button>
        </div>
      )}
      
      {/* Maps Table */}
      <div className="maps-table-container">
        <table className="maps-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={selectedMaps.size === filteredMaps.length && filteredMaps.length > 0}
                  onChange={handleSelectAll}
                />
              </th>
              <th>Title</th>
              <th>City</th>
              <th>Type</th>
              <th>Points</th>
              <th>Views</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredMaps.map(map => (
              <tr key={map.id} className={selectedMaps.has(map.id) ? "selected" : ""}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedMaps.has(map.id)}
                    onChange={() => handleSelect(map.id)}
                  />
                </td>
                <td className="title-cell">
                  <div className="map-title">{map.title}</div>
                  {map.description && (
                    <div className="map-desc">{map.description}</div>
                  )}
                </td>
                <td>{map.city_name || "—"}</td>
                <td>
                  <span className="type-badge">{map.map_type}</span>
                </td>
                <td>{map.point_count.toLocaleString()}</td>
                <td>{map.view_count.toLocaleString()}</td>
                <td>
                  <span className={`status-badge ${map.is_public ? "public" : "private"}`}>
                    {map.is_public ? "Public" : "Private"}
                  </span>
                </td>
                <td>{new Date(map.created_at).toLocaleDateString()}</td>
                <td className="actions-cell">
                  <button 
                    onClick={() => setPreviewMap(map)}
                    className="action-btn preview"
                    title="Preview"
                  >
                    👁
                  </button>
                  <Link 
                    href={`/m/${map.short_hash}`}
                    target="_blank"
                    className="action-btn view"
                    title="View"
                  >
                    ↗
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredMaps.length === 0 && (
          <div className="empty-table">
            No maps found matching your filters.
          </div>
        )}
      </div>
      
      {/* Preview Modal */}
      {previewMap && (
        <div className="preview-modal-overlay" onClick={() => setPreviewMap(null)}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview-header">
              <h2>{previewMap.title}</h2>
              <button onClick={() => setPreviewMap(null)} className="close-btn">×</button>
            </div>
            <div className="preview-content">
              <div className="preview-info">
                <p><strong>City:</strong> {previewMap.city_name || "N/A"}</p>
                <p><strong>Type:</strong> {previewMap.map_type}</p>
                <p><strong>Points:</strong> {previewMap.point_count.toLocaleString()}</p>
                <p><strong>Views:</strong> {previewMap.view_count.toLocaleString()}</p>
                <p><strong>Status:</strong> {previewMap.is_public ? "Public" : "Private"}</p>
                <p><strong>Created:</strong> {new Date(previewMap.created_at).toLocaleString()}</p>
                {previewMap.description && (
                  <p><strong>Description:</strong> {previewMap.description}</p>
                )}
              </div>
              <div className="preview-actions">
                <Link 
                  href={`/m/${previewMap.short_hash}`}
                  target="_blank"
                  className="preview-btn"
                >
                  Open Full Map
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


