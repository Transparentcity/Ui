"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import TitleBar from "@/components/TitleBar";
import Sidebar from "@/components/Sidebar";
import FeedView from "@/components/FeedView";
import { useTheme } from "@/contexts/ThemeContext";
import {
  getMyPermissions,
  getSavedCities,
  getUserPreferences,
  updateUserPreferences,
  getCity,
  createResearch,
  saveUserMetricOrdering,
  recordSignupIntent,
  getGovernmentVerificationStatus,
  updateGovernmentVerification,
  listMyPlaces,
  type ClaimContext,
  type GovernmentVerificationStatus,
  type UserPreferences,
  type UserPreferencesUpdateRequest,
  type CityDetail,
  type UserPlace,
} from "@/lib/apiClient";
import { PENDING_ORDER_STORAGE_KEY_PREFIX } from "@/components/MetricOrderEditor";
import Loader from "@/components/Loader";
import WelcomeModal from "@/components/WelcomeModal";
import GovernmentOnboardingModal from "@/components/GovernmentOnboardingModal";
import EditHomeLocationModal from "@/components/EditHomeLocationModal";
import RedisStatusIndicator from "@/components/RedisStatusIndicator";
import {
  trackSignupComplete,
  trackLogin,
  trackOnboardingComplete,
  trackDashboardView,
  trackUserActivation,
  trackCitySaved,
} from "@/lib/analytics";
import {
  mergeNewsletterPreferenceFields,
  readNewsletterPreferenceFields,
} from "@/lib/newsletterPreferences";
import styles from "./page.module.css";
import dynamic from "next/dynamic";

