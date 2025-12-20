"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import TitleBar from "@/components/TitleBar";
import Sidebar from "@/components/Sidebar";
import ChatView from "@/components/ChatView";
import CityDataAdmin from "@/components/CityDataAdmin";
import CityDataTable from "@/components/CityDataTable";
import CityView from "@/components/CityView";
import DatasetsAdmin from "@/components/DatasetsAdmin";
import MetricsAdmin from "@/components/MetricsAdmin";
import UserManagement from "@/components/UserManagement";
import JobLogsViewer from "@/components/JobLogsViewer";
import { useTheme } from "@/contexts/ThemeContext";
import { getMyPermissions, getSavedCities } from "@/lib/apiClient";
import Loader from "@/components/Loader";
import styles from "./page.module.css";

type ViewType = "chat" | "city-data" | "system-stats" | "user-management" | "metrics-admin" | "datasets-admin" | "city" | "metric" | "job-logs";

// Mobile breakpoint (matches CSS media query)
const MOBILE_BREAKPOINT = 768;

// Helper function to check if screen is narrow (mobile)
const isNarrowScreen = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= MOBILE_BREAKPOINT;
};

export default function DashboardPage() {
  const { isAuthenticated, isLoading, user, getAccessTokenSilently } =
    useAuth0();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [isAdmin, setIsAdmin] = useState(false);
  const [cityLeadCityIds, setCityLeadCityIds] = useState<number[]>([]);
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  // Initialize sidebar state - always start with false to match server render
  // Will be updated on client mount based on screen size
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>("chat");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [activeCityId, setActiveCityId] = useState<number | null>(null);
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const hasAutoSelectedCity = useRef(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/");
    }
  }, [isLoading, isAuthenticated, router]);

  // Set initial sidebar state based on screen size after mount
  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") return;
    
    // Set initial state based on screen width
    const isNarrow = isNarrowScreen();
    setSidebarOpen(!isNarrow);
  }, []);

  // Handle window resize to update sidebar state for mobile/desktop
  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") return;

    const handleResize = () => {
      const isNarrow = isNarrowScreen();
      setSidebarOpen((prev) => {
        // When transitioning to narrow screen, close sidebar if it's open
        if (isNarrow && prev) {
          return false;
        }
        // When transitioning to wide screen, keep current state (don't force open)
        return prev;
      });
    };

    // Add resize listener
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!isAuthenticated || !user) {
        setIsCheckingAdmin(false);
        return;
      }

      try {
        const token = await getAccessTokenSilently();
        const permissions = await getMyPermissions(token);
        setIsAdmin(permissions.is_admin || false);
        setCityLeadCityIds(permissions.city_lead_city_ids || []);
        console.log("Admin status checked:", { isAdmin: permissions.is_admin, role: permissions.role });
        setIsCheckingAdmin(false);
      } catch (error) {
        console.error("Error checking admin status:", error);
        // On error, default to false (non-admin)
        setIsAdmin(false);
        setCityLeadCityIds([]);
        setIsCheckingAdmin(false);
      }
    };

    if (isAuthenticated) {
      checkAdminStatus();
    }
  }, [isAuthenticated, user, getAccessTokenSilently]);

  // Auto-select first city from MyCities on initial load (default to map view)
  useEffect(() => {
    const autoSelectFirstCity = async () => {
      // Only run once, when authenticated and no city is currently active
      if (
        !isAuthenticated ||
        isLoading ||
        activeCityId !== null ||
        hasAutoSelectedCity.current
      ) {
        return;
      }

      try {
        const token = await getAccessTokenSilently();
        const savedCities = await getSavedCities(token);
        
        // If user has saved cities and no city is active, select the first one
        if (savedCities.length > 0 && activeCityId === null) {
          const firstCityId = savedCities[0].id;
          setActiveCityId(firstCityId);
          setCurrentView("city"); // Default to map view
          hasAutoSelectedCity.current = true;
          console.log("Auto-selected first city from MyCities:", firstCityId);
        }
      } catch (error) {
        console.error("Error auto-selecting first city:", error);
        // Don't mark as attempted if there was an error, so we can retry
      }
    };

    if (isAuthenticated && !isLoading) {
      autoSelectFirstCity();
    }
  }, [isAuthenticated, isLoading, activeCityId, getAccessTokenSilently]);

  const handleMenuToggle = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleNewChat = () => {
    setCurrentView("chat");
    setCurrentSessionId(null); // Reset to new chat
  };

  const handleSessionClick = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setCurrentView("chat");
  };

  const handleSessionDeleted = (sessionId: string) => {
    // If the deleted session was the current one, clear it
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
    }
  };

  const handleSearchCities = () => {
    // City search is now handled by the CityTypeahead component in the Sidebar
    // This function is kept for backward compatibility but is no longer needed
  };

  const handleViewChange = (view: string) => {
    const nextView = view as ViewType;
    setCurrentView(nextView);
    // Reset selected city when switching away from city-data view
    if (nextView !== "city-data") {
      setSelectedCityId(null);
    }
    // Reset active city when switching away from city view
    if (nextView !== "city") {
      setActiveCityId(null);
      setGpsLocation(null); // Clear GPS location when leaving city view
    }
    // Don't close sidebar when navigating - only close on hamburger click
  };

  const handleCityClick = (cityId: number) => {
    setActiveCityId(cityId);
    setCurrentView("city");
    // Clear GPS location when city is selected via sidebar
    setGpsLocation(null);
  };

  const handleOpenSettings = () => {
    handleViewChange("system-stats");
  };

  if (isLoading || isCheckingAdmin) {
    return (
      <div className={styles.dashboardLoading} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
        <Loader size="sm" color="dark" />
        <span>Loading...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className={`${styles.dashboardLayout} ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
      <TitleBar
        onMenuToggle={handleMenuToggle}
        isAdmin={isAdmin}
        onCitySelect={(cityId) => {
          setActiveCityId(cityId);
          setCurrentView("city");
          // Clear GPS location when city is selected normally (not via GPS)
          setGpsLocation(null);
          // Close sidebar on narrow screens to show the map immediately.
          if (isNarrowScreen()) {
            setSidebarOpen(false);
          }
        }}
        onGPSLocation={(location) => {
          setGpsLocation(location);
        }}
      />
      
      <Sidebar
        isOpen={sidebarOpen}
        isAdmin={isAdmin}
        onNewChat={handleNewChat}
        onSearchCities={handleSearchCities}
        onOpenSettings={handleOpenSettings}
        onViewChange={handleViewChange}
        onSessionClick={handleSessionClick}
        currentSessionId={currentSessionId}
        onSessionDeleted={handleSessionDeleted}
        onClose={() => setSidebarOpen(false)}
        onCityClick={handleCityClick}
        activeCityId={activeCityId}
      />

      <main className={`${styles.mainContent} ${sidebarOpen ? "" : styles.mainContentCollapsed}`} id="main-content">
        <div className={styles.viewsContainer}>
          {currentView === "chat" && (
            <div className={`${styles.contentView} ${styles.contentViewActive}`}>
              <ChatView
                sessionId={currentSessionId}
                onSessionChange={setCurrentSessionId}
              />
            </div>
          )}
          
          {/* Admin Views */}
          {currentView === "city-data" && (
            <div id="city-data-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              {selectedCityId ? (
                <div className={styles.adminContainer}>
                  <CityDataAdmin cityId={selectedCityId} onBack={() => setSelectedCityId(null)} />
                </div>
              ) : (
                <CityDataTable
                  onOpenCity={(cityId) => handleCityClick(cityId)}
                />
              )}
            </div>
          )}

          {currentView === "system-stats" && (
            <div id="system-stats-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <h2>Settings & System Statistics</h2>
                <div style={{ marginTop: "16px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 0",
                      borderBottom: "1px solid var(--border-primary)",
                      gap: "16px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          marginBottom: "4px",
                        }}
                      >
                        Dark mode
                      </div>
                      <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                        Use a dark color theme across the UI.
                      </div>
                    </div>
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "10px",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={theme === "dark"}
                        onChange={(e) => setTheme(e.target.checked ? "dark" : "light")}
                        aria-label="Toggle dark mode"
                      />
                      <span style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                        {theme === "dark" ? "On" : "Off"}
                      </span>
                    </label>
                  </div>

                  <div style={{ paddingTop: "16px", color: "var(--text-secondary)" }}>
                    System statistics coming soon...
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentView === "user-management" && (
            <div id="user-management-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <UserManagement />
              </div>
            </div>
          )}

          {currentView === "metrics-admin" && (
            <div id="metrics-admin-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <h2 style={{ margin: "0 0 24px 0", padding: 0, color: "var(--text-primary)", fontSize: "24px" }}>
                  Metrics Administration
                </h2>
                {isAdmin ? (
                  <MetricsAdmin />
                ) : (
                  <p style={{ color: "var(--text-secondary)" }}>
                    You don&apos;t have access to metrics administration.
                  </p>
                )}
              </div>
            </div>
          )}

          {currentView === "datasets-admin" && (
            <div id="datasets-admin-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <h2 style={{ margin: "0 0 24px 0", padding: 0, color: "var(--text-primary)", fontSize: "24px" }}>
                  Datasets Administration
                </h2>
                <DatasetsAdmin />
              </div>
            </div>
          )}

          {currentView === "city" && activeCityId && (
            <div id="city-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={`${styles.adminContainer} ${styles.cityViewContainer}`}>
                <CityView
                  cityId={activeCityId}
                  isAdmin={isAdmin || cityLeadCityIds.includes(activeCityId)}
                  gpsLocation={gpsLocation}
                />
              </div>
            </div>
          )}

          {currentView === "metric" && (
            <div id="metric-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <h2>Metric View</h2>
                <p>Metric view coming soon...</p>
              </div>
            </div>
          )}

          {currentView === "job-logs" && isAdmin && (
            <div id="job-logs-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <JobLogsViewer />
              </div>
            </div>
          )}
        </div>
      </main>

    </div>
  );
}
