"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
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
import { getMyPermissions } from "@/lib/apiClient";
import "./dashboard.css";

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
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  // Initialize sidebar as closed on narrow screens (mobile)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    // Only check window width on client side
    if (typeof window !== "undefined") {
      return !isNarrowScreen();
    }
    // Default to open on server (will be updated on mount)
    return true;
  });
  const [currentView, setCurrentView] = useState<ViewType>("chat");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [activeCityId, setActiveCityId] = useState<number | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/");
    }
  }, [isLoading, isAuthenticated, router]);

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
        console.log("Admin status checked:", { isAdmin: permissions.is_admin, role: permissions.role });
        setIsCheckingAdmin(false);
      } catch (error) {
        console.error("Error checking admin status:", error);
        // On error, default to false (non-admin)
        setIsAdmin(false);
        setIsCheckingAdmin(false);
      }
    };

    if (isAuthenticated) {
      checkAdminStatus();
    }
  }, [isAuthenticated, user, getAccessTokenSilently]);

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
    }
    // Don't close sidebar when navigating - only close on hamburger click
  };

  const handleCityClick = (cityId: number) => {
    setActiveCityId(cityId);
    setCurrentView("city");
  };

  const handleOpenSettings = () => {
    handleViewChange("system-stats");
  };

  if (isLoading || isCheckingAdmin) {
    return (
      <div className="dashboard-loading">
        <div className="loader">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className={`dashboard-layout ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
      <TitleBar onMenuToggle={handleMenuToggle} isAdmin={isAdmin} />
      
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

      <main className="main-content" id="main-content">
        <div className="views-container">
          {currentView === "chat" && (
            <div className="content-view active">
              <ChatView
                sessionId={currentSessionId}
                onSessionChange={setCurrentSessionId}
              />
            </div>
          )}
          
          {/* Admin Views */}
          {currentView === "city-data" && (
            <div id="city-data-view" className="content-view active">
              {selectedCityId ? (
                <div className="admin-container">
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
            <div id="system-stats-view" className="content-view active">
              <div className="admin-container">
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
            <div id="user-management-view" className="content-view active">
              <div className="admin-container">
                <UserManagement />
              </div>
            </div>
          )}

          {currentView === "metrics-admin" && (
            <div id="metrics-admin-view" className="content-view active">
              <div className="admin-container">
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
            <div id="datasets-admin-view" className="content-view active">
              <div className="admin-container">
                <h2 style={{ margin: "0 0 24px 0", padding: 0, color: "var(--text-primary)", fontSize: "24px" }}>
                  Datasets Administration
                </h2>
                <DatasetsAdmin />
              </div>
            </div>
          )}

          {currentView === "city" && activeCityId && (
            <div id="city-view" className="content-view active">
              <div className="admin-container">
                <CityView
                  cityId={activeCityId}
                  isAdmin={isAdmin}
                />
              </div>
            </div>
          )}

          {currentView === "metric" && (
            <div id="metric-view" className="content-view active">
              <div className="admin-container">
                <h2>Metric View</h2>
                <p>Metric view coming soon...</p>
              </div>
            </div>
          )}

          {currentView === "job-logs" && isAdmin && (
            <div id="job-logs-view" className="content-view active">
              <div className="admin-container">
                <JobLogsViewer />
              </div>
            </div>
          )}
        </div>
      </main>

    </div>
  );
}