// Lazy-load heavy views so dashboard shell and default Feed paint immediately
const ChatView = dynamic(() => import("@/components/ChatView"), {
  ssr: false,
  loading: () => (
    <div className={`${styles.contentView} tc-loading-state`} style={{ alignItems: "center", justifyContent: "center" }}>
      <Loader size="sm" color="dark" />
      <span>Loading…</span>
    </div>
  ),
});
const CityView = dynamic(() => import("@/components/CityView"), {
  ssr: false,
  loading: () => (
    <div className={`${styles.contentView} tc-loading-state`} style={{ alignItems: "center", justifyContent: "center" }}>
      <Loader size="sm" color="dark" />
      <span>Loading…</span>
    </div>
  ),
});
const ResearchView = dynamic(() => import("@/components/ResearchView"), {
  ssr: false,
  loading: () => (
    <div className={`${styles.contentView} tc-loading-state`} style={{ alignItems: "center", justifyContent: "center" }}>
      <Loader size="sm" color="dark" />
      <span>Loading…</span>
    </div>
  ),
});
const CityDataAdmin = dynamic(() => import("@/components/CityDataAdmin"), { ssr: false });
const CityDataTable = dynamic(() => import("@/components/CityDataTable"), { ssr: false });
const DatasetsAdmin = dynamic(() => import("@/components/DatasetsAdmin"), { ssr: false });
const MetricsAdmin = dynamic(() => import("@/components/MetricsAdmin"), { ssr: false });
const UserManagement = dynamic(() => import("@/components/UserManagement"), { ssr: false });
const ClaimsAdmin = dynamic(() => import("@/components/ClaimsAdmin"), { ssr: false });
const JobLogsViewer = dynamic(() => import("@/components/JobLogsViewer"), { ssr: false });
const EmailAdmin = dynamic(() => import("@/components/EmailAdmin"), { ssr: false });
const DataCompletenessAdmin = dynamic(() => import("@/components/DataCompletenessAdmin"), { ssr: false });

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
  const [requestOpenDistrictModal, setRequestOpenDistrictModal] = useState<number | null>(null);
  const [initialPlaceId, setInitialPlaceId] = useState<number | null>(null);
  /** Official Selector selection (district / place) so left nav can stay in sync; only when currentView === "city". */
  const [citySelection, setCitySelection] = useState<{ district: number | null; placeId: number | null }>({ district: null, placeId: null });
  const [allUserPlaces, setAllUserPlaces] = useState<UserPlace[]>([]);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showGovernmentOnboardingModal, setShowGovernmentOnboardingModal] = useState(false);
  const [governmentClaimContext, setGovernmentClaimContext] = useState<ClaimContext | null>(null);
  const hasAutoSelectedCity = useRef(false);
  const hasCheckedOnboarding = useRef(false);
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [govVerificationStatus, setGovVerificationStatus] = useState<GovernmentVerificationStatus | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [homeCity, setHomeCity] = useState<(CityDetail & { display_name?: string }) | null>(null);
  const [loadingPreferences, setLoadingPreferences] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [govModeToggling, setGovModeToggling] = useState(false);
  
  // Editable preference state
  const [editableAnomalyAlerts, setEditableAnomalyAlerts] = useState(false);
  const [editableWeeklyDigest, setEditableWeeklyDigest] = useState(false);
  const [editableMonthlyReport, setEditableMonthlyReport] = useState(false);
  const [editableReportScope, setEditableReportScope] = useState<"district" | "city">("district");
  const [editableNewsletterDescription, setEditableNewsletterDescription] = useState("");
  const [editableNewsletterFrequency, setEditableNewsletterFrequency] = useState<"weekly" | "monthly">("weekly");
  const [generatingSampleNewsletter, setGeneratingSampleNewsletter] = useState(false);
  const [sampleNewsletterReportUrl, setSampleNewsletterReportUrl] = useState<string | null>(null);
  const [showEditHomeLocationModal, setShowEditHomeLocationModal] = useState(false);

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

  // Load all user places for sidebar (My Places list)
  useEffect(() => {
    if (!isAuthenticated || isLoading) {
      setAllUserPlaces([]);
      return;
    }
    let cancelled = false;
    getAccessTokenSilently()
      .then((token) => listMyPlaces(token))
      .then((list) => {
        if (!cancelled) setAllUserPlaces(list);
      })
      .catch(() => {
        if (!cancelled) setAllUserPlaces([]);
      });
    return () => { cancelled = true; };
  }, [isAuthenticated, isLoading, getAccessTokenSilently]);

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

  // Load permissions and government verification in parallel (single round-trip for sidebar state)
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setIsCheckingAdmin(false);
      return;
    }

    let cancelled = false;

    const loadPermissionsAndGov = async () => {
      try {
        const token = await getAccessTokenSilently();
        const [permissions, govStatus] = await Promise.all([
          getMyPermissions(token),
          getGovernmentVerificationStatus(token).catch(() => null),
        ]);
        if (cancelled) return;
        setIsAdmin(permissions.is_admin || false);
        setCityLeadCityIds(permissions.city_lead_city_ids || []);
        setGovVerificationStatus(govStatus ?? null);
        console.log("Admin status checked:", { isAdmin: permissions.is_admin, role: permissions.role });
      } catch (error) {
        console.error("Error checking admin status:", error);
        if (!cancelled) {
          setIsAdmin(false);
          setCityLeadCityIds([]);
          setGovVerificationStatus(null);
        }
      } finally {
        if (!cancelled) setIsCheckingAdmin(false);
      }
    };

    loadPermissionsAndGov();
    return () => {
      cancelled = true;
    };
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

  // Do not auto-select a city on landing. Only Feed is selected; user picks a city from My Places when they want.

  const handleMenuToggle = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Stable callback so CityView's useEffect doesn't re-run every render (avoids max update depth)
  const onOfficialSelectionChange = useCallback(
    (s: { district: number | null; placeId: number | null }) => setCitySelection(s),
    []
  );

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
  };

  const handleOpenFindDistrict = () => {
    if (activeCityId != null) {
      setRequestOpenDistrictModal(activeCityId);
      setCurrentView("city");
    }
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
    setInitialDistrict(null);
    setInitialPlaceId(null);
    setCitySelection({ district: null, placeId: null });
    setCurrentView("city");
    setCurrentSessionId(null);
    setIsCurrentSessionJobSession(false);
    setCurrentResearchId(null);
    setGpsLocation(null);
  };

  const handlePlaceClick = (cityId: number, placeId: number) => {
    setActiveCityId(cityId);
    setInitialDistrict(null);
    setInitialPlaceId(placeId);
    setCitySelection({ district: null, placeId });
    setCurrentView("city");
    setCurrentSessionId(null);
    setIsCurrentSessionJobSession(false);
    setCurrentResearchId(null);
    setGpsLocation(null);
  };

  const handlePlaceSaved = () => {
    getAccessTokenSilently()
      .then((token) => listMyPlaces(token))
      .then(setAllUserPlaces)
      .catch(() => setAllUserPlaces([]));
  };

  const handlePlaceRenamed = () => {
    getAccessTokenSilently()
      .then((token) => listMyPlaces(token))
      .then(setAllUserPlaces)
      .catch(() => setAllUserPlaces([]));
  };

  const handlePlaceDeleted = (placeId: number) => {
    getAccessTokenSilently()
      .then((token) => listMyPlaces(token))
      .then(setAllUserPlaces)
      .catch(() => setAllUserPlaces([]));
    if (citySelection.placeId === placeId) {
      setCitySelection((prev) => ({ ...prev, placeId: null }));
      setInitialPlaceId(null);
    }
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
      const { newsletterDescription, newsletterFrequency } =
        readNewsletterPreferenceFields(prefs.extra);
      console.log("Communication preferences from loaded prefs:", commPrefs);
      
      setEditableAnomalyAlerts(commPrefs.anomaly_alerts ?? false);
      setEditableWeeklyDigest(commPrefs.weekly_digest ?? false);
      setEditableMonthlyReport(commPrefs.monthly_report ?? false);
      setEditableReportScope(commPrefs.report_scope || "district");
      setEditableNewsletterDescription(newsletterDescription);
      setEditableNewsletterFrequency(newsletterFrequency);
      
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

      const communicationPreferences = mergeNewsletterPreferenceFields(
        currentExtra,
        {
          newsletterDescription: editableNewsletterDescription,
          newsletterFrequency: editableNewsletterFrequency,
        }
      );
      
      // Build updated extra object, preserving ALL existing data
      // The backend merges extra fields at the top level of preferences,
      // so we need to include all existing extra fields plus our updates
      const updatedExtra = {
        ...currentExtra, // Preserve all existing extra fields (saved_cities, home_location, etc.)
        communication_preferences: {
          ...communicationPreferences,
          anomaly_alerts: editableAnomalyAlerts,
          weekly_digest: editableWeeklyDigest,
          monthly_report: editableMonthlyReport,
          report_scope: editableMonthlyReport ? editableReportScope : null,
        },
      };
      
      console.log("Updated extra to send:", JSON.stringify(updatedExtra, null, 2));
      
      // Build update request with only the fields the API expects
      const updateRequest: UserPreferencesUpdateRequest = {
        extra: updatedExtra,
      };
      
      // Preserve has_completed_onboarding and theme if they exist
      if (latestPrefs.has_completed_onboarding !== undefined) {
        updateRequest.has_completed_onboarding = latestPrefs.has_completed_onboarding;
      }
      if (latestPrefs.theme !== undefined) {
        updateRequest.theme = latestPrefs.theme ?? undefined;
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
      const { newsletterDescription, newsletterFrequency } =
        readNewsletterPreferenceFields(refreshed.extra);
      
      setEditableAnomalyAlerts(commPrefs.anomaly_alerts ?? false);
      setEditableWeeklyDigest(commPrefs.weekly_digest ?? false);
      setEditableMonthlyReport(commPrefs.monthly_report ?? false);
      setEditableReportScope(commPrefs.report_scope || "district");
      setEditableNewsletterDescription(newsletterDescription);
      setEditableNewsletterFrequency(newsletterFrequency);
      
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

  const handleGenerateSampleNewsletter = async () => {
    const homeLocation = userPreferences?.extra?.home_location;
    const cityId = homeLocation?.city_id;
    const district = homeLocation?.district ?? 0;
    if (!cityId) {
      alert("Set a home city first (complete onboarding or save a city as home).");
      return;
    }
    const cityName = homeCity?.name || homeCity?.display_name || "Your city";
    const districtLabel = district ? `District ${district}` : "citywide";
    const defaultPrompt =
      "Create a weekly newsletter report for this city and district. Focus on recent changes and trends in key metrics (crime, housing, permits, 311 calls), notable anomalies, comparative analysis (this period vs. previous, district vs. city-wide), and actionable insights for residents. Be data-driven with specific numbers; highlight both positive and concerning trends.";
    const prompt = editableNewsletterDescription.trim() || defaultPrompt;
    const fullPrompt = `For ${cityName} (${districtLabel}). ${prompt}`;

    setGeneratingSampleNewsletter(true);
    setSampleNewsletterReportUrl(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await createResearch(
        {
          prompt: fullPrompt,
          city_id: cityId,
          district: district ? String(district) : null,
          max_iterations: 1,
          max_subquestions: 2,
          is_newsletter: true,
          newsletter_frequency: editableNewsletterFrequency,
          generate_feed_stories: true,
          feed_story_count: 2,
          feed_story_frequency: editableNewsletterFrequency,
          feed_story_category: "personal_newsletter",
          use_low_cost_model: true,
        },
        token
      );
      if (res?.public_url) {
        setSampleNewsletterReportUrl(res.public_url);
      }
    } catch (err) {
      console.error("Error generating sample newsletter:", err);
      alert("Failed to generate sample newsletter. Please try again.");
    } finally {
      setGeneratingSampleNewsletter(false);
    }
  };

  const handleWelcomeCitySelected = (cityId: number, district?: number | null, placeId?: number | null) => {
    setActiveCityId(cityId);
    setInitialDistrict(district !== undefined && district !== null ? district : null);
    setInitialPlaceId(placeId ?? null);
    setCurrentView("city");
    setCurrentSessionId(null);
    setCurrentResearchId(null);
    hasAutoSelectedCity.current = true;
    // Refresh My Places so the new block appears in the sidebar
    if (placeId != null) {
      getAccessTokenSilently()
        .then((token) => listMyPlaces(token))
        .then(setAllUserPlaces)
        .catch(() => {});
    }
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

  // Only block on Auth0; show shell + feed immediately. Admin/gov state fills in when ready.
  if (isLoading) {
    return (
      <div className={`${styles.dashboardLoading} tc-loading-state`}>
        <Loader size="sm" color="dark" />
        <span>Loading…</span>
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
        onDistrictClick={(cityId, district) => {
          setActiveCityId(cityId);
          const districtNum = typeof district === "string" ? parseInt(district, 10) : district;
          setInitialDistrict(districtNum);
          setInitialPlaceId(null);
          setCitySelection({ district: Number.isNaN(districtNum) ? null : districtNum, placeId: null });
          setCurrentView("city");
          setCurrentSessionId(null);
          setIsCurrentSessionJobSession(false);
          setCurrentResearchId(null);
          setGpsLocation(null);
        }}
        userPlaces={allUserPlaces}
        activePlaceId={currentView === "city" ? citySelection.placeId : null}
        activeDistrict={
          currentView === "city"
            ? citySelection.placeId != null
              ? undefined
              : citySelection.district
            : undefined
        }
        onPlaceClick={handlePlaceClick}
        onPlaceSaved={handlePlaceSaved}
        onPlaceRenamed={handlePlaceRenamed}
        onPlaceDeleted={handlePlaceDeleted}
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
          setInitialPlaceId(null);
          setCitySelection({ district: null, placeId: null });
          setCurrentView("city");
          setCurrentSessionId(null); // Clear chat session when selecting a city
          setIsCurrentSessionJobSession(false);
          // Preserve GPS location - it will only be cleared when user manually
          // selects a city from the sidebar list (via handleCityClick)
        }}
        onGPSLocation={(location) => {
          setGpsLocation(location);
        }}
        onOpenFindDistrict={handleOpenFindDistrict}
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
                  key={activeCityId}
                  cityId={activeCityId}
                  isAdmin={isAdmin || cityLeadCityIds.includes(activeCityId)}
                  gpsLocation={gpsLocation}
                  initialDistrict={initialDistrict}
                  initialPlaceId={initialPlaceId}
                  requestOpenDistrictModal={requestOpenDistrictModal}
                  onClearDistrictModalRequest={() => setRequestOpenDistrictModal(null)}
                  onOfficialSelectionChange={onOfficialSelectionChange}
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
                  Seymour&apos;s inbox
                </h2>
                <EmailAdmin />
              </div>
            </div>
          )}


          {currentView === "feed" && (
            <div id="feed-view" className={`${styles.contentView} ${styles.contentViewActive}`}>
              <FeedView
                cityId={null}
                district={null}
                isAdmin={isAdmin}
                cityLeadCityIds={cityLeadCityIds}
              />
            </div>
          )}
        </div>
      </main>

      {/* Settings Overlay */}
      {settingsOpen && (
        <>
          <div className={styles.settingsBackdrop} onClick={() => setSettingsOpen(false)} aria-hidden />
          <div className={styles.settingsPanel} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className={styles.settingsPanelInner}>
              <header className={styles.settingsHeader}>
                <h2 id="settings-title" className={styles.settingsTitle}>Settings</h2>
                <button type="button" className={styles.settingsCloseBtn} onClick={() => setSettingsOpen(false)} aria-label="Close settings">
                  ×
                </button>
              </header>
              {loadingPreferences ? (
                <div className="tc-loading-state" style={{ marginTop: "8px" }}>
                  <Loader size="sm" color="dark" />
                  <span>Loading preferences…</span>
                </div>
              ) : (
                <div className={styles.settingsBody}>
                  {/* Account */}
                  <section className={styles.settingsSection}>
                    <h3 className={styles.settingsSectionTitle}>Account</h3>
                    <div className={styles.settingsSectionCard}>
                      {userEmail && (
                        <div className={styles.settingsRow}>
                          <div className={styles.settingsRowLabel}>
                            <div className={styles.settingsRowTitle}>Email</div>
                            <div className={styles.settingsRowDescription}>{userEmail}</div>
                          </div>
                        </div>
                      )}
                      <div className={styles.settingsRow}>
                        <div className={styles.settingsRowLabel}>
                          <div className={styles.settingsRowTitle}>Home location</div>
                          <div className={styles.settingsRowDescription}>
                            {userPreferences?.extra?.home_location ? (
                              homeCity ? (
                                <>
                                  {homeCity.emoji && <span style={{ marginRight: "6px" }}>{homeCity.emoji}</span>}
                                  {homeCity.display_name || homeCity.name}
                                  {userPreferences.extra.home_location.district !== null && userPreferences.extra.home_location.district !== undefined && (
                                    <span> · District {userPreferences.extra.home_location.district}</span>
                                  )}
                                </>
                              ) : (
                                `City ID: ${userPreferences.extra.home_location.city_id}${
                                  userPreferences.extra.home_location.district !== null && userPreferences.extra.home_location.district !== undefined
                                    ? ` · District ${userPreferences.extra.home_location.district}`
                                    : ""
                                }`
                              )
                            ) : (
                              "Not set"
                            )}
                          </div>
                        </div>
                        <div className={styles.settingsRowControl}>
                          <button type="button" className={styles.settingsSecondaryBtn} onClick={() => setShowEditHomeLocationModal(true)}>
                            {userPreferences?.extra?.home_location ? "Edit" : "Set location"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                  <EditHomeLocationModal
                      open={showEditHomeLocationModal}
                      onClose={() => setShowEditHomeLocationModal(false)}
                      onSaved={async () => {
                        await loadUserSettings();
                        handlePlaceSaved();
                      }}
                    />

                  {/* Communication preferences */}
                  <section className={styles.settingsSection}>
                    <h3 className={styles.settingsSectionTitle}>Communication preferences</h3>
                    <div className={styles.settingsSectionCard}>
                      <label className={styles.settingsRow} style={{ cursor: "pointer" }}>
                        <div className={styles.settingsRowLabel}>
                          <div className={styles.settingsRowTitle}>Anomaly alerts</div>
                          <div className={styles.settingsRowDescription}>Get notified when significant changes are detected</div>
                        </div>
                        <div className={styles.settingsRowControl}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none", fontSize: "13px", color: "var(--text-secondary)" }}>
                            <input type="checkbox" checked={editableAnomalyAlerts} onChange={(e) => setEditableAnomalyAlerts(e.target.checked)} aria-label="Toggle anomaly alerts" />
                            {editableAnomalyAlerts ? "On" : "Off"}
                          </label>
                        </div>
                      </label>
                      <label className={styles.settingsRow} style={{ cursor: "pointer" }}>
                        <div className={styles.settingsRowLabel}>
                          <div className={styles.settingsRowTitle}>Weekly digest</div>
                          <div className={styles.settingsRowDescription}>Summary of key metrics and changes</div>
                        </div>
                        <div className={styles.settingsRowControl}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none", fontSize: "13px", color: "var(--text-secondary)" }}>
                            <input type="checkbox" checked={editableWeeklyDigest} onChange={(e) => setEditableWeeklyDigest(e.target.checked)} aria-label="Toggle weekly digest" />
                            {editableWeeklyDigest ? "On" : "Off"}
                          </label>
                        </div>
                      </label>
                      <div className={styles.settingsRow}>
                        <div className={styles.settingsRowLabel} style={{ flex: 1 }}>
                          <div className={styles.settingsRowTitle}>Monthly report</div>
                          <div className={styles.settingsRowDescription}>Comprehensive analysis of city performance</div>
                          {editableMonthlyReport && (
                            <div style={{ marginTop: "10px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                              <label className={styles.settingsRadioLabel}>
                                <input type="radio" name="reportScope" checked={editableReportScope === "district"} onChange={() => setEditableReportScope("district")} />
                                For my district
                              </label>
                              <label className={styles.settingsRadioLabel}>
                                <input type="radio" name="reportScope" checked={editableReportScope === "city"} onChange={() => setEditableReportScope("city")} />
                                For the whole city
                              </label>
                            </div>
                          )}
                        </div>
                        <div className={styles.settingsRowControl}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none", fontSize: "13px", color: "var(--text-secondary)" }}>
                            <input type="checkbox" checked={editableMonthlyReport} onChange={(e) => setEditableMonthlyReport(e.target.checked)} aria-label="Toggle monthly report" />
                            {editableMonthlyReport ? "On" : "Off"}
                          </label>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Personalized newsletter */}
                  <section className={styles.settingsSection}>
                    <h3 className={styles.settingsSectionTitle}>Personalized newsletter</h3>
                    <div className={styles.settingsNewsletterBlock}>
                      <p className={styles.settingsNewsletterIntro}>
                        Your newsletter preferences from onboarding. Edit below and save to update. Generate an example to see a sample in the Personal newsletter section of your feed.
                      </p>
                      <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", marginBottom: "8px" }}>
                        Newsletter description (what you want each edition to focus on)
                      </label>
                      <textarea
                        className={styles.settingsTextarea}
                        value={editableNewsletterDescription}
                        onChange={(e) => setEditableNewsletterDescription(e.target.value)}
                        placeholder="Create a weekly newsletter report for this city and district. Focus on recent changes and trends in key metrics (crime, housing, permits, 311 calls), notable anomalies, comparative analysis..."
                        rows={4}
                      />
                      <div className={styles.settingsRadioGroup}>
                        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>Frequency:</span>
                        <label className={styles.settingsRadioLabel}>
                          <input type="radio" name="newsletterFreqSettings" checked={editableNewsletterFrequency === "weekly"} onChange={() => setEditableNewsletterFrequency("weekly")} style={{ accentColor: "var(--brand-primary, #ad35fa)" }} />
                          Weekly
                        </label>
                        <label className={styles.settingsRadioLabel}>
                          <input type="radio" name="newsletterFreqSettings" checked={editableNewsletterFrequency === "monthly"} onChange={() => setEditableNewsletterFrequency("monthly")} style={{ accentColor: "var(--brand-primary, #ad35fa)" }} />
                          Monthly
                        </label>
                      </div>
                      <button type="button" className={styles.settingsGenerateBtn} onClick={handleGenerateSampleNewsletter} disabled={generatingSampleNewsletter}>
                        {generatingSampleNewsletter ? (
                          <>
                            <Loader size="sm" color="white" />
                            <span>Generating sample…</span>
                          </>
                        ) : (
                          "Generate example newsletter"
                        )}
                      </button>
                      {sampleNewsletterReportUrl && (
                        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "12px", padding: "12px", background: "var(--bg-primary)", borderRadius: "8px" }}>
                          Sample is being generated. It will appear under <strong>Personal newsletter</strong> in your feed when ready.{" "}
                          <a href={sampleNewsletterReportUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-primary, #ad35fa)" }}>View report</a>
                        </p>
                      )}
                    </div>
                  </section>

                  {/* Display */}
                  <section className={styles.settingsSection}>
                    <h3 className={styles.settingsSectionTitle}>Display</h3>
                    <div className={styles.settingsSectionCard}>
                      <label className={styles.settingsRow} style={{ cursor: "pointer" }}>
                        <div className={styles.settingsRowLabel}>
                          <div className={styles.settingsRowTitle}>Dark mode</div>
                          <div className={styles.settingsRowDescription}>Use a dark color theme across the UI</div>
                        </div>
                        <div className={styles.settingsRowControl}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none", fontSize: "13px", color: "var(--text-secondary)" }}>
                            <input type="checkbox" checked={theme === "dark"} onChange={(e) => setTheme(e.target.checked ? "dark" : "light")} aria-label="Toggle dark mode" />
                            {theme === "dark" ? "On" : "Off"}
                          </label>
                        </div>
                      </label>
                    </div>
                  </section>

                  {/* Save */}
                  <div className={styles.settingsSaveBlock}>
                    <button type="button" className={styles.settingsSaveBtn} onClick={handleSavePreferences} disabled={savingPreferences}>
                      {savingPreferences ? (
                        <>
                          <Loader size="sm" color="white" />
                          <span>Saving…</span>
                        </>
                      ) : (
                        "Save preferences"
                      )}
                    </button>
                  </div>

                  {/* System status */}
                  <div className={styles.settingsFooterBlock}>
                    <div className={styles.settingsFooterRow}>
                      <div>
                        <div className={styles.settingsRowTitle} style={{ fontSize: "12px", marginBottom: "2px" }}>Session storage</div>
                        <div className={styles.settingsRowDescription} style={{ fontSize: "12px" }}>Connection status for chat sessions</div>
                      </div>
                      <RedisStatusIndicator subtle />
                    </div>
                  </div>

                  {/* Government mode (preview) */}
                  <section className={styles.settingsSection}>
                    <h3 className={styles.settingsSectionTitle}>Government mode (preview)</h3>
                    <div className={styles.settingsSectionCard}>
                      <div className={styles.settingsRow}>
                        <div className={styles.settingsRowLabel}>
                          <div className={styles.settingsRowTitle}>
                            {govVerificationStatus?.government_verified ? "Government mode on" : "Government mode off"}
                          </div>
                          <div className={styles.settingsRowDescription}>
                            {govVerificationStatus?.government_verified
                              ? govVerificationStatus.government_email
                                ? `Verified as ${govVerificationStatus.government_email}`
                                : "You're seeing the app as a government user."
                              : "Switch to government mode to see the UI as a government-verified user."}
                          </div>
                        </div>
                        <div className={styles.settingsRowControl} style={{ display: "flex", gap: "8px" }}>
                          {govVerificationStatus?.government_verified ? (
                            <button type="button" className={styles.settingsSecondaryBtn} onClick={() => handleSwitchGovernmentMode(false)} disabled={govModeToggling}>
                              {govModeToggling ? "…" : "Revert to standard user"}
                            </button>
                          ) : (
                            <button type="button" className={styles.settingsSecondaryBtn} onClick={() => handleSwitchGovernmentMode(true)} disabled={govModeToggling}>
                              {govModeToggling ? "…" : "Switch to government mode"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Onboarding */}
                  <section className={styles.settingsSection}>
                    <h3 className={styles.settingsSectionTitle}>Onboarding</h3>
                    <div className={styles.settingsSectionCard}>
                      <div className={styles.settingsRow}>
                        <div className={styles.settingsRowLabel}>
                          <div className={styles.settingsRowTitle}>Reset onboarding</div>
                          <div className={styles.settingsRowDescription}>Show the citizen welcome screen again on your next visit</div>
                        </div>
                        <div className={styles.settingsRowControl}>
                          <button type="button" className={styles.settingsSecondaryBtn} onClick={handleResetOnboarding}>Reset</button>
                        </div>
                      </div>
                      <div className={styles.settingsRow}>
                        <div className={styles.settingsRowLabel}>
                          <div className={styles.settingsRowTitle}>Reset and show government onboarding</div>
                          <div className={styles.settingsRowDescription}>Run the government flow (verify email, confirm profile) again</div>
                        </div>
                        <div className={styles.settingsRowControl}>
                          <button type="button" className={styles.settingsSecondaryBtn} onClick={handleResetOnboardingGovernment}>Reset (government)</button>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* System statistics */}
                  <section className={styles.settingsSection}>
                    <h3 className={styles.settingsSectionTitle}>System statistics</h3>
                    <div className={styles.settingsSectionCard}>
                      <div className={styles.settingsRow}>
                        <div className={styles.settingsRowLabel}>
                          <div className={styles.settingsRowDescription}>Coming soon…</div>
                        </div>
                      </div>
                    </div>
                  </section>
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
