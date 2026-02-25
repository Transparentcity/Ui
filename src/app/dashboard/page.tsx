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
import ClaimsAdmin from "@/components/ClaimsAdmin";
import JobLogsViewer from "@/components/JobLogsViewer";
import FeedStoriesAdmin from "@/components/FeedStoriesAdmin";
import FeedView from "@/components/FeedView";
import { useTheme } from "@/contexts/ThemeContext";
import {
  getMyPermissions,
  getSavedCities,
  getUserPreferences,
  updateUserPreferences,
  getCity,
  saveUserMetricOrdering,
  recordSignupIntent,
  getGovernmentVerificationStatus,
  updateGovernmentVerification,
  type ClaimContext,
  type GovernmentVerificationStatus,
} from "@/lib/apiClient";
import { PENDING_ORDER_STORAGE_KEY_PREFIX } from "@/components/MetricOrderEditor";
import Loader from "@/components/Loader";
import WelcomeModal from "@/components/WelcomeModal";
import GovernmentOnboardingModal from "@/components/GovernmentOnboardingModal";
import RedisStatusIndicator from "@/components/RedisStatusIndicator";
import {
  trackSignupComplete,
  trackLogin,
  trackOnboardingComplete,
  trackDashboardView,
  trackUserActivation,
  trackCitySaved,
} from "@/lib/analytics";
import styles from "./page.module.css";
import dynamic from "next/dynamic";

// Dynamically import NewResearchPage to avoid SSR issues
const NewResearchPage = dynamic(() => import("../research/new/page"), { ssr: false });

