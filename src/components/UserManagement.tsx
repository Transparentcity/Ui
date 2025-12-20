"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  listUsers,
  updateUser,
  makeUserAdmin,
  getUserStats,
  listCities,
  getUserCityLeads,
  setUserCityLeads,
  type User,
  type UserUpdateRequest,
  type UserStats,
  type CityListItem,
} from "@/lib/apiClient";
import Loader from "./Loader";
import styles from "./UserManagement.module.css";

export default function UserManagement() {
  const { getAccessTokenSilently } = useAuth0();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [cities, setCities] = useState<CityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<boolean | null>(null);
  const [selectedCityLead, setSelectedCityLead] = useState<boolean | null>(null);

  // Edit modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<UserUpdateRequest>({});
  const [editCityLeadCityIds, setEditCityLeadCityIds] = useState<number[]>([]);
  const [editCityLeadLoading, setEditCityLeadLoading] = useState(false);
  const [editCityLeadDirty, setEditCityLeadDirty] = useState(false);
  const [addCityLeadCityId, setAddCityLeadCityId] = useState<number | "">("");

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();

      // Load stats, users, and cities in parallel
      const [statsData, usersData, citiesData] = await Promise.all([
        getUserStats(token),
        listUsers(token, { limit: 1000 }),
        listCities(token),
      ]);

      setStats(statsData);
      setUsers(usersData);
      setCities(citiesData);
    } catch (err) {
      console.error("Error loading user management data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  // Load users with filters
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();

      const usersData = await listUsers(token, {
        limit: 1000,
        role: selectedRole || undefined,
        is_active: selectedStatus !== null ? selectedStatus : undefined,
        is_city_lead: selectedCityLead !== null ? selectedCityLead : undefined,
      });

      // Apply search filter client-side
      let filteredUsers = usersData;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filteredUsers = usersData.filter(
          (user) =>
            user.email.toLowerCase().includes(query) ||
            (user.name && user.name.toLowerCase().includes(query)) ||
            user.role.toLowerCase().includes(query) ||
            (query.includes("city lead") && !!user.is_city_lead)
        );
      }

      setUsers(filteredUsers);
    } catch (err) {
      console.error("Error loading users:", err);
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently, selectedRole, selectedStatus, selectedCityLead, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadUsers();
  }, [selectedRole, selectedStatus, selectedCityLead, loadUsers]);

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadUsers();
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, loadUsers]);

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setEditForm({
      role: user.role as "admin" | "analyst" | "viewer",
      is_active: user.is_active,
    });
    setEditCityLeadCityIds(user.city_lead_city_ids || []);
    setEditCityLeadDirty(false);
    setAddCityLeadCityId("");
  };

  const handleCloseEdit = () => {
    setEditingUser(null);
    setEditForm({});
    setEditCityLeadCityIds([]);
    setEditCityLeadDirty(false);
    setEditCityLeadLoading(false);
    setAddCityLeadCityId("");
  };

  // Load city lead assignments fresh when modal opens (source of truth is backend)
  useEffect(() => {
    const loadCityLeads = async () => {
      if (!editingUser) return;
      try {
        setEditCityLeadLoading(true);
        const token = await getAccessTokenSilently();
        const res = await getUserCityLeads(editingUser.id, token);
        setEditCityLeadCityIds(res.city_ids || []);
        setEditCityLeadDirty(false);
      } catch (err) {
        // Not fatal; keep whatever we already have from the user list
        console.warn("Failed to load user city lead assignments:", err);
      } finally {
        setEditCityLeadLoading(false);
      }
    };
    loadCityLeads();
  }, [editingUser, getAccessTokenSilently]);

  const handleSaveEdit = async () => {
    if (!editingUser) return;

    try {
      setError(null);
      const token = await getAccessTokenSilently();
      await updateUser(editingUser.id, editForm, token);

      if (editCityLeadDirty) {
        await setUserCityLeads(editingUser.id, editCityLeadCityIds, token);
      }

      await loadUsers();
      await loadData(); // Refresh stats
      handleCloseEdit();
    } catch (err) {
      console.error("Error updating user:", err);
      setError(err instanceof Error ? err.message : "Failed to update user");
    }
  };

  const handleMakeAdmin = async (userId: number) => {
    if (!confirm("Are you sure you want to make this user an admin?")) {
      return;
    }

    try {
      setError(null);
      const token = await getAccessTokenSilently();
      await makeUserAdmin(userId, token);
      await loadUsers();
      await loadData(); // Refresh stats
    } catch (err) {
      console.error("Error making user admin:", err);
      setError(err instanceof Error ? err.message : "Failed to make user admin");
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Invalid date";
    }
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role.toLowerCase()) {
      case "admin":
        return styles.roleAdmin;
      case "analyst":
        return styles.roleAnalyst;
      case "viewer":
        return styles.roleViewer;
      default:
        return "";
    }
  };

  const formatCityDisplayName = (city: CityListItem): string => {
    const parts = [city.city_name];
    if (city.state) parts.push(city.state);
    if (city.country) parts.push(city.country);
    return parts.filter(Boolean).join(", ");
  };

  const cityNameById = useCallback(() => {
    const map = new Map<number, string>();
    for (const c of cities) {
      map.set(c.city_id, formatCityDisplayName(c));
    }
    return map;
  }, [cities]);

  const getCityName = useCallback(
    (cityId: number): string => {
      return cityNameById().get(cityId) || `City ${cityId}`;
    },
    [cityNameById],
  );

  if (loading && !stats) {
    return (
      <div className={styles.loadingContainer} style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center" }}>
        <Loader size="sm" color="dark" />
        <span className={styles.loadingText}>Loading users...</span>
      </div>
    );
  }

  return (
    <div className={styles.userManagement}>
      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardInner}>
              <div className={styles.statIcon}>
                <i
                  className="fas fa-users"
                  style={{ fontSize: "32px", color: "var(--brand-primary)" }}
                ></i>
              </div>
              <div className={styles.statText}>
                <div className={styles.statLabel}>Total Users</div>
                <div className={styles.statValue}>{stats?.total_users ?? 0}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardInner}>
              <div className={styles.statIcon}>
                <i
                  className="fas fa-user-check"
                  style={{ fontSize: "32px", color: "var(--success)" }}
                ></i>
              </div>
              <div className={styles.statText}>
                <div className={styles.statLabel}>Active Users</div>
                <div className={styles.statValue}>{stats?.active_users ?? 0}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardInner}>
              <div className={styles.statIcon}>
                <i
                  className="fas fa-user-shield"
                  style={{ fontSize: "32px", color: "var(--brand-primary)" }}
                ></i>
              </div>
              <div className={styles.statText}>
                <div className={styles.statLabel}>Admins</div>
                <div className={styles.statValue}>{stats?.admin_count ?? 0}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardInner}>
              <div className={styles.statIcon}>
                <i
                  className="fas fa-user-tie"
                  style={{ fontSize: "32px", color: "var(--brand-primary)" }}
                ></i>
              </div>
              <div className={styles.statText}>
                <div className={styles.statLabel}>Analysts</div>
                <div className={styles.statValue}>{stats?.analyst_count ?? 0}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardInner}>
              <div className={styles.statIcon}>
                <i
                  className="fas fa-city"
                  style={{ fontSize: "32px", color: "var(--brand-primary)" }}
                ></i>
              </div>
              <div className={styles.statText}>
                <div className={styles.statLabel}>City Leads</div>
                <div className={styles.statValue}>{stats?.city_lead_count ?? 0}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className={styles.filtersContainer}>
        <div className={styles.filtersRow}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by email, name, or role..."
            className={styles.searchInput}
          />
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className={styles.select}
          >
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="analyst">Analyst</option>
            <option value="viewer">Viewer</option>
          </select>
          <select
            value={selectedCityLead === null ? "" : selectedCityLead.toString()}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedCityLead(value === "" ? null : value === "true");
            }}
            className={styles.select}
          >
            <option value="">City Lead (Any)</option>
            <option value="true">City Lead</option>
            <option value="false">Not City Lead</option>
          </select>
          <select
            value={selectedStatus === null ? "" : selectedStatus.toString()}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedStatus(value === "" ? null : value === "true");
            }}
            className={styles.select}
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
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

      {/* Users Table */}
      <div className={styles.tableContainer}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Users List</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead className={styles.tableHead}>
              <tr>
                <th className={styles.tableHeaderCell}>Email</th>
                <th className={styles.tableHeaderCell}>Name</th>
                <th className={styles.tableHeaderCell}>Role</th>
                <th className={styles.tableHeaderCell}>City Lead Cities</th>
                <th className={styles.tableHeaderCell}>Status</th>
                <th className={styles.tableHeaderCell}>Last Login</th>
                <th className={styles.tableHeaderCell}>Created</th>
                <th className={styles.tableHeaderCell}>Actions</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {loading ? (
                <tr>
                  <td colSpan={8} className={styles.tableCell} style={{ textAlign: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                      <Loader size="sm" color="dark" />
                      <span className={styles.loadingText}>Loading users...</span>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className={styles.emptyState}>
                    No users found matching the current filters.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className={styles.tableRow}>
                    <td className={styles.tableCell}>
                      <div className={styles.tableCellText}>{user.email}</div>
                      <div className={styles.tableCellSubtext}>ID: {user.id}</div>
                    </td>
                    <td className={styles.tableCell}>
                      {user.name || <span style={{ color: "var(--text-tertiary)" }}>N/A</span>}
                    </td>
                    <td className={styles.tableCell}>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <span className={`${styles.roleBadge} ${getRoleBadgeClass(user.role)}`}>
                          {user.role}
                        </span>
                        {user.is_city_lead && (
                          <span className={`${styles.roleBadge} ${styles.roleCityLead}`}>
                            City Lead
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={styles.tableCell}>
                      {user.city_lead_city_ids && user.city_lead_city_ids.length > 0 ? (
                        <div className={styles.cityPills}>
                          {user.city_lead_city_ids.slice(0, 3).map((cid) => (
                            <span key={cid} className={styles.cityPill} title={getCityName(cid)}>
                              {getCityName(cid)}
                            </span>
                          ))}
                          {user.city_lead_city_ids.length > 3 && (
                            <span className={styles.cityPillMuted}>
                              +{user.city_lead_city_ids.length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>—</span>
                      )}
                    </td>
                    <td className={styles.tableCell}>
                      <span
                        className={`${styles.statusBadge} ${
                          user.is_active ? styles.statusActive : styles.statusInactive
                        }`}
                      >
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className={styles.tableCell}>{formatDate(user.last_login_at)}</td>
                    <td className={styles.tableCell}>{formatDate(user.created_at)}</td>
                    <td className={styles.tableCell}>
                      <div className={styles.actionButtons}>
                        <button
                          onClick={() => handleEditUser(user)}
                          className={styles.actionBtn}
                          title="Edit User"
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        {user.role !== "admin" && (
                          <button
                            onClick={() => handleMakeAdmin(user.id)}
                            className={styles.actionBtn}
                            title="Make Admin"
                          >
                            <i className="fas fa-user-shield"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <div className={styles.modalOverlay} onClick={handleCloseEdit}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Edit User</h3>
              <button className={styles.modalClose} onClick={handleCloseEdit}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Email</label>
                <input
                  type="email"
                  value={editingUser.email}
                  disabled
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Name</label>
                <input
                  type="text"
                  value={editingUser.name || ""}
                  disabled
                  className={styles.formInput}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Role</label>
                <select
                  value={editForm.role || ""}
                  onChange={(e) =>
                    setEditForm({ ...editForm, role: e.target.value as "admin" | "analyst" | "viewer" })
                  }
                  className={styles.formSelect}
                >
                  <option value="viewer">Viewer</option>
                  <option value="analyst">Analyst</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>City Lead Cities</label>
                {editCityLeadLoading ? (
                  <div className={styles.loadingText}>Loading city lead assignments…</div>
                ) : (
                  <>
                    <div className={styles.cityLeadRow}>
                      <select
                        value={addCityLeadCityId}
                        onChange={(e) =>
                          setAddCityLeadCityId(
                            e.target.value === "" ? "" : Number(e.target.value),
                          )
                        }
                        className={styles.formSelect}
                      >
                        <option value="">Add a city…</option>
                        {cities
                          .filter((c) => !editCityLeadCityIds.includes(c.city_id))
                          .slice(0, 500)
                          .map((c) => (
                            <option key={c.city_id} value={c.city_id}>
                              {formatCityDisplayName(c)}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className={styles.addCityBtn}
                        disabled={addCityLeadCityId === ""}
                        onClick={() => {
                          if (addCityLeadCityId === "") return;
                          const next = Array.from(
                            new Set([...editCityLeadCityIds, Number(addCityLeadCityId)]),
                          ).sort((a, b) => a - b);
                          setEditCityLeadCityIds(next);
                          setEditCityLeadDirty(true);
                          setAddCityLeadCityId("");
                        }}
                      >
                        Add
                      </button>
                    </div>

                    {editCityLeadCityIds.length > 0 ? (
                      <div className={styles.cityPills} style={{ marginTop: "10px" }}>
                        {editCityLeadCityIds.map((cid) => (
                          <span key={cid} className={styles.cityPill}>
                            {getCityName(cid)}
                            <button
                              type="button"
                              className={styles.removeCityBtn}
                              title="Remove"
                              onClick={() => {
                                setEditCityLeadCityIds((prev) =>
                                  prev.filter((x) => x !== cid),
                                );
                                setEditCityLeadDirty(true);
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.helpText}>
                        No city lead cities assigned.
                      </div>
                    )}

                    {editCityLeadCityIds.length > 0 && (
                      <button
                        type="button"
                        className={styles.clearCitiesBtn}
                        onClick={() => {
                          setEditCityLeadCityIds([]);
                          setEditCityLeadDirty(true);
                        }}
                      >
                        Clear all city lead cities
                      </button>
                    )}
                  </>
                )}
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  <input
                    type="checkbox"
                    checked={editForm.is_active ?? true}
                    onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                    className={styles.formCheckbox}
                  />
                  <span style={{ marginLeft: "8px" }}>Active</span>
                </label>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.modalButtonSecondary} onClick={handleCloseEdit}>
                Cancel
              </button>
              <button className={styles.modalButtonPrimary} onClick={handleSaveEdit}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

