"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  listCitiesWithFeedStories,
  listFeedStories,
  deleteFeedStory,
  deleteFeedStoriesByCity,
  type FeedStory,
  type CityWithFeedStories,
} from "@/lib/apiClient";
import { feedKeys } from "@/lib/hooks/useFeed";
import styles from "./FeedStoriesAdmin.module.css";

export default function FeedStoriesAdmin() {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();
  const [cities, setCities] = useState<CityWithFeedStories[]>([]);
  const [cityId, setCityId] = useState<number | null>(null);
  const [districtFilter, setDistrictFilter] = useState<string>("");
  const [stories, setStories] = useState<FeedStory[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCities, setLoadingCities] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCities = useCallback(async () => {
    setLoadingCities(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const list = await listCitiesWithFeedStories(token);
      setCities(Array.isArray(list) ? list : []);
      const arr = Array.isArray(list) ? list : [];
      if (arr.length > 0 && !cityId) {
        setCityId(arr[0].city_id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load cities");
      setCities([]);
    } finally {
      setLoadingCities(false);
    }
  }, [getAccessTokenSilently, cityId]);

  const loadStories = useCallback(async () => {
    const id = cityId;
    if (id == null) {
      setStories([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const districtParam =
        districtFilter === ""
          ? undefined
          : districtFilter === "citywide"
            ? 0
            : parseInt(districtFilter, 10);
      if (districtFilter !== "" && districtFilter !== "citywide" && (typeof districtParam !== "number" || isNaN(districtParam))) {
        setStories([]);
        setLoading(false);
        return;
      }
      const res = await listFeedStories(token, {
        city_id: id,
        district: districtParam ?? undefined,
        limit: 200,
        order_by: "published_at",
      });
      setStories(res.stories);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stories");
      setStories([]);
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently, cityId, districtFilter]);

  useEffect(() => {
    loadCities();
  }, [loadCities]);

  useEffect(() => {
    loadStories();
  }, [loadStories]);

  const invalidateFeedQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: feedKeys.lists() });
    queryClient.invalidateQueries({ queryKey: feedKeys.all });
  }, [queryClient]);

  const handleDeleteOne = async (storyId: number) => {
    setDeletingId(storyId);
    try {
      const token = await getAccessTokenSilently();
      await deleteFeedStory(storyId, token);
      invalidateFeedQueries();
      await loadStories();
      await loadCities();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete story");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAllForCity = async () => {
    if (cityId == null) return;
    if (!confirm(`Delete all feed stories for this city? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const token = await getAccessTokenSilently();
      await deleteFeedStoriesByCity(cityId, token);
      invalidateFeedQueries();
      await loadStories();
      await loadCities();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete stories");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDeleteAllForDistrict = async () => {
    if (cityId == null) return;
    const districtNum =
      districtFilter === "citywide"
        ? 0
        : districtFilter === ""
          ? null
          : parseInt(districtFilter, 10);
    if (districtNum === null || isNaN(districtNum)) {
      alert("Select a district filter first (e.g. City-wide only or a district number).");
      return;
    }
    const label = districtNum === 0 ? "city-wide" : `district ${districtNum}`;
    if (!confirm(`Delete all feed stories for ${label}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const token = await getAccessTokenSilently();
      await deleteFeedStoriesByCity(cityId, token, districtNum);
      invalidateFeedQueries();
      await loadStories();
      await loadCities();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete stories");
    } finally {
      setBulkDeleting(false);
    }
  };

  const canDeleteForDistrict =
    cityId != null &&
    districtFilter !== "" &&
    (districtFilter === "citywide" || !isNaN(parseInt(districtFilter, 10)));

  return (
    <div className={styles.container}>
      <p style={{ color: "var(--text-secondary)", marginBottom: "1rem", fontSize: "14px" }}>
        Review and delete feed stories. Filter by city and optionally by district, then delete
        individual stories or all for the city/district.
      </p>

      <div className={styles.filters}>
        <div className={styles.filterRow}>
          <label htmlFor="feed-admin-city" className={styles.label}>
            City
          </label>
          <select
            id="feed-admin-city"
            value={cityId ?? ""}
            onChange={(e) => setCityId(e.target.value ? parseInt(e.target.value, 10) : null)}
            className={styles.select}
            disabled={loadingCities}
          >
            <option value="">
              {loadingCities
                ? "Loading…"
                : cities.length === 0
                  ? "No cities with feed stories"
                  : "Select city"}
            </option>
            {cities.map((c) => (
              <option key={c.city_id} value={c.city_id}>
                {c.state ? `${c.city_name}, ${c.state}` : c.city_name}
                {c.story_count != null ? ` (${c.story_count})` : ""}
              </option>
            ))}
          </select>
          {!loadingCities && cities.length === 0 && (
            <button type="button" onClick={() => loadCities()} className={styles.retryBtn}>
              Retry
            </button>
          )}
        </div>
        <div className={styles.filterRow}>
          <label htmlFor="feed-admin-district" className={styles.label}>
            District
          </label>
          <select
            id="feed-admin-district"
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            className={styles.select}
            disabled={!cityId}
          >
            <option value="">All</option>
            <option value="citywide">City-wide only (0)</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((d) => (
              <option key={d} value={String(d)}>
                District {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.bulkActions}>
        {cityId != null && (
          <button
            type="button"
            onClick={handleDeleteAllForCity}
            disabled={bulkDeleting || loading}
            className={styles.bulkButton}
          >
            {bulkDeleting ? "Deleting…" : "Delete all for this city"}
          </button>
        )}
        {canDeleteForDistrict && (
          <button
            type="button"
            onClick={handleDeleteAllForDistrict}
            disabled={bulkDeleting || loading}
            className={styles.bulkButtonDanger}
          >
            {bulkDeleting ? "Deleting…" : "Delete all for this district"}
          </button>
        )}
      </div>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className={styles.muted}>Loading stories…</p>
      ) : !cityId ? (
        <p className={styles.muted}>
          {cities.length === 0
            ? "No cities have feed stories yet."
            : "Select a city to list feed stories."}
        </p>
      ) : stories.length === 0 ? (
        <p className={styles.muted}>No feed stories match the filter.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Headline</th>
                <th>District</th>
                <th>Published</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stories.map((s) => (
                <tr key={s.id}>
                  <td className={styles.cellHeadline}>{s.headline || "—"}</td>
                  <td>{s.district != null ? s.district : "city-wide"}</td>
                  <td>
                    {s.published_at
                      ? new Date(s.published_at).toLocaleDateString(undefined, {
                          dateStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleDeleteOne(s.id)}
                      disabled={deletingId === s.id}
                      className={styles.deleteBtn}
                      title="Delete this story"
                    >
                      {deletingId === s.id ? "…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
