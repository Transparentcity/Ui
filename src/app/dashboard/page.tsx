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
import ResearchView from "@/components/ResearchView";
import DatasetsAdmin from "@/components/DatasetsAdmin";
import MetricsAdmin from "@/components/MetricsAdmin";
import UserManagement from "@/components/UserManagement";
import JobLogsViewer from "@/components/JobLogsViewer";
import { useTheme } from "@/contexts/ThemeContext";
import { getMyPermissions, getSavedCities, getUserPreferences, updateUserPreferences, getCity } from "@/lib/apiClient";
import Loader from "@/components/Loader";
import WelcomeModal from "@/components/WelcomeModal";
import styles from "./page.module.css";
import dynamic from "next/dynamic";

// Dynamically import NewResearchPage to avoid SSR issues
const NewResearchPage = dynamic(() => import("../research/new/page"), { ssr: false });

type ViewType = "chat" | "city-data" | "system-stats" | "user-management" | "metrics-admin" | "datasets-admin" | "city" | "metric" | "job-logs" | "research" | "research-new";

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
  const [isCurrentSessionJobSession, setIsCurrentSessionJobSession] = useState(false);
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [activeCityId, setActiveCityId] = useState<number | null>(null);
  const [initialDistrict, setInitialDistrict] = useState<number | null>(null);
  const [currentResearchId, setCurrentResearchId] = useState<number | null>(null);
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const hasAutoSelectedCity = useRef(false);
  const hasCheckedOnboarding = useRef(false);
  const [userPreferences, setUserPreferences] = useState<any>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [homeCity, setHomeCity] = useState<any>(null);
  const [loadingPreferences, setLoadingPreferences] = useState(false);

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

  // Check if user needs onboarding (first-time user check)
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      // Only run once after auth is ready
      if (
        !isAuthenticated ||
        isLoading ||
        isCheckingAdmin ||
        hasCheckedOnboarding.current
      ) {
        return;
      }

      hasCheckedOnboarding.current = true;

      try {
        const token = await getAccessTokenSilently();
        
        // Check if user has completed onboarding
        const prefs = await getUserPreferences(token);
        
        if (!prefs.has_completed_onboarding) {
          // Also check if they have any saved cities - if so, skip onboarding
          const savedCities = await getSavedCities(token);
          
          if (savedCities.length === 0) {
            // First time user - show welcome modal
            setShowWelcomeModal(true);
          }
        }
      } catch (error) {
        // On error, silently skip onboarding check
        console.error("Error checking onboarding status:", error);
      }
    };

    if (isAuthenticated && !isLoading && !isCheckingAdmin) {
      checkOnboardingStatus();
    }
  }, [isAuthenticated, isLoading, isCheckingAdmin, getAccessTokenSilently]);

  // Listen for research creation from embedded research-new view
  useEffect(() => {
    const handleResearchCreated = (e: CustomEvent) => {
      const reportId = e.detail as number;
      console.log("📊 Research created in dashboard, switching to view:", reportId);
      setCurrentResearchId(reportId);
      setCurrentView("research");
    };

    if (typeof window !== "undefined") {
      window.addEventListener("research:created", handleResearchCreated as EventListener);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("research:created", handleResearchCreated as EventListener);
      }
    };
  }, []);

  // Allow other views (e.g., Research) to open a Job Session for review.
  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<{ session_id: string }>;
      const sessionId = customEvent.detail?.session_id;
      if (!sessionId) return;
      setCurrentSessionId(sessionId);
      setIsCurrentSessionJobSession(true); // Mark as job session
      setCurrentView("chat");
      setActiveCityId(null);
      setCurrentResearchId(null);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("job-session:open", handler);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("job-session:open", handler);
      }
    };
  }, []);

  // Auto-select city from saved home location or first city from MyCities on initial load
  useEffect(() => {
    const autoSelectCity = async () => {
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
        
        // Check for saved home location first
        const prefs = await getUserPreferences(token);
        const homeLocation = prefs.extra?.home_location;
        
        if (homeLocation?.city_id) {
          // Check if the home city is in saved cities
          const savedCities = await getSavedCities(token);
          const homeCity = savedCities.find((c) => c.id === homeLocation.city_id);
          
          if (homeCity) {
            // Use home location city, district, and GPS coordinates
            setActiveCityId(homeLocation.city_id);
            setInitialDistrict(homeLocation.district ?? null);
            if (homeLocation.coordinates) {
              setGpsLocation(homeLocation.coordinates);
            }
            setCurrentView("city");
            hasAutoSelectedCity.current = true;
            console.log("Auto-selected home city:", homeLocation.city_id, "district:", homeLocation.district);
            return;
          }
        }
        
        // Fallback to first saved city if no home location
        const savedCities = await getSavedCities(token);
        if (savedCities.length > 0 && activeCityId === null) {
          const firstCityId = savedCities[0].id;
          setActiveCityId(firstCityId);
          setCurrentView("city"); // Default to map view
          hasAutoSelectedCity.current = true;
          console.log("Auto-selected first city from MyCities:", firstCityId);
        }
      } catch (error) {
        console.error("Error auto-selecting city:", error);
        // Don't mark as attempted if there was an error, so we can retry
      }
    };

    if (isAuthenticated && !isLoading) {
      autoSelectCity();
    }
  }, [isAuthenticated, isLoading, activeCityId, getAccessTokenSilently]);

  const handleMenuToggle = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleNewChat = () => {
    setCurrentView("chat");
    setCurrentSessionId(null); // Reset to new chat
    setIsCurrentSessionJobSession(false); // Clear job session flag
    setActiveCityId(null); // Clear city selection when starting new chat
    setCurrentResearchId(null); // Clear research when starting new chat
  };

  const handleSessionClick = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setIsCurrentSessionJobSession(false); // Regular chat session, not a job session
    setCurrentView("chat");
    setActiveCityId(null); // Clear city selection when selecting a chat session
    setCurrentResearchId(null); // Clear research when selecting a chat session
  };

  const handleJobSessionClick = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setIsCurrentSessionJobSession(true); // This is a job session
    setCurrentView("chat");
    setActiveCityId(null); // Clear city selection when selecting a job session
    setCurrentResearchId(null); // Clear research when selecting a job session
  };

  const handleSessionDeleted = (sessionId: string) => {
    // If the deleted session was the current one, clear it
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
      setIsCurrentSessionJobSession(false);
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
      setInitialDistrict(null); // Clear initial district when leaving city view
      setGpsLocation(null); // Clear GPS location when leaving city view
    }
    // Don't close sidebar when navigating - only close on hamburger click
  };

  const handleCityClick = (cityId: number) => {
    setActiveCityId(cityId);
    setInitialDistrict(null); // Clear initial district when manually selecting
    setCurrentView("city");
    setCurrentSessionId(null); // Clear chat session when selecting a city
    setIsCurrentSessionJobSession(false);
    setCurrentResearchId(null); // Clear research when selecting a city
    // Clear GPS location when city is selected via sidebar
    setGpsLocation(null);
  };

  const handleOpenSettings = async () => {
    handleViewChange("system-stats");
    // Load user preferences and info when opening settings
    await loadUserSettings();
  };

  const loadUserSettings = async () => {
    try {
      setLoadingPreferences(true);
      const token = await getAccessTokenSilently();
      
      // Fetch preferences
      const prefs = await getUserPreferences(token);
      setUserPreferences(prefs);
      
      // Fetch user email from permissions
      try {
        const permissions = await getMyPermissions(token);
        setUserEmail(permissions.email || user?.email || null);
      } catch (err) {
        console.error("Error fetching user email:", err);
        setUserEmail(user?.email || null);
      }
      
      // Fetch home city if we have a home location
      if (prefs.extra?.home_location?.city_id) {
        try {
          const city = await getCity(prefs.extra.home_location.city_id, token);
          setHomeCity(city);
        } catch (err) {
          console.error("Error fetching home city:", err);
        }
      }
    } catch (error) {
      console.error("Error loading user settings:", error);
    } finally {
      setLoadingPreferences(false);
    }
  };

  const handleWelcomeCitySelected = (cityId: number, district?: number | null) => {
    setActiveCityId(cityId);
    setInitialDistrict(district ?? null);
    setCurrentView("city");
    setCurrentSessionId(null);
    setCurrentResearchId(null);
    hasAutoSelectedCity.current = true;
  };

  const handleWelcomeComplete = () => {
    setShowWelcomeModal(false);
  };

  const handleResetOnboarding = async () => {
    if (!confirm("This will reset your onboarding experience. The welcome screen will appear immediately. Continue?")) {
      return;
    }

    try {
      const token = await getAccessTokenSilently();
      await updateUserPreferences({ has_completed_onboarding: false }, token);
      
      // Reset the ref so it can check again if needed
      hasCheckedOnboarding.current = false;
      
      // Check if user has saved cities - if they do, still show the modal (for testing/reset purposes)
      const savedCities = await getSavedCities(token);
      
      // Show the modal immediately after reset
      setShowWelcomeModal(true);
    } catch (error) {
      console.error("Error resetting onboarding:", error);
      alert("Failed to reset onboarding. Please try again.");
    }
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
      />
      
      <Sidebar
        isOpen={sidebarOpen}
        isAdmin={isAdmin}
        cityLeadCityIds={cityLeadCityIds}
        onNewChat={handleNewChat}
        onSearchCities={handleSearchCities}
        onOpenSettings={handleOpenSettings}
        onViewChange={handleViewChange}
        onSessionClick={handleSessionClick}
        onJobSessionClick={handleJobSessionClick}
        currentSessionId={currentSessionId}
        isCurrentSessionJobSession={isCurrentSessionJobSession}
        onSessionDeleted={handleSessionDeleted}
        onClose={() => setSidebarOpen(false)}
        onCityClick={handleCityClick}
        activeCityId={activeCityId}
        onResearchClick={(reportId) => {
          setCurrentResearchId(reportId);
          setCurrentView("research");
          setCurrentSessionId(null);
          setIsCurrentSessionJobSession(false);
          setActiveCityId(null);
        }}
        currentResearchId={currentResearchId}
        onResearchDeleted={(reportId) => {
          if (currentResearchId === reportId) {
            setCurrentResearchId(null);
          }
        }}
        onCitySelect={(cityId) => {
          setActiveCityId(cityId);
          setInitialDistrict(null); // Clear initial district when manually selecting
          setCurrentView("city");
          setCurrentSessionId(null); // Clear chat session when selecting a city
          setIsCurrentSessionJobSession(false);
          // Preserve GPS location - it will only be cleared when user manually
          // selects a city from the sidebar list (via handleCityClick)
        }}
        onGPSLocation={(location) => {
          // Set or clear GPS location
          // If location is null, clear GPS (remove marker and zoom out)
          // Otherwise, set GPS location for map zooming
          setGpsLocation(location);
        }}
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

                  {currentView === "research" && currentResearchId && (
            <div className={`${styles.contentView} ${styles.contentViewActive}`}>
                      <ResearchView reportId={currentResearchId} isAdmin={isAdmin} />
            </div>
          )}

          {currentView === "research-new" && (
            <div className={`${styles.contentView} ${styles.contentViewActive}`}>
              <NewResearchPage />
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
                <h2>Settings</h2>
                {loadingPreferences ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "16px" }}>
                    <Loader size="sm" color="dark" />
                    <span style={{ color: "var(--text-secondary)" }}>Loading preferences...</span>
                  </div>
                ) : (
                  <div style={{ marginTop: "16px" }}>
                    {/* User Information Section */}
                    <div style={{ marginBottom: "32px" }}>
                      <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "16px" }}>
                        Account Information
                      </h3>
                      
                      {userEmail && (
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
                              Email
                            </div>
                            <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                              {userEmail}
                            </div>
                          </div>
                        </div>
                      )}

                      {userPreferences?.extra?.home_location && (
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
                              Home Location
                            </div>
                            <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                              {homeCity ? (
                                <>
                                  {homeCity.emoji && <span style={{ marginRight: "6px" }}>{homeCity.emoji}</span>}
                                  {homeCity.display_name || homeCity.name}
                                  {userPreferences.extra.home_location.district !== null && userPreferences.extra.home_location.district !== undefined && (
                                    <span> • District {userPreferences.extra.home_location.district}</span>
                                  )}
                                </>
                              ) : (
                                `City ID: ${userPreferences.extra.home_location.city_id}${
                                  userPreferences.extra.home_location.district !== null && userPreferences.extra.home_location.district !== undefined
                                    ? ` • District ${userPreferences.extra.home_location.district}`
                                    : ""
                                }`
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Communication Preferences Section */}
                    {userPreferences?.extra?.communication_preferences && (
                      <div style={{ marginBottom: "32px" }}>
                        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "16px" }}>
                          Communication Preferences
                        </h3>
                        
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
                              Anomaly Alerts
                            </div>
                            <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                              Get notified when significant changes are detected
                            </div>
                          </div>
                          <span style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                            {userPreferences.extra.communication_preferences.anomaly_alerts ? "Enabled" : "Disabled"}
                          </span>
                        </div>

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
                              Weekly Digest
                            </div>
                            <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                              Summary of key metrics and changes
                            </div>
                          </div>
                          <span style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                            {userPreferences.extra.communication_preferences.weekly_digest ? "Enabled" : "Disabled"}
                          </span>
                        </div>

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
                              Monthly Report
                            </div>
                            <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                              Comprehensive analysis of city performance
                              {userPreferences.extra.communication_preferences.monthly_report && userPreferences.extra.communication_preferences.report_scope && (
                                <span> • {userPreferences.extra.communication_preferences.report_scope === "district" ? "For my district" : "For the whole city"}</span>
                              )}
                            </div>
                          </div>
                          <span style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                            {userPreferences.extra.communication_preferences.monthly_report ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Category Interests Section */}
                    {userPreferences?.extra?.category_interests && userPreferences.extra.category_interests.length > 0 && (
                      <div style={{ marginBottom: "32px" }}>
                        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "16px" }}>
                          Category Interests
                        </h3>
                        <div style={{ padding: "12px 0", borderBottom: "1px solid var(--border-primary)" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            {userPreferences.extra.category_interests.map((category: string, index: number) => (
                              <span
                                key={index}
                                style={{
                                  padding: "6px 12px",
                                  fontSize: "13px",
                                  background: "var(--bg-secondary)",
                                  border: "1px solid var(--border-primary)",
                                  borderRadius: "16px",
                                  color: "var(--text-primary)",
                                }}
                              >
                                {category}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Learning Focus Section */}
                    {userPreferences?.extra?.learning_focus && (
                      <div style={{ marginBottom: "32px" }}>
                        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "16px" }}>
                          Learning Focus
                        </h3>
                        <div style={{ padding: "12px 0", borderBottom: "1px solid var(--border-primary)" }}>
                          <div style={{ color: "var(--text-secondary)", fontSize: "13px", lineHeight: "1.5" }}>
                            {userPreferences.extra.learning_focus}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Display Preferences Section */}
                    <div style={{ marginBottom: "32px" }}>
                      <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "16px" }}>
                        Display Preferences
                      </h3>
                      
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
                    </div>

                    {/* Onboarding Section */}
                    <div style={{ marginBottom: "32px" }}>
                      <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "16px" }}>
                        Onboarding
                      </h3>
                      
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
                            Reset onboarding
                          </div>
                          <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                            Show the welcome screen again on your next visit.
                          </div>
                        </div>
                        <button
                          onClick={handleResetOnboarding}
                          style={{
                            padding: "8px 16px",
                            fontSize: "14px",
                            fontWeight: 500,
                            color: "var(--text-primary)",
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border-primary)",
                            borderRadius: "6px",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "var(--bg-tertiary)";
                            e.currentTarget.style.borderColor = "var(--border-secondary)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "var(--bg-secondary)";
                            e.currentTarget.style.borderColor = "var(--border-primary)";
                          }}
                        >
                          Reset
                        </button>
                      </div>
                    </div>

                    {/* System Statistics Section */}
                    <div style={{ marginTop: "32px", paddingTop: "16px", borderTop: "1px solid var(--border-primary)" }}>
                      <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "16px" }}>
                        System Statistics
                      </h3>
                      <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                        System statistics coming soon...
                      </div>
                    </div>
                  </div>
                )}
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
                  initialDistrict={initialDistrict}
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

      {/* Welcome Modal for first-time users */}
      <WelcomeModal
        isOpen={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
        onCitySelected={handleWelcomeCitySelected}
        onComplete={handleWelcomeComplete}
      />
    </div>
  );
}
