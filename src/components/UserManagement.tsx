"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  listUsers,
  updateUser,
  updateUserGovernmentStatus,
  makeUserAdmin,
  getUserStats,
  getDatabaseSize,
  listCities,
  getUserCityLeads,
  setUserCityLeads,
  getUserNewsletterSubscriptions,
  setUserNewsletterSubscriptions,
  listLeadersForClaim,
  adminSetGiftQuota,
  typeaheadAdminUsers,
  type User,
  type UserUpdateRequest,
  type UpdateUserGovernmentStatusRequest,
  type UserStats,
  type CityListItem,
  type DatabaseSizeResponse,
  type NewsletterSubscription,
  type LeaderForClaim,
  type AdminUserTypeaheadItem,
} from "@/lib/apiClient";
import Loader from "./Loader";
import styles from "./UserManagement.module.css";

const PAGE_SIZE = 25;

interface UserManagementProps {
  currentUserId?: number | null;
  onLoginAsUser?: (user: User) => void;
}

export default function UserManagement({
  currentUserId = null,
  onLoginAsUser,
}: UserManagementProps) {
  const { getAccessTokenSilently } = useAuth0();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [dbSize, setDbSize] = useState<DatabaseSizeResponse | null>(null);
  const [dbSizeLoading, setDbSizeLoading] = useState(false);
  const [showDbSize, setShowDbSize] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [cities, setCities] = useState<CityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [suggestions, setSuggestions] = useState<AdminUserTypeaheadItem[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<boolean | null>(null);
  const [selectedCityLead, setSelectedCityLead] = useState<boolean | null>(null);
  const [selectedGovStatus, setSelectedGovStatus] = useState<string>("");
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [selectedUserType, setSelectedUserType] = useState<string>("");

  // Edit modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<UserUpdateRequest>({});
  const [editCityLeadCityIds, setEditCityLeadCityIds] = useState<number[]>([]);
  const [editCityLeadLoading, setEditCityLeadLoading] = useState(false);
  const [editCityLeadDirty, setEditCityLeadDirty] = useState(false);
  const [addCityLeadCityId, setAddCityLeadCityId] = useState<number | "">("");

  // Newsletter subscription state
  const [editNewsletterSubs, setEditNewsletterSubs] = useState<NewsletterSubscription[]>([]);
  const [editNewsletterLoading, setEditNewsletterLoading] = useState(false);
  const [editNewsletterDirty, setEditNewsletterDirty] = useState(false);
  const [addSubCityId, setAddSubCityId] = useState<number | "">("");
  const [addSubCityQuery, setAddSubCityQuery] = useState("");
  const [addSubCityOpen, setAddSubCityOpen] = useState(false);
  const [addSubDistrict, setAddSubDistrict] = useState("0");
  const [addSubFrequency, setAddSubFrequency] = useState<"weekly" | "monthly">("weekly");

  // Gift quota state
  const [editGiftExtraQuota, setEditGiftExtraQuota] = useState(0);
  const [editGiftQuotaDirty, setEditGiftQuotaDirty] = useState(false);

  // Government user state
  const [editGovernmentVerified, setEditGovernmentVerified] = useState(false);
  const [editGovernmentUserType, setEditGovernmentUserType] = useState<"staff" | "elected_official" | "">("");
  const [editGovernmentLeaderId, setEditGovernmentLeaderId] = useState<number | "">("");
  const [editGovernmentLeaderName, setEditGovernmentLeaderName] = useState<string>("");
  const [editGovernmentCityId, setEditGovernmentCityId] = useState<number | "">("");
  const [leadersForElected, setLeadersForElected] = useState<LeaderForClaim[]>([]);
  const [leadersForElectedLoading, setLeadersForElectedLoading] = useState(false);
  const [editGovernmentDirty, setEditGovernmentDirty] = useState(false);

  // Debounce search input → server query + reset to page 1
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Typeahead suggestions while typing
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    let cancelled = false;
    setSuggestionsLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const token = await getAccessTokenSilently();
        const hits = await typeaheadAdminUsers(q, token);
        if (!cancelled) {
          setSuggestions(hits);
          setSuggestionsOpen(true);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSuggestionsLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, getAccessTokenSilently]);

  // Close suggestions on outside click
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!searchWrapRef.current?.contains(e.target as Node)) {
        setSuggestionsOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // Load stats + cities once; users come from loadUsers
  const loadMeta = useCallback(async () => {
    try {
      setError(null);
      const token = await getAccessTokenSilently();
      const [statsData, citiesData] = await Promise.all([
        getUserStats(token),
        listCities(token),
      ]);
      setStats(statsData);
      setCities(citiesData);
    } catch (err) {
      console.error("Error loading user management meta:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    }
  }, [getAccessTokenSilently]);

  // Load database size data
  const loadDatabaseSize = useCallback(async () => {
    try {
      setDbSizeLoading(true);
      const token = await getAccessTokenSilently();
      const sizeData = await getDatabaseSize(token);
      setDbSize(sizeData);
    } catch (err) {
      console.error("Error loading database size:", err);
    } finally {
      setDbSizeLoading(false);
    }
  }, [getAccessTokenSilently]);

  // Load users with server-side filters + pagination
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessTokenSilently();

      const result = await listUsers(token, {
        page,
        page_size: PAGE_SIZE,
        role: selectedRole || undefined,
        is_active: selectedStatus !== null ? selectedStatus : undefined,
        is_city_lead: selectedCityLead !== null ? selectedCityLead : undefined,
        source: selectedSource || undefined,
        user_role_type: selectedUserType || undefined,
        government_status: selectedGovStatus || undefined,
        q: debouncedSearch || undefined,
      });

      setUsers(result.items);
      setTotalUsers(result.total);
      setTotalPages(result.pages);
    } catch (err) {
      console.error("Error loading users:", err);
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [
    getAccessTokenSilently,
    page,
    selectedRole,
    selectedStatus,
    selectedCityLead,
    selectedGovStatus,
    selectedSource,
    selectedUserType,
    debouncedSearch,
  ]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleSelectSuggestion = (item: AdminUserTypeaheadItem) => {
    setSearchQuery(item.email);
    setDebouncedSearch(item.email);
    setPage(1);
    setSuggestionsOpen(false);
    setSuggestions([]);
  };

  const handleRefresh = () => {
    void loadMeta();
    void loadUsers();
  };

  const setFilterAndResetPage = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setPage(1);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setEditForm({
      role: user.role as "admin" | "analyst" | "viewer",
      is_active: user.is_active,
      custom_email_prompt: user.custom_email_prompt ?? null,
    });
    setEditCityLeadCityIds(user.city_lead_city_ids || []);
    setEditCityLeadDirty(false);
    setAddCityLeadCityId("");
    setEditNewsletterSubs([]);
    setEditNewsletterDirty(false);
    setAddSubCityId("");
    setAddSubCityQuery("");
    setAddSubCityOpen(false);
    setAddSubDistrict("0");
    setAddSubFrequency("weekly");
    setEditGovernmentVerified(!!user.government_verified);
    setEditGovernmentUserType(
      user.government_user_type === "staff" || user.government_user_type === "elected_official"
        ? user.government_user_type
        : ""
    );
    setEditGovernmentLeaderId(user.government_leader_id ?? "");
    setEditGovernmentLeaderName(user.government_leader_name ?? "");
    setEditGovernmentCityId(user.government_city_id ?? "");
    setLeadersForElected([]);
    setEditGovernmentDirty(false);
    // Gift quota: extra = total quota − base 2
    setEditGiftExtraQuota(Math.max(0, (user.gift_quota ?? 2) - 2));
    setEditGiftQuotaDirty(false);
  };

  const handleCloseEdit = () => {
    setEditingUser(null);
    setEditForm({});
    setEditCityLeadCityIds([]);
    setEditCityLeadDirty(false);
    setEditCityLeadLoading(false);
    setAddCityLeadCityId("");
    setEditNewsletterSubs([]);
    setEditNewsletterDirty(false);
    setEditNewsletterLoading(false);
    setAddSubCityId("");
    setAddSubCityQuery("");
    setAddSubCityOpen(false);
    setAddSubDistrict("0");
    setAddSubFrequency("weekly");
    setEditGovernmentVerified(false);
    setEditGovernmentUserType("");
    setEditGovernmentLeaderId("");
    setEditGovernmentLeaderName("");
    setEditGovernmentCityId("");
    setLeadersForElected([]);
    setEditGovernmentDirty(false);
    setEditGiftExtraQuota(0);
    setEditGiftQuotaDirty(false);
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

  // Load newsletter subscriptions when modal opens
  useEffect(() => {
    const loadNewsletterSubs = async () => {
      if (!editingUser) return;
      try {
        setEditNewsletterLoading(true);
        const token = await getAccessTokenSilently();
        const res = await getUserNewsletterSubscriptions(editingUser.id, token);
        setEditNewsletterSubs(res.subscriptions || []);
        setEditNewsletterDirty(false);
      } catch (err) {
        console.warn("Failed to load newsletter subscriptions:", err);
      } finally {
        setEditNewsletterLoading(false);
      }
    };
    loadNewsletterSubs();
  }, [editingUser, getAccessTokenSilently]);

  // Load leaders for elected-official city (listLeadersForClaim is public, no token)
  useEffect(() => {
    if (editGovernmentCityId === "" || typeof editGovernmentCityId !== "number") {
      setLeadersForElected([]);
      return;
    }
    let cancelled = false;
    setLeadersForElectedLoading(true);
    listLeadersForClaim(editGovernmentCityId)
      .then((list) => {
        if (!cancelled) setLeadersForElected(list);
      })
      .catch(() => {
        if (!cancelled) setLeadersForElected([]);
      })
      .finally(() => {
        if (!cancelled) setLeadersForElectedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editGovernmentCityId]);

  const handleSaveEdit = async () => {
    if (!editingUser) return;

    try {
      setError(null);
      const token = await getAccessTokenSilently();
      await updateUser(editingUser.id, editForm, token);

      if (editCityLeadDirty) {
        await setUserCityLeads(editingUser.id, editCityLeadCityIds, token);
      }

      if (editNewsletterDirty) {
        await setUserNewsletterSubscriptions(editingUser.id, editNewsletterSubs, token);
      }

      if (editGiftQuotaDirty) {
        await adminSetGiftQuota(editingUser.id, editGiftExtraQuota, token);
      }

      if (editGovernmentDirty) {
        const govPayload: UpdateUserGovernmentStatusRequest = {
          government_verified: editGovernmentVerified,
          government_email: editingUser.email,
        };
        if (editGovernmentVerified) {
          govPayload.government_user_type =
            editGovernmentUserType === "staff" || editGovernmentUserType === "elected_official"
              ? editGovernmentUserType
              : "staff";
          if (editGovernmentUserType === "elected_official" && editGovernmentLeaderId !== "") {
            govPayload.government_leader_id = Number(editGovernmentLeaderId);
          }
        }
        await updateUserGovernmentStatus(editingUser.id, govPayload, token);
      }

      await loadUsers();
      await loadMeta(); // Refresh stats
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
      await loadMeta(); // Refresh stats
    } catch (err) {
      console.error("Error making user admin:", err);
      setError(err instanceof Error ? err.message : "Failed to make user admin");
    }
  };

  const handleLoginAsUser = (user: User) => {
    if (!onLoginAsUser) {
      return;
    }

    const confirmed = confirm(
      `Start a proxy session as ${user.email}? Your admin session will stay available until you end the proxy.`,
    );
    if (!confirmed) {
      return;
    }

    onLoginAsUser(user);
  };

  const formatSubLabel = (sub: NewsletterSubscription): string => {
    const city = getCityName(sub.city_id);
    const dist = sub.district === "0" || !sub.district ? "Citywide" : `District ${sub.district}`;
    return `${city} — ${dist} (${sub.frequency})`;
  };

  const subKey = (sub: NewsletterSubscription): string =>
    `${sub.city_id}:${sub.district || "0"}:${sub.frequency}`;

  const formatCityDisplayName = (city: CityListItem): string => {
    if (!city || typeof city !== "object") return "";
    const name = city.city_name ?? "";
    const parts = [name];
    if (city.state) parts.push(city.state);
    if (city.country) parts.push(city.country);
    return parts.filter(Boolean).join(", ");
  };

  const safeCities = Array.isArray(cities) ? cities : [];
  const filteredSubCities = safeCities.filter((c) => {
    if (!addSubCityQuery.trim()) return true;
    const q = String(addSubCityQuery).toLowerCase();
    return formatCityDisplayName(c).toLowerCase().includes(q);
  }).slice(0, 50);

  const handleSelectSubCity = (city: CityListItem) => {
    setAddSubCityId(city.city_id);
    setAddSubCityQuery(formatCityDisplayName(city));
    setAddSubCityOpen(false);
  };

  const handleAddSubscription = () => {
    if (addSubCityId === "") return;
    const newSub: NewsletterSubscription = {
      city_id: Number(addSubCityId),
      district: addSubDistrict,
      frequency: addSubFrequency,
    };
    const key = subKey(newSub);
    if (editNewsletterSubs.some((s) => subKey(s) === key)) return;
    setEditNewsletterSubs((prev) =>
      [...prev, newSub].sort(
        (a, b) => a.city_id - b.city_id || a.district.localeCompare(b.district) || a.frequency.localeCompare(b.frequency)
      )
    );
    setEditNewsletterDirty(true);
    setAddSubCityId("");
    setAddSubCityQuery("");
    setAddSubCityOpen(false);
    setAddSubDistrict("0");
    setAddSubFrequency("weekly");
  };

  const handleRemoveSubscription = (sub: NewsletterSubscription) => {
    const key = subKey(sub);
    setEditNewsletterSubs((prev) => prev.filter((s) => subKey(s) !== key));
    setEditNewsletterDirty(true);
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

  const cityNameById = useCallback(() => {
    const map = new Map<number, string>();
    for (const c of safeCities) {
      map.set(c.city_id, formatCityDisplayName(c));
    }
    return map;
  }, [safeCities]);

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

        {/* Database Size Card */}
        <div className={styles.statCard} style={{ gridColumn: "span 2" }}>
          <div className={styles.statCardContent}>
            <div className={styles.statCardInner} style={{ justifyContent: "space-between", width: "100%", flexWrap: "wrap", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1 }}>
                <div className={styles.statIcon}>
                  <i
                    className="fas fa-database"
                    style={{ fontSize: "32px", color: "var(--brand-primary)" }}
                  ></i>
                </div>
                <div className={styles.statText} style={{ flex: 1 }}>
                  <div className={styles.statLabel}>Database Size</div>
                  <div className={styles.statValue}>
                    {dbSize?.total_size_with_indexes ?? stats?.database_size ?? "—"}
                  </div>
                  {dbSize && (
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                      Data: {dbSize.total_database_size} • Indexes: {dbSize.indexes_size}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  if (!showDbSize && !dbSize) {
                    loadDatabaseSize();
                  }
                  setShowDbSize(!showDbSize);
                }}
                className={styles.refreshBtn}
                style={{ marginLeft: "auto" }}
              >
                <i className={`fas fa-${showDbSize ? "chevron-up" : "chevron-down"}`} style={{ marginRight: "4px" }}></i>
                {showDbSize ? " Hide Details" : " Show Details"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Database Size Details */}
      {showDbSize && (
        <div style={{ marginTop: "24px", marginBottom: "24px" }}>
          <div className={styles.tableContainer}>
            <div className={styles.tableHeader}>
              <h3 className={styles.tableTitle}>Database Size by Table</h3>
              <button
                onClick={loadDatabaseSize}
                className={styles.refreshBtn}
                disabled={dbSizeLoading}
              >
                <i 
                  className="fas fa-sync-alt" 
                  style={{ 
                    animation: dbSizeLoading ? "spin 1s linear infinite" : "none",
                    display: "inline-block"
                  }}
                ></i>
                Refresh
              </button>
            </div>
            {dbSizeLoading && !dbSize ? (
              <div style={{ padding: "24px", textAlign: "center" }}>
                <Loader size="sm" color="dark" />
                <span className={styles.loadingText} style={{ marginLeft: "8px" }}>Loading database size...</span>
              </div>
            ) : dbSize ? (
              <>
                {dbSize.note && (
                  <div style={{ 
                    padding: "12px 16px", 
                    marginBottom: "16px", 
                    backgroundColor: "var(--bg-secondary)", 
                    borderRadius: "var(--radius-sm)",
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                    borderLeft: "3px solid var(--brand-primary)"
                  }}>
                    <i className="fas fa-info-circle" style={{ marginRight: "8px" }}></i>
                    {dbSize.note}
                  </div>
                )}
                <div style={{ marginBottom: "16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                  <div style={{ padding: "12px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Data Size</div>
                    <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                      {dbSize.total_database_size}
                    </div>
                  </div>
                  <div style={{ padding: "12px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Indexes Size</div>
                    <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>
                      {dbSize.indexes_size}
                    </div>
                  </div>
                  <div style={{ padding: "12px", backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>Total (Data + Indexes)</div>
                    <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--brand-primary)" }}>
                      {dbSize.total_size_with_indexes}
                    </div>
                  </div>
                </div>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead className={styles.tableHead}>
                      <tr>
                        <th className={styles.tableHeaderCell}>Table</th>
                        <th className={styles.tableHeaderCell}>Size</th>
                        <th className={styles.tableHeaderCell}>Rows</th>
                        <th className={styles.tableHeaderCell}>Inactive Rows</th>
                      </tr>
                    </thead>
                    <tbody className={styles.tableBody}>
                      {dbSize.tables.map((table) => (
                        <tr key={table.table_name} className={styles.tableRow}>
                          <td className={styles.tableCell}>
                            <code style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                              {table.table_name}
                            </code>
                          </td>
                          <td className={styles.tableCell}>
                            <strong>{table.size}</strong>
                          </td>
                          <td className={styles.tableCell}>
                            {table.row_count.toLocaleString()}
                          </td>
                          <td className={styles.tableCell}>
                            {table.inactive_rows > 0 ? (
                              <span style={{ color: "var(--warning)" }}>
                                {table.inactive_rows.toLocaleString()}
                              </span>
                            ) : (
                              <span style={{ color: "var(--text-tertiary)" }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr className={styles.tableRow} style={{ backgroundColor: "var(--bg-secondary)", fontWeight: 600 }}>
                        <td className={styles.tableCell}>
                          <strong>Total</strong>
                        </td>
                        <td className={styles.tableCell}>
                          <strong>{dbSize.total_size_with_indexes}</strong>
                        </td>
                        <td className={styles.tableCell}>
                          {dbSize.tables.reduce((sum, t) => sum + t.row_count, 0).toLocaleString()}
                        </td>
                        <td className={styles.tableCell}>
                          {dbSize.tables.reduce((sum, t) => sum + t.inactive_rows, 0).toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ padding: "12px", fontSize: "12px", color: "var(--text-tertiary)", textAlign: "right" }}>
                    Last updated: {new Date(dbSize.timestamp).toLocaleString()}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--text-secondary)" }}>
                Click "Show Details" to load database size information
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div className={styles.filtersContainer}>
        <div className={styles.filtersRow}>
          <div
            className={styles.autocompleteWrapper}
            ref={searchWrapRef}
            style={{ flex: 1, minWidth: 256 }}
          >
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSuggestionsOpen(true);
              }}
              onFocus={() => {
                if (suggestions.length > 0 || suggestionsLoading) {
                  setSuggestionsOpen(true);
                }
              }}
              placeholder="Search by email or name…"
              className={styles.searchInput}
              style={{ width: "100%", minWidth: 0 }}
              aria-autocomplete="list"
              aria-expanded={suggestionsOpen}
            />
            {suggestionsOpen &&
              searchQuery.trim().length >= 2 &&
              (suggestionsLoading || suggestions.length > 0) && (
                <ul className={styles.autocompleteDropdown} role="listbox">
                  {suggestionsLoading && suggestions.length === 0 && (
                    <li className={styles.autocompleteOption} style={{ opacity: 0.7 }}>
                      Searching…
                    </li>
                  )}
                  {suggestions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={styles.autocompleteOption}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                        }}
                        onClick={() => handleSelectSuggestion(s)}
                      >
                        <div style={{ fontWeight: 600 }}>
                          {s.full_name?.trim() || s.email}
                        </div>
                        {s.full_name?.trim() ? (
                          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                            {s.email}
                          </div>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </div>
          <select
            value={selectedRole}
            onChange={(e) => setFilterAndResetPage(setSelectedRole, e.target.value)}
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
              setFilterAndResetPage(
                setSelectedCityLead,
                value === "" ? null : value === "true"
              );
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
              setFilterAndResetPage(
                setSelectedStatus,
                value === "" ? null : value === "true"
              );
            }}
            className={styles.select}
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
          <select
            value={selectedGovStatus}
            onChange={(e) => setFilterAndResetPage(setSelectedGovStatus, e.target.value)}
            className={styles.select}
          >
            <option value="">Gov (Any)</option>
            <option value="pending">Pending Verification</option>
            <option value="verified">Verified</option>
            <option value="not_gov">Not Government</option>
          </select>
          <select
            value={selectedSource}
            onChange={(e) => setFilterAndResetPage(setSelectedSource, e.target.value)}
            className={styles.select}
          >
            <option value="">Source (Any)</option>
            <option value="substack_import">Substack import</option>
            <option value="gift">Gift</option>
            <option value="auth0">Organic signup</option>
            <option value="manual">Manual</option>
          </select>
          <select
            value={selectedUserType}
            onChange={(e) => setFilterAndResetPage(setSelectedUserType, e.target.value)}
            className={styles.select}
          >
            <option value="">Type (Any)</option>
            <option value="citizen">Citizen</option>
            <option value="official">Official</option>
            <option value="prospect">Prospect</option>
          </select>
          <button onClick={handleRefresh} className={styles.refreshBtn}>
            <i className="fas fa-sync-alt"></i> Refresh
          </button>
        </div>
        <div
          className={styles.filtersRow}
          style={{ fontSize: 13, color: "var(--text-secondary)", paddingTop: 8 }}
        >
          {loading
            ? "Loading…"
            : `${totalUsers.toLocaleString()} user${totalUsers !== 1 ? "s" : ""} matching filters`}
          {selectedSource === "substack_import" && !loading ? (
            <span>
              {" "}
              · page {page} of {totalPages}
            </span>
          ) : null}
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
          <span className={styles.tableCount}>
            Page {page} of {totalPages}
          </span>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead className={styles.tableHead}>
              <tr>
                <th className={styles.tableHeaderCell}>Email</th>
                <th className={styles.tableHeaderCell}>Name</th>
                <th className={styles.tableHeaderCell}>Role</th>
                <th className={styles.tableHeaderCell}>Government</th>
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
                  <td colSpan={9} className={styles.tableCell} style={{ textAlign: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                      <Loader size="sm" color="dark" />
                      <span className={styles.loadingText}>Loading users...</span>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={9} className={styles.emptyState}>
                    No users found matching the current filters.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className={styles.tableRow}>
                    <td className={styles.tableCell}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className={styles.tableCellText}>{user.email}</span>
                        {user.is_gift_recipient && (
                          <span
                            className={styles.roleBadge}
                            style={{
                              background: "rgba(173, 53, 250, 0.1)",
                              color: "var(--brand-primary)",
                              cursor: "default",
                              position: "relative",
                            }}
                            title={
                              user.gift_info
                                ? [
                                    `Gifted by: ${user.gift_info.from_name || user.gift_info.from_email || "unknown"}`,
                                    `Location: ${user.gift_info.place_label || "—"}`,
                                    `Sent: ${user.gift_info.sent_at ? new Date(user.gift_info.sent_at).toLocaleDateString() : "—"}`,
                                    `Clicked: ${user.gift_info.clicked_at ? new Date(user.gift_info.clicked_at).toLocaleDateString() : "Not yet opened"}`,
                                  ].join("\n")
                                : "Gift subscription"
                            }
                          >
                            🎁 Gift
                          </span>
                        )}
                        {user.source === "substack_import" && (
                          <span
                            className={styles.roleBadge}
                            style={{
                              background: user.is_claimed
                                ? "rgba(5, 150, 105, 0.1)"
                                : "rgba(217, 119, 6, 0.12)",
                              color: user.is_claimed ? "#059669" : "#d97706",
                              cursor: "default",
                            }}
                            title={
                              user.is_claimed
                                ? "Imported from Substack — account claimed"
                                : "Imported from Substack — not claimed yet"
                            }
                          >
                            Substack {user.is_claimed ? "✓" : "· unclaimed"}
                          </span>
                        )}
                        {user.source === "government_prospect" && (
                          <span
                            className={styles.roleBadge}
                            style={{
                              background: user.is_claimed
                                ? "rgba(5, 150, 105, 0.1)"
                                : "rgba(59, 130, 246, 0.1)",
                              color: user.is_claimed ? "#059669" : "#2563eb",
                              cursor: "default",
                            }}
                            title={[
                              user.government_user_type === "elected_official"
                                ? "Elected official"
                                : "City staff",
                              user.government_leader_name
                                ? `Office: ${user.government_leader_name}`
                                : null,
                              user.government_district != null
                                ? `District ${user.government_district}`
                                : null,
                              user.is_claimed
                                ? "Account claimed"
                                : "Unclaimed — welcome email pending",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          >
                            G{user.government_user_type === "elected_official" ? " · Official" : " · Staff"}{user.is_claimed ? " ✓" : ""}
                          </span>
                        )}
                      </div>
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
                        {user.user_role_type === "prospect" && (
                          <span
                            className={styles.roleBadge}
                            style={{
                              background: "var(--bg-secondary)",
                              color: "var(--text-secondary)",
                            }}
                            title="Imported lead — has not signed in yet"
                          >
                            Prospect
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={styles.tableCell}>
                      {!user.government_verified && user.government_pending_verification ? (
                        <span className={styles.roleBadge} style={{ background: "var(--warning-bg, #fef3c7)", color: "var(--warning, #d97706)" }}>
                          Pending
                        </span>
                      ) : !user.government_verified ? (
                        <span style={{ color: "var(--text-tertiary)" }}>—</span>
                      ) : user.government_user_type === "elected_official" && user.government_leader_name ? (
                        <span className={styles.roleBadge} style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }} title={`Elected: ${user.government_leader_name}${user.government_district != null ? ` District ${user.government_district}` : ""}`}>
                          Elected: {user.government_leader_name}
                          {user.government_district != null ? ` (D${user.government_district})` : ""}
                        </span>
                      ) : (
                        <span className={styles.roleBadge} style={{ background: "var(--bg-secondary)", color: "var(--text-primary)" }}>
                          Staff
                        </span>
                      )}
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
                        {onLoginAsUser && user.id !== currentUserId && (
                          <button
                            onClick={() => handleLoginAsUser(user)}
                            className={styles.actionBtn}
                            title="Log in as this user"
                          >
                            <i className="fas fa-sign-in-alt"></i>
                          </button>
                        )}
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
        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.paginationBtn}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            ← Prev
          </button>
          <span className={styles.paginationInfo}>
            {totalUsers === 0
              ? "No results"
              : `${((page - 1) * PAGE_SIZE + 1).toLocaleString()}–${Math.min(page * PAGE_SIZE, totalUsers).toLocaleString()} of ${totalUsers.toLocaleString()}`}
          </span>
          <button
            type="button"
            className={styles.paginationBtn}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
          >
            Next →
          </button>
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
                        {safeCities
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
                <label className={styles.formLabel}>Newsletter Subscriptions</label>
                {editNewsletterLoading ? (
                  <div className={styles.loadingText}>Loading subscriptions…</div>
                ) : (
                  <>
                    <div className={styles.newsletterAddRow}>
                      <div className={styles.autocompleteWrapper} style={{ flex: 2 }}>
                        <input
                          type="text"
                          value={addSubCityQuery}
                          onChange={(e) => {
                            setAddSubCityQuery(e.target.value);
                            setAddSubCityId("");
                            setAddSubCityOpen(true);
                          }}
                          onFocus={() => setAddSubCityOpen(true)}
                          onBlur={() => {
                            // Delay so click on option registers first
                            setTimeout(() => setAddSubCityOpen(false), 200);
                          }}
                          placeholder="Search city…"
                          className={styles.formInput}
                          autoComplete="off"
                        />
                        {addSubCityOpen && filteredSubCities.length > 0 && (
                          <ul className={styles.autocompleteDropdown}>
                            {filteredSubCities.map((c) => (
                              <li
                                key={c.city_id}
                                className={styles.autocompleteOption}
                                onMouseDown={() => handleSelectSubCity(c)}
                              >
                                {formatCityDisplayName(c)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <input
                        type="text"
                        value={addSubDistrict}
                        onChange={(e) => setAddSubDistrict(e.target.value)}
                        placeholder="District"
                        className={styles.formInput}
                        style={{ flex: 1, minWidth: "70px" }}
                        title={'0 = citywide, or a district number'}
                      />
                      <select
                        value={addSubFrequency}
                        onChange={(e) => setAddSubFrequency(e.target.value as "weekly" | "monthly")}
                        className={styles.formSelect}
                        style={{ flex: 1 }}
                      >
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                      <button
                        type="button"
                        className={styles.addCityBtn}
                        disabled={addSubCityId === ""}
                        onClick={handleAddSubscription}
                      >
                        Add
                      </button>
                    </div>

                    {editNewsletterSubs.length > 0 ? (
                      <div className={styles.newsletterSubsList}>
                        {editNewsletterSubs.map((sub) => (
                          <span key={subKey(sub)} className={styles.newsletterSubPill}>
                            <span className={styles.newsletterSubLabel}>
                              {formatSubLabel(sub)}
                            </span>
                            <button
                              type="button"
                              className={styles.removeCityBtn}
                              title="Remove subscription"
                              onClick={() => handleRemoveSubscription(sub)}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.helpText}>No newsletter subscriptions.</div>
                    )}

                    {editNewsletterSubs.length > 0 && (
                      <button
                        type="button"
                        className={styles.clearCitiesBtn}
                        onClick={() => {
                          setEditNewsletterSubs([]);
                          setEditNewsletterDirty(true);
                        }}
                      >
                        Clear all subscriptions
                      </button>
                    )}
                  </>
                    )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Custom email prompt</label>
                <p className={styles.helpText} style={{ marginBottom: 6 }}>
                  Optional instructions for this user&apos;s newsletter/email content (e.g. focus on housing, keep it brief).
                </p>
                <textarea
                  value={editForm.custom_email_prompt ?? ""}
                  onChange={(e) =>
                    setEditForm({ ...editForm, custom_email_prompt: e.target.value || null })
                  }
                  className={styles.formInput}
                  rows={4}
                  placeholder="e.g. Focus on housing and permits. Keep to 2–3 sentences."
                  style={{ resize: "vertical", minHeight: 80 }}
                />
              </div>

              {/* Gift subscription slots — only relevant for non-gift-recipients */}
              {!editingUser.is_gift_recipient && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Gift subscription slots</label>
                  <p className={styles.helpText} style={{ marginBottom: 8 }}>
                    Default quota is 2. Grant extra slots so this user can send additional gift trials.
                    {editingUser.gifts_sent_count !== undefined && (
                      <> Currently <strong>{editingUser.gifts_sent_count}</strong> sent of <strong>{editingUser.gift_quota ?? 2}</strong> total.</>
                    )}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <label className={styles.formLabel} style={{ margin: 0, minWidth: 100 }}>
                      Extra slots
                    </label>
                    <button
                      type="button"
                      className={styles.addCityBtn}
                      onClick={() => {
                        if (editGiftExtraQuota > 0) {
                          setEditGiftExtraQuota(editGiftExtraQuota - 1);
                          setEditGiftQuotaDirty(true);
                        }
                      }}
                      disabled={editGiftExtraQuota <= 0}
                      style={{ width: 32, minWidth: 32, padding: "0 8px" }}
                    >
                      −
                    </button>
                    <span style={{ fontSize: 16, fontWeight: 700, minWidth: 24, textAlign: "center" }}>
                      {editGiftExtraQuota}
                    </span>
                    <button
                      type="button"
                      className={styles.addCityBtn}
                      onClick={() => {
                        setEditGiftExtraQuota(editGiftExtraQuota + 1);
                        setEditGiftQuotaDirty(true);
                      }}
                      disabled={editGiftExtraQuota >= 18}
                      style={{ width: 32, minWidth: 32, padding: "0 8px" }}
                    >
                      +
                    </button>
                    <span className={styles.helpText} style={{ margin: 0 }}>
                      = {2 + editGiftExtraQuota} total slots
                    </span>
                  </div>
                </div>
              )}

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Government user</label>
                <p className={styles.helpText} style={{ marginBottom: 8 }}>
                  Staff: government user without a district. Elected official: mapped to a district (higher verification).
                </p>
                <select
                  value={
                    !editGovernmentVerified
                      ? "none"
                      : editGovernmentUserType === "elected_official"
                        ? "elected_official"
                        : "staff"
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditGovernmentDirty(true);
                    if (v === "none") {
                      setEditGovernmentVerified(false);
                      setEditGovernmentUserType("");
                      setEditGovernmentLeaderId("");
                      setEditGovernmentLeaderName("");
                      setEditGovernmentCityId("");
                    } else {
                      setEditGovernmentVerified(true);
                      setEditGovernmentUserType(v as "staff" | "elected_official");
                      if (v === "staff") {
                        setEditGovernmentLeaderId("");
                        setEditGovernmentLeaderName("");
                        setEditGovernmentCityId("");
                      }
                    }
                  }}
                  className={styles.formSelect}
                >
                  <option value="none">Not a government user</option>
                  <option value="staff">Government staff</option>
                  <option value="elected_official">Elected official (mapped to district)</option>
                </select>
                {editGovernmentUserType === "elected_official" && (
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <select
                        value={editGovernmentCityId}
                        onChange={(e) => {
                          const num = e.target.value === "" ? "" : Number(e.target.value);
                          setEditGovernmentCityId(num);
                          setEditGovernmentLeaderId("");
                          setEditGovernmentLeaderName("");
                          setEditGovernmentDirty(true);
                        }}
                        className={styles.formSelect}
                        style={{ minWidth: 180 }}
                      >
                        <option value="">Select city…</option>
                        {safeCities.slice(0, 500).map((c) => (
                          <option key={c.city_id} value={c.city_id}>
                            {formatCityDisplayName(c)}
                          </option>
                        ))}
                      </select>
                      <select
                        value={editGovernmentLeaderId}
                        onChange={(e) => {
                          const id = e.target.value === "" ? "" : Number(e.target.value);
                          setEditGovernmentLeaderId(id);
                          const leader = leadersForElected.find((l) => l.id === id);
                          setEditGovernmentLeaderName(leader ? `${leader.name} – ${leader.title}` : "");
                          setEditGovernmentDirty(true);
                        }}
                        disabled={leadersForElectedLoading || !editGovernmentCityId}
                        className={styles.formSelect}
                        style={{ minWidth: 220 }}
                      >
                        <option value="">
                          {leadersForElectedLoading ? "Loading…" : "Select official…"}
                        </option>
                        {leadersForElected.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name} – {l.title}
                            {l.district != null ? ` (District ${l.district})` : " (at-large)"}
                          </option>
                        ))}
                      </select>
                    </div>
                    {editGovernmentLeaderName && (
                      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        Selected: {editGovernmentLeaderName}
                      </div>
                    )}
                  </div>
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