type ViewType = "chat" | "city-data" | "system-stats" | "user-management" | "claims-admin" | "metrics-admin" | "datasets-admin" | "feed-stories-admin" | "city" | "metric" | "job-logs" | "research" | "research-new" | "feed";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentView, setCurrentView] = useState<ViewType>("feed");
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isCurrentSessionJobSession, setIsCurrentSessionJobSession] = useState(false);
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [activeCityId, setActiveCityId] = useState<number | null>(null);
  const [initialDistrict, setInitialDistrict] = useState<number | null>(null);
  const [currentResearchId, setCurrentResearchId] = useState<number | null>(null);
  const [initialChatPrompt, setInitialChatPrompt] = useState<string | null>(null);
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showGovernmentOnboardingModal, setShowGovernmentOnboardingModal] = useState(false);
  const [governmentClaimContext, setGovernmentClaimContext] = useState<ClaimContext | null>(null);
  const hasAutoSelectedCity = useRef(false);
  const hasCheckedOnboarding = useRef(false);
  const [userPreferences, setUserPreferences] = useState<any>(null);
  const [govVerificationStatus, setGovVerificationStatus] = useState<GovernmentVerificationStatus | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [homeCity, setHomeCity] = useState<any>(null);
  const [loadingPreferences, setLoadingPreferences] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [govModeToggling, setGovModeToggling] = useState(false);
  
  // Editable preference state
  const [editableAnomalyAlerts, setEditableAnomalyAlerts] = useState(false);
  const [editableWeeklyDigest, setEditableWeeklyDigest] = useState(false);
  const [editableMonthlyReport, setEditableMonthlyReport] = useState(false);
  const [editableReportScope, setEditableReportScope] = useState<"district" | "city">("district");
  const [editableCategories, setEditableCategories] = useState<string[]>([]);
  const [editableLearningFocus, setEditableLearningFocus] = useState("");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/");
    }
  }, [isLoading, isAuthenticated, router]);

  // Accept one-time prefilled prompts (e.g. from Waste "Ask Seymour" button)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("prefill") || params.get("prompt");
    if (!prefill) return;

    setCurrentView("chat");
    setCurrentSessionId(null);
    setIsCurrentSessionJobSession(false);
    setActiveCityId(null);
    setCurrentResearchId(null);
    setInitialChatPrompt(prefill);

    // Clean URL so refresh/back doesn't resend the same prompt.
    params.delete("prefill");
    params.delete("prompt");
    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    router.replace(nextUrl);
  }, [router]);

  // Track dashboard view when authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      trackDashboardView();
    }
  }, [isAuthenticated, isLoading]);

  // Load government verification status for sidebar logo (and keep in sync when settings load it)
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    let cancelled = false;
    getAccessTokenSilently()
      .then((token) => getGovernmentVerificationStatus(token))
      .then((status) => {
        if (!cancelled) setGovVerificationStatus(status);
      })
      .catch(() => {
        if (!cancelled) setGovVerificationStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, getAccessTokenSilently]);

  // Track signup completion and login
  useEffect(() => {
    if (!isAuthenticated || isLoading || !user) return;

    // Check if this is a signup completion (from URL params)
    const urlParams = new URLSearchParams(window.location.search);
    const signupIntent = urlParams.get("signup") as "resident" | "public-servant" | null;
    
    if (signupIntent) {
      // User just completed signup: show feed view by default
      trackSignupComplete(signupIntent, user.sub);
      trackUserActivation("signup_complete");
      setCurrentView("feed");
      // Clean up URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    } else {
      // Regular login: default to feed for all users
      trackLogin(user.sub);
      setCurrentView("feed");
    }
  }, [isAuthenticated, isLoading, user]);

  // Migrate pending metric order from localStorage to user account when user signs in
  useEffect(() => {
    if (!isAuthenticated || isLoading || typeof window === "undefined") return;

    const migratePendingMetricOrder = async () => {
      const prefix = PENDING_ORDER_STORAGE_KEY_PREFIX;
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key?.startsWith(prefix)) continue;
        try {
          const raw = window.localStorage.getItem(key);
          if (!raw) continue;
          const parsed = JSON.parse(raw) as { city_id: number; orderings: Array<{ category_name: string; category_order: number; subcategory_name?: string | null; metric_id: number; metric_order: number }> };
          if (parsed?.city_id == null || !Array.isArray(parsed.orderings)) continue;
          const token = await getAccessTokenSilently();
          await saveUserMetricOrdering(parsed.city_id, parsed.orderings, token);
          keysToRemove.push(key);
        } catch {
          // Skip this key on error
        }
      }
      keysToRemove.forEach((k) => window.localStorage.removeItem(k));
    };

    migratePendingMetricOrder();
  }, [isAuthenticated, isLoading]);

  // Reload preferences when settings view becomes active
  useEffect(() => {
    if (currentView === "system-stats" && isAuthenticated && !isLoading && !loadingPreferences) {
      loadUserSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView, isAuthenticated, isLoading]);

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
        const prefs = await getUserPreferences(token);

        if (!prefs.has_completed_onboarding) {
          const savedCities = await getSavedCities(token);
          if (savedCities.length === 0) {
            const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
            const signup = urlParams?.get("signup");
            const cityIdParam = urlParams?.get("city_id");
            const districtParam = urlParams?.get("district");
            const preferredType = prefs.extra?.preferred_onboarding_type as string | undefined;
            const isGovernmentFlow =
              signup === "government" ||
              signup === "public-servant" ||
              preferredType === "government";

            if (isGovernmentFlow) {
              // Persist signup intent and claim context for this user
              const claimContextPayload =
                cityIdParam != null &&
                districtParam != null &&
                Number.isFinite(Number(cityIdParam)) &&
                Number.isFinite(Number(districtParam))
                  ? {
                      city_id: parseInt(cityIdParam, 10),
                      district: parseInt(districtParam, 10),
                    }
                  : undefined;
              try {
                await recordSignupIntent(
                  {
                    source: signup === "government" ? "claim_profile" : "public-servant",
                    claim_context: claimContextPayload,
                  },
                  token
                );
              } catch {
                // Non-blocking
              }
              // Prefer claim context from server if already stored, else from URL
              let claimContext: ClaimContext | null = claimContextPayload ?? null;
              try {
                const govStatus = await getGovernmentVerificationStatus(token);
                if (govStatus.claim_context && (govStatus.claim_context.city_id != null || govStatus.claim_context.leader_id != null)) {
                  claimContext = govStatus.claim_context;
                }
              } catch {
                // Use URL-derived context
              }
              if (!claimContext && claimContextPayload) {
                claimContext = claimContextPayload;
              }
              setGovernmentClaimContext(
                preferredType === "government" && !signup ? null : claimContext
              );
              setShowGovernmentOnboardingModal(true);
            } else {
              setShowWelcomeModal(true);
            }
          }
        }
      } catch (error) {
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

  // Redirect away from research and research-new unless admin or government mode
  const canAccessResearch = isAdmin || !!govVerificationStatus?.government_verified;
  useEffect(() => {
    if (!isCheckingAdmin && !canAccessResearch && (currentView === "research" || currentView === "research-new")) {
      setCurrentView("chat");
      setCurrentResearchId(null);
    }
  }, [isCheckingAdmin, canAccessResearch, currentView]);

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

  // Do not auto-select a city on landing. Only Feed is selected; user picks a city from My Cities when they want.

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
    setSettingsOpen(true);
    // Load user preferences and info when opening settings
    await loadUserSettings();
  };

  const loadUserSettings = async () => {
    try {
      setLoadingPreferences(true);
      const token = await getAccessTokenSilently();
      
      // Fetch preferences
      const prefs = await getUserPreferences(token);
      console.log("Loaded preferences in loadUserSettings:", JSON.stringify(prefs, null, 2));
      setUserPreferences(prefs);
      
      // Initialize editable state from preferences
      const commPrefs = prefs.extra?.communication_preferences || {};
      console.log("Communication preferences from loaded prefs:", commPrefs);
      console.log("Category interests from loaded prefs:", prefs.extra?.category_interests);
      console.log("Learning focus from loaded prefs:", prefs.extra?.learning_focus);
      
      setEditableAnomalyAlerts(commPrefs.anomaly_alerts ?? false);
      setEditableWeeklyDigest(commPrefs.weekly_digest ?? false);
      setEditableMonthlyReport(commPrefs.monthly_report ?? false);
      setEditableReportScope(commPrefs.report_scope || "district");
      setEditableCategories(prefs.extra?.category_interests || []);
      setEditableLearningFocus(prefs.extra?.learning_focus || "");
      
      console.log("Initialized editable state:", {
        anomalyAlerts: commPrefs.anomaly_alerts ?? false,
        weeklyDigest: commPrefs.weekly_digest ?? false,
        monthlyReport: commPrefs.monthly_report ?? false,
        reportScope: commPrefs.report_scope || "district",
        categories: prefs.extra?.category_interests || [],
        learningFocus: prefs.extra?.learning_focus || "",
      });
      
      // Fetch government verification status (for Settings government mode section)
      try {
        const govStatus = await getGovernmentVerificationStatus(token);
        setGovVerificationStatus(govStatus);
      } catch {
        setGovVerificationStatus(null);
      }

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

  const handleSavePreferences = async () => {
    try {
      setSavingPreferences(true);
      const token = await getAccessTokenSilently();
      
      // Get current preferences to preserve other data
      // First, reload from server to ensure we have the latest state
      const latestPrefs = await getUserPreferences(token);
      const currentExtra = latestPrefs.extra || {};
      
      console.log("Current extra before update:", JSON.stringify(currentExtra, null, 2));
      
      // Build updated extra object, preserving ALL existing data
      // The backend merges extra fields at the top level of preferences,
      // so we need to include all existing extra fields plus our updates
      const updatedExtra = {
        ...currentExtra, // Preserve all existing extra fields (saved_cities, home_location, etc.)
        communication_preferences: {
          ...(currentExtra.communication_preferences || {}), // Preserve existing comm prefs
          anomaly_alerts: editableAnomalyAlerts,
          weekly_digest: editableWeeklyDigest,
          monthly_report: editableMonthlyReport,
          report_scope: editableMonthlyReport ? editableReportScope : null,
        },
        category_interests: editableCategories,
        learning_focus: editableLearningFocus || null,
      };
      
      console.log("Updated extra to send:", JSON.stringify(updatedExtra, null, 2));
      
      // Build update request with only the fields the API expects
      const updateRequest: any = {
        extra: updatedExtra,
      };
      
      // Preserve has_completed_onboarding and theme if they exist
      if (latestPrefs.has_completed_onboarding !== undefined) {
        updateRequest.has_completed_onboarding = latestPrefs.has_completed_onboarding;
      }
      if (latestPrefs.theme !== undefined) {
        updateRequest.theme = latestPrefs.theme;
      }
      
      // Save preferences
      console.log("Saving preferences with request:", JSON.stringify(updateRequest, null, 2));
      const saved = await updateUserPreferences(updateRequest, token);
      console.log("Saved preferences response:", JSON.stringify(saved, null, 2));
      
      // Reload preferences from server to ensure we have the latest data
      const refreshed = await getUserPreferences(token);
      console.log("Refreshed preferences:", JSON.stringify(refreshed, null, 2));
      
      // Update local state with refreshed preferences
      setUserPreferences(refreshed);
      
      // Re-initialize editable state from refreshed preferences to ensure sync
      const commPrefs = refreshed.extra?.communication_preferences || {};
      console.log("Setting editable state from refreshed prefs:", {
        commPrefs,
        category_interests: refreshed.extra?.category_interests,
        learning_focus: refreshed.extra?.learning_focus,
      });
      
      setEditableAnomalyAlerts(commPrefs.anomaly_alerts ?? false);
      setEditableWeeklyDigest(commPrefs.weekly_digest ?? false);
      setEditableMonthlyReport(commPrefs.monthly_report ?? false);
      setEditableReportScope(commPrefs.report_scope || "district");
      setEditableCategories(refreshed.extra?.category_interests || []);
      setEditableLearningFocus(refreshed.extra?.learning_focus || "");
      
      console.log("Editable state after save:", {
        anomalyAlerts: commPrefs.anomaly_alerts ?? false,
        weeklyDigest: commPrefs.weekly_digest ?? false,
        monthlyReport: commPrefs.monthly_report ?? false,
        reportScope: commPrefs.report_scope || "district",
        categories: refreshed.extra?.category_interests || [],
        learningFocus: refreshed.extra?.learning_focus || "",
      });
      
      // Update home city if it exists
      if (refreshed.extra?.home_location?.city_id) {
        try {
          const city = await getCity(refreshed.extra.home_location.city_id, token);
          setHomeCity(city);
        } catch (err) {
          console.error("Error fetching home city after save:", err);
        }
      }
      
      // Show success message (you could add a toast notification here)
      alert("Preferences saved successfully!");
    } catch (error) {
      console.error("Error saving preferences:", error);
      alert("Failed to save preferences. Please try again.");
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleWelcomeCitySelected = (cityId: number, district?: number | null) => {
    setActiveCityId(cityId);
    // If district is provided, set it; otherwise keep null (will default to citywide/0 in CityView)
    setInitialDistrict(district !== undefined && district !== null ? district : null);
    setCurrentView("city");
    setCurrentSessionId(null);
    setCurrentResearchId(null);
    hasAutoSelectedCity.current = true;
  };

  const handleWelcomeComplete = () => {
    setShowWelcomeModal(false);
    if (user?.sub) {
      trackOnboardingComplete(user.sub);
      trackUserActivation("onboarding_complete");
    }
  };

  const handleGovernmentOnboardingComplete = () => {
    setShowGovernmentOnboardingModal(false);
    setGovernmentClaimContext(null);
    if (user?.sub) {
      trackOnboardingComplete(user.sub);
      trackUserActivation("onboarding_complete");
    }
    const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    if (urlParams?.get("signup")) {
      const p = new URLSearchParams(window.location.search);
      p.delete("signup");
      p.delete("city_id");
      p.delete("district");
      const next = p.toString() ? `${window.location.pathname}?${p}` : window.location.pathname;
      window.history.replaceState({}, "", next);
    }
  };

  const buttonStyle = {
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 500,
    color: "var(--button-secondary-text)",
    background: "var(--bg-secondary)",
    border: "1px solid var(--border-primary)",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.15s ease",
  };
  const buttonHover = (e: React.MouseEvent<HTMLButtonElement>, over: boolean) => {
    e.currentTarget.style.background = over ? "var(--bg-tertiary)" : "var(--bg-secondary)";
    e.currentTarget.style.borderColor = over ? "var(--border-secondary)" : "var(--border-primary)";
  };

  const handleResetOnboarding = async () => {
    if (!confirm("This will reset your onboarding experience. The welcome (citizen) screen will appear immediately. Continue?")) {
      return;
    }

    try {
      const token = await getAccessTokenSilently();
      const extra = { ...(userPreferences?.extra || {}), preferred_onboarding_type: "citizen" };
      await updateUserPreferences({ has_completed_onboarding: false, extra }, token);
      hasCheckedOnboarding.current = false;
      await getSavedCities(token);
      setShowGovernmentOnboardingModal(false);
      setShowWelcomeModal(true);
    } catch (error) {
      console.error("Error resetting onboarding:", error);
      alert("Failed to reset onboarding. Please try again.");
    }
  };

  const handleResetOnboardingGovernment = async () => {
    if (!confirm("This will reset onboarding and show the government flow (verify email, etc.) immediately. Continue?")) {
      return;
    }

    try {
      const token = await getAccessTokenSilently();
      const extra = { ...(userPreferences?.extra || {}), preferred_onboarding_type: "government" };
      await updateUserPreferences({ has_completed_onboarding: false, extra }, token);
      hasCheckedOnboarding.current = false;
      setShowWelcomeModal(false);
      setGovernmentClaimContext(null);
      setShowGovernmentOnboardingModal(true);
    } catch (error) {
      console.error("Error resetting to government onboarding:", error);
      alert("Failed to reset. Please try again.");
    }
  };

  const handleSwitchGovernmentMode = async (enable: boolean) => {
    try {
      setGovModeToggling(true);
      const token = await getAccessTokenSilently();
      const updated = await updateGovernmentVerification(
        enable,
        enable ? (userEmail ?? undefined) : undefined,
        token
      );
      setGovVerificationStatus(updated);
    } catch (error) {
      console.error("Error toggling government mode:", error);
      alert(enable ? "Failed to switch to government mode." : "Failed to revert to standard user.");
    } finally {
      setGovModeToggling(false);
    }
  };

  if (isLoading || isCheckingAdmin) {
    return (
      <div className={styles.dashboardLoading}>
        <Loader size="sm" color="dark" />
        <span>Loading...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const hasGovernmentBanner = !!govVerificationStatus?.government_verified;

  return (
    <div className={`${styles.dashboardLayout} ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
      <TitleBar
        onMenuToggle={handleMenuToggle}
        isAdmin={isAdmin}
        sidebarOpen={sidebarOpen}
      />
      
      <Sidebar
        isOpen={sidebarOpen}
        isAdmin={isAdmin}
        cityLeadCityIds={cityLeadCityIds}
        currentView={currentView}
        governmentVerified={govVerificationStatus?.government_verified ?? false}
        governmentEmail={govVerificationStatus?.government_email ?? null}
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
        onMenuToggle={handleMenuToggle}
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
        {hasGovernmentBanner && (
          <div className={styles.governmentBanner} role="banner">
            Government mode
          </div>
        )}
        <div className={styles.viewsContainer}>
          {currentView === "chat" && (
            <div className={`${styles.contentView} ${styles.contentViewActive}`}>
              <ChatView
                sessionId={currentSessionId}
                onSessionChange={setCurrentSessionId}
                initialPrompt={initialChatPrompt}
                onInitialPromptHandled={() => setInitialChatPrompt(null)}
              />
            </div>
          )}

                  {currentView === "research" && currentResearchId && canAccessResearch && (
            <div className={`${styles.contentView} ${styles.contentViewActive}`}>
                      <ResearchView reportId={currentResearchId} isAdmin={isAdmin} />
            </div>
          )}

          {currentView === "research-new" && canAccessResearch && (
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

          {/* Settings will be rendered as overlay below */}
          {currentView === "user-management" && (
            <div id="user-management-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <UserManagement />
              </div>
            </div>
          )}

          {currentView === "claims-admin" && (
            <div id="claims-admin-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <ClaimsAdmin />
              </div>
            </div>
          )}

          {currentView === "metrics-admin" && (
            <div id="metrics-admin-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <h2 style={{ margin: "0 0 8px 0", padding: 0, color: "var(--text-primary)", fontSize: "18px" }}>
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
                <h2 style={{ margin: "0 0 8px 0", padding: 0, color: "var(--text-primary)", fontSize: "18px" }}>
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

          {currentView === "feed-stories-admin" && (isAdmin || cityLeadCityIds.length > 0) && (
            <div id="feed-stories-admin-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <div className={styles.adminContainer}>
                <h2 style={{ margin: "0 0 8px 0", padding: 0, color: "var(--text-primary)", fontSize: "18px" }}>
                  Feed stories
                </h2>
                <FeedStoriesAdmin />
              </div>
            </div>
          )}

          {currentView === "feed" && (
            <div id="feed-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <FeedView cityId={null} district={null} />
            </div>
          )}
        </div>
      </main>

      {/* Settings Overlay */}
      {settingsOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setSettingsOpen(false)}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              zIndex: 1000,
              cursor: "pointer",
            }}
          />
          {/* Settings Panel */}
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "90%",
              maxWidth: "800px",
              maxHeight: "90vh",
              background: "var(--bg-primary)",
              borderRadius: "12px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              zIndex: 1001,
              overflow: "auto",
              border: "1px solid var(--border-primary)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.adminContainer} style={{ padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
                <h2 style={{ margin: 0 }}>Settings</h2>
                <button
                  onClick={() => setSettingsOpen(false)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "6px",
                    color: "var(--text-secondary)",
                    transition: "all 0.15s ease",
                    fontSize: "20px",
                    lineHeight: 1,
                    width: "32px",
                    height: "32px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--bg-secondary)";
                    e.currentTarget.style.color = "var(--button-secondary-text)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "none";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                  aria-label="Close settings"
                >
                  ×
                </button>
              </div>
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
                  <div style={{ marginBottom: "32px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "16px" }}>
                      Communication Preferences
                    </h3>
                    
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 0",
                        borderBottom: "1px solid var(--border-primary)",
                        gap: "16px",
                        cursor: "pointer",
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
                          checked={editableAnomalyAlerts}
                          onChange={(e) => setEditableAnomalyAlerts(e.target.checked)}
                          aria-label="Toggle anomaly alerts"
                        />
                        <span style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                          {editableAnomalyAlerts ? "On" : "Off"}
                        </span>
                      </label>
                    </label>

                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 0",
                        borderBottom: "1px solid var(--border-primary)",
                        gap: "16px",
                        cursor: "pointer",
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
                          checked={editableWeeklyDigest}
                          onChange={(e) => setEditableWeeklyDigest(e.target.checked)}
                          aria-label="Toggle weekly digest"
                        />
                        <span style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                          {editableWeeklyDigest ? "On" : "Off"}
                        </span>
                      </label>
                    </label>

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
                      <div style={{ flex: 1 }}>
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
                        </div>
                        {editableMonthlyReport && (
                          <div style={{ marginTop: "8px", display: "flex", gap: "16px" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px" }}>
                              <input
                                type="radio"
                                name="reportScope"
                                checked={editableReportScope === "district"}
                                onChange={() => setEditableReportScope("district")}
                              />
                              <span>For my district</span>
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px" }}>
                              <input
                                type="radio"
                                name="reportScope"
                                checked={editableReportScope === "city"}
                                onChange={() => setEditableReportScope("city")}
                              />
                              <span>For the whole city</span>
                            </label>
                          </div>
                        )}
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
                          checked={editableMonthlyReport}
                          onChange={(e) => setEditableMonthlyReport(e.target.checked)}
                          aria-label="Toggle monthly report"
                        />
                        <span style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                          {editableMonthlyReport ? "On" : "Off"}
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Category Interests Section */}
                  <div style={{ marginBottom: "32px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                      Category Interests
                    </h3>
                    <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "12px" }}>
                      Select categories you&apos;d like to track (optional)
                    </p>
                    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--border-primary)" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
                        {[
                          "Crime & Safety",
                          "Traffic & Transportation",
                          "Housing & Development",
                          "Budget & Finance",
                          "Environment & Sustainability",
                          "Public Health",
                          "Education",
                          "Infrastructure",
                        ].map((category) => (
                          <label
                            key={category}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "8px 12px",
                              background: editableCategories.includes(category)
                                ? "var(--brand-primary-light, rgba(173, 53, 250, 0.1))"
                                : "var(--bg-secondary)",
                              border: `1px solid ${
                                editableCategories.includes(category)
                                  ? "var(--brand-primary, #ad35fa)"
                                  : "var(--border-primary)"
                              }`,
                              borderRadius: "8px",
                              cursor: "pointer",
                              fontSize: "13px",
                              color: editableCategories.includes(category)
                                ? "var(--brand-primary, #ad35fa)"
                                : "var(--text-primary)",
                              fontWeight: editableCategories.includes(category) ? 500 : 400,
                              transition: "all 0.15s ease",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={editableCategories.includes(category)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditableCategories([...editableCategories, category]);
                                } else {
                                  setEditableCategories(editableCategories.filter((c) => c !== category));
                                }
                              }}
                              style={{ accentColor: "var(--brand-primary, #ad35fa)" }}
                            />
                            <span>{category}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Learning Focus Section */}
                  <div style={{ marginBottom: "32px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                      Learning Focus
                    </h3>
                    <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "12px" }}>
                      Tell us what you&apos;d like to focus on (optional)
                    </p>
                    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--border-primary)" }}>
                      <textarea
                        value={editableLearningFocus}
                        onChange={(e) => setEditableLearningFocus(e.target.value)}
                        placeholder="e.g., Understanding budget allocation, tracking crime trends, monitoring infrastructure projects..."
                        rows={3}
                        style={{
                          width: "100%",
                          padding: "12px 14px",
                          fontSize: "14px",
                          fontFamily: "inherit",
                          border: "1px solid var(--border-primary)",
                          borderRadius: "8px",
                          background: "var(--bg-primary)",
                          color: "var(--text-primary)",
                          resize: "vertical",
                          transition: "all 0.15s ease",
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = "var(--brand-primary, #ad35fa)";
                          e.target.style.boxShadow = "0 0 0 3px var(--brand-primary-light, rgba(173, 53, 250, 0.1))";
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = "var(--border-primary)";
                          e.target.style.boxShadow = "none";
                        }}
                      />
                    </div>
                  </div>

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

                  {/* Save Preferences Button */}
                  <div style={{ marginBottom: "32px", paddingTop: "16px", borderTop: "1px solid var(--border-primary)" }}>
                    <button
                      onClick={handleSavePreferences}
                      disabled={savingPreferences}
                      style={{
                        padding: "12px 24px",
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "#ffffff",
                        background: savingPreferences
                          ? "var(--text-tertiary, #9ca3af)"
                          : "var(--brand-primary, #ad35fa)",
                        border: "none",
                        borderRadius: "8px",
                        cursor: savingPreferences ? "not-allowed" : "pointer",
                        transition: "all 0.15s ease",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        justifyContent: "center",
                      }}
                      onMouseEnter={(e) => {
                        if (!savingPreferences) {
                          e.currentTarget.style.background = "var(--brand-primary-hover, #9333ea)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!savingPreferences) {
                          e.currentTarget.style.background = "var(--brand-primary, #ad35fa)";
                        }
                      }}
                    >
                      {savingPreferences ? (
                        <>
                          <Loader size="sm" color="white" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        "Save Preferences"
                      )}
                    </button>
                  </div>

                  {/* System Status Section - Subtle indicator at bottom */}
                  <div style={{ 
                    marginTop: "32px", 
                    paddingTop: "24px", 
                    borderTop: "1px solid var(--border-primary)",
                    opacity: 0.7
                  }}>
                    <div style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between",
                      padding: "8px 0"
                    }}>
                      <div>
                        <div style={{ 
                          fontSize: "12px", 
                          color: "var(--text-secondary)", 
                          marginBottom: "4px",
                          fontWeight: 500
                        }}>
                          Session Storage
                        </div>
                        <div style={{ 
                          fontSize: "11px", 
                          color: "var(--text-secondary)",
                          opacity: 0.8
                        }}>
                          Connection status for chat sessions
                        </div>
                      </div>
                      <div style={{ fontSize: "12px" }}>
                        <RedisStatusIndicator subtle />
                      </div>
                    </div>
                  </div>

                  {/* Government mode (preview) */}
                  <div style={{ marginBottom: "32px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "16px" }}>
                      Government mode (preview)
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
                        <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                          {govVerificationStatus?.government_verified ? "Government mode on" : "Government mode off"}
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                          {govVerificationStatus?.government_verified
                            ? govVerificationStatus.government_email
                              ? `Verified as ${govVerificationStatus.government_email}`
                              : "You're seeing the app as a government user."
                            : "Switch to government mode to see the UI as a government-verified user."}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {govVerificationStatus?.government_verified ? (
                          <button
                            onClick={() => handleSwitchGovernmentMode(false)}
                            disabled={govModeToggling}
                            style={buttonStyle}
                            onMouseEnter={(e) => buttonHover(e, true)}
                            onMouseLeave={(e) => buttonHover(e, false)}
                          >
                            {govModeToggling ? "…" : "Revert to standard user"}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSwitchGovernmentMode(true)}
                            disabled={govModeToggling}
                            style={buttonStyle}
                            onMouseEnter={(e) => buttonHover(e, true)}
                            onMouseLeave={(e) => buttonHover(e, false)}
                          >
                            {govModeToggling ? "…" : "Switch to government mode"}
                          </button>
                        )}
                      </div>
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
                        <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                          Reset onboarding
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                          Show the citizen welcome screen again on your next visit.
                        </div>
                      </div>
                      <button
                        onClick={handleResetOnboarding}
                        style={buttonStyle}
                        onMouseEnter={(e) => buttonHover(e, true)}
                        onMouseLeave={(e) => buttonHover(e, false)}
                      >
                        Reset
                      </button>
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
                        <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                          Reset and show government onboarding
                        </div>
                        <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                          Run the government flow (verify email, confirm profile) again.
                        </div>
                      </div>
                      <button
                        onClick={handleResetOnboardingGovernment}
                        style={buttonStyle}
                        onMouseEnter={(e) => buttonHover(e, true)}
                        onMouseLeave={(e) => buttonHover(e, false)}
                      >
                        Reset (government)
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
        </>
      )}

      {/* Welcome Modal for first-time users */}
      <GovernmentOnboardingModal
        isOpen={showGovernmentOnboardingModal}
        onClose={() => setShowGovernmentOnboardingModal(false)}
        onComplete={handleGovernmentOnboardingComplete}
        claimContext={governmentClaimContext}
      />
      <WelcomeModal
        isOpen={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
        onCitySelected={handleWelcomeCitySelected}
        onComplete={handleWelcomeComplete}
      />
    </div>
  );
}
