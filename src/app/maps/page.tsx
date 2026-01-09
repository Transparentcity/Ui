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
  created_at: string;
  point_count: number;
  public_url: string | null;
}

interface MapListResponse {
  maps: MapListItem[];
  total: number;
  limit: number;
  offset: number;
}

export default function MyMapsPage() {
  const { isAuthenticated, isLoading: authLoading, loginWithRedirect, getAccessTokenSilently } = useAuth0();
  
  const [maps, setMaps] = useState<MapListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  
  const fetchMaps = useCallback(async () => {
    if (!isAuthenticated) return;
    
    try {
      setLoading(true);
      const token = await getAccessTokenSilently();
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
      
      const response = await fetch(`${apiBase}/api/maps`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch maps");
      }
      
      const data: MapListResponse = await response.json();
      setMaps(data.maps);
    } catch (err) {
      console.error("Error fetching maps:", err);
      setError("Failed to load your maps");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, getAccessTokenSilently]);
  
  useEffect(() => {
    if (isAuthenticated) {
      fetchMaps();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [isAuthenticated, authLoading, fetchMaps]);
  
  const handleTogglePublic = async (mapId: number, currentPublic: boolean) => {
    try {
      setActionInProgress(mapId);
      const token = await getAccessTokenSilently();
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
      
      const response = await fetch(`${apiBase}/api/maps/${mapId}/publish`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ is_public: !currentPublic }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to update map");
      }
      
      // Update local state
      setMaps(maps.map(m => 
        m.id === mapId 
          ? { ...m, is_public: !currentPublic, public_url: !currentPublic ? `/m/${m.short_hash}` : null }
          : m
      ));
    } catch (err) {
      console.error("Error updating map:", err);
      alert("Failed to update map visibility");
    } finally {
      setActionInProgress(null);
    }
  };
  
  const handleDelete = async (mapId: number, mapTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${mapTitle}"? This cannot be undone.`)) {
      return;
    }
    
    try {
      setActionInProgress(mapId);
      const token = await getAccessTokenSilently();
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
      
      const response = await fetch(`${apiBase}/api/maps/${mapId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete map");
      }
      
      // Update local state
      setMaps(maps.filter(m => m.id !== mapId));
    } catch (err) {
      console.error("Error deleting map:", err);
      alert("Failed to delete map");
    } finally {
      setActionInProgress(null);
    }
  };
  
  const handleCopyLink = (mapId: number, shortHash: string) => {
    const url = `${window.location.origin}/m/${shortHash}`;
    navigator.clipboard.writeText(url);
    setCopiedId(mapId);
    setTimeout(() => setCopiedId(null), 2000);
  };
  
  // Auth loading state
  if (authLoading) {
    return (
      <div className="my-maps-page">
        <div className="loading-container">
          <div className="loading-spinner">Loading...</div>
        </div>
      </div>
    );
  }
  
  // Not authenticated
  if (!isAuthenticated) {
    return (
      <div className="my-maps-page">
        <div className="auth-prompt">
          <h1>My Maps</h1>
          <p>Sign in to view and manage your saved maps.</p>
          <button onClick={() => loginWithRedirect()} className="sign-in-button">
            Sign In
          </button>
        </div>
      </div>
    );
  }
  
  // Loading maps
  if (loading) {
    return (
      <div className="my-maps-page">
        <div className="page-header">
          <h1>My Maps</h1>
        </div>
        <div className="loading-container">
          <div className="loading-spinner">Loading your maps...</div>
        </div>
      </div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <div className="my-maps-page">
        <div className="page-header">
          <h1>My Maps</h1>
        </div>
        <div className="error-container">
          <p>{error}</p>
          <button onClick={fetchMaps} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="my-maps-page">
      <div className="page-header">
        <div className="header-content">
          <h1>My Maps</h1>
          <p className="subtitle">Interactive maps you&apos;ve created</p>
        </div>
        <Link href="/" className="create-map-link">
          + Create New Map
        </Link>
      </div>
      
      {maps.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🗺️</div>
          <h2>No maps yet</h2>
          <p>
            Create your first map by chatting with Seymour. Ask for a map of any 
            dataset with location fields, and it will be saved here.
          </p>
          <Link href="/" className="get-started-button">
            Start a Conversation
          </Link>
        </div>
      ) : (
        <div className="maps-grid">
          {maps.map(map => (
            <div key={map.id} className="map-card">
              <div className="map-card-header">
                <h3 className="map-title">{map.title}</h3>
                <span className={`visibility-badge ${map.is_public ? "public" : "private"}`}>
                  {map.is_public ? "Public" : "Private"}
                </span>
              </div>
              
              {map.description && (
                <p className="map-description">{map.description}</p>
              )}
              
              <div className="map-meta">
                <span className="meta-item">
                  📍 {map.point_count} locations
                </span>
                {map.city_name && (
                  <span className="meta-item">
                    🏙️ {map.city_name}
                  </span>
                )}
                <span className="meta-item">
                  {map.map_type}
                </span>
                {map.is_public && (
                  <span className="meta-item">
                    👁️ {map.view_count} views
                  </span>
                )}
              </div>
              
              <div className="map-date">
                Created {new Date(map.created_at).toLocaleDateString()}
              </div>
              
              <div className="map-actions">
                <Link href={`/m/${map.short_hash}`} className="action-button view">
                  View Map
                </Link>
                
                <button
                  onClick={() => handleTogglePublic(map.id, map.is_public)}
                  disabled={actionInProgress === map.id}
                  className={`action-button ${map.is_public ? "unpublish" : "publish"}`}
                >
                  {actionInProgress === map.id 
                    ? "..." 
                    : map.is_public ? "Make Private" : "Make Public"
                  }
                </button>
                
                {map.is_public && (
                  <button
                    onClick={() => handleCopyLink(map.id, map.short_hash)}
                    className="action-button copy"
                  >
                    {copiedId === map.id ? "Copied!" : "Copy Link"}
                  </button>
                )}
                
                <button
                  onClick={() => handleDelete(map.id, map.title)}
                  disabled={actionInProgress === map.id}
                  className="action-button delete"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


