"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useQueryClient } from "@tanstack/react-query";
import { getJob } from "@/lib/apiClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OnboardingStatus = "idle" | "scanning" | "found_rep" | "completed" | "failed";

/** Distinguishes city-level loading (no job) from place-level loading (with job). */
export type OnboardingMode = "idle" | "city" | "place";

interface PlaceOnboardingContextValue {
  status: OnboardingStatus;
  mode: OnboardingMode;
  message: string;
  cityName: string | null;
  repName: string | null;
  repTitle: string | null;
  dismissed: boolean;
  dismiss: () => void;
  startJob: (placeId: number, jobId: string) => void;
  startCityLoading: (cityName: string) => void;
  completeCityLoading: (success: boolean) => void;
  notifyRepFound: (name: string, title?: string) => void;
  startBackgroundWork: () => void;
  completeBackgroundWork: () => void;
}

// ---------------------------------------------------------------------------
// Progressive messages based on elapsed seconds (place-level)
// ---------------------------------------------------------------------------

const PHASES: { after: number; message: string }[] = [
  { after: 0, message: "Pulling public data near your address..." },
  { after: 10, message: "Analyzing trends in your neighborhood..." },
  { after: 22, message: "Searching for anomalies in the data..." },
  { after: 36, message: "Building stories from what we found..." },
  { after: 55, message: "Finishing up your neighborhood feed..." },
  { after: 90, message: "Still working on it, this can take a minute..." },
];

function getPhaseMessage(elapsedMs: number): string {
  const seconds = elapsedMs / 1000;
  let msg = PHASES[0].message;
  for (const phase of PHASES) {
    if (seconds >= phase.after) msg = phase.message;
  }
  return msg;
}

// ---------------------------------------------------------------------------
// Context (safe defaults so consumers work without a provider ancestor)
// ---------------------------------------------------------------------------

const PlaceOnboardingContext = createContext<PlaceOnboardingContextValue>({
  status: "idle",
  mode: "idle",
  message: "",
  cityName: null,
  repName: null,
  repTitle: null,
  dismissed: false,
  dismiss: () => {},
  startJob: () => {},
  startCityLoading: () => {},
  completeCityLoading: () => {},
  notifyRepFound: () => {},
  startBackgroundWork: () => {},
  completeBackgroundWork: () => {},
});

export function usePlaceOnboarding() {
  return useContext(PlaceOnboardingContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const SESSION_KEY = "tc:onboarding-banner-dismissed";
const POLL_INTERVAL_MS = 2000;
const AUTO_DISMISS_MS = 2000;
const MAX_POLL_DURATION_MS = 30_000; // Give up after 30 seconds and show the feed

interface PlaceOnboardingProviderProps {
  children: ReactNode;
  /** When set externally (e.g. after onboarding), auto-starts the job tracking */
  initialJob?: { placeId: number; jobId: string } | null;
  /** Ref that gets populated with notifyRepFound so parent can call it */
  notifyRepFoundRef?: React.MutableRefObject<((name: string, title?: string) => void) | null>;
  /** Ref that gets populated with start/complete so parent can defer banner completion during background work */
  backgroundWorkRef?: React.MutableRefObject<{ start: () => void; complete: () => void } | null>;
}

export function PlaceOnboardingProvider({ children, initialJob, notifyRepFoundRef, backgroundWorkRef }: PlaceOnboardingProviderProps) {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<OnboardingStatus>("idle");
  const [mode, setMode] = useState<OnboardingMode>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [cityName, setCityName] = useState<string | null>(null);
  const [repName, setRepName] = useState<string | null>(null);
  const [repTitle, setRepTitle] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(SESSION_KEY) === "1";
  });

  // Track when the job started for phase message computation
  const jobStartRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);

  // Use refs for status/mode so polling callback doesn't need them in deps
  const statusRef = useRef<OnboardingStatus>("idle");
  statusRef.current = status;
  const modeRef = useRef<OnboardingMode>("idle");
  modeRef.current = mode;

  // Background work tracking: defers completeCityLoading until external work finishes
  const backgroundWorkActiveRef = useRef(false);
  const pendingCityCompletionRef = useRef<boolean | null>(null);

  // Timer refs
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const foundRepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup individual timer helpers
  const clearPollTimers = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  const clearAllTimers = useCallback(() => {
    clearPollTimers();
    if (autoDismissRef.current) { clearTimeout(autoDismissRef.current); autoDismissRef.current = null; }
    if (foundRepTimeoutRef.current) { clearTimeout(foundRepTimeoutRef.current); foundRepTimeoutRef.current = null; }
  }, [clearPollTimers]);

  // Start city-level loading (no job, no polling; completed by FeedContainer)
  const startCityLoading = useCallback((name: string) => {
    // Don't override an active place-level job
    if (modeRef.current === "place") return;
    clearAllTimers();
    // Reset stale background work flag (e.g. user navigated away mid-onboarding and returned)
    backgroundWorkActiveRef.current = false;
    pendingCityCompletionRef.current = null;
    setCityName(name);
    setMode("city");
    setStatus("scanning");
    setRepName(null);
    setRepTitle(null);
    setElapsed(0);
    setJobId(null);

    // Remove any prior dismissal
    setDismissed(false);
    if (typeof window !== "undefined") sessionStorage.removeItem(SESSION_KEY);
  }, [clearAllTimers]);

  // Apply city-level completion (shared by completeCityLoading and completeBackgroundWork).
  // Idempotent: skips if already completed/failed to avoid duplicate timers.
  const applyCityCompletion = useCallback((success: boolean) => {
    const s = statusRef.current;
    if (s === "completed" || s === "failed") return;
    setStatus(success ? "completed" : "failed");
    autoDismissRef.current = setTimeout(() => {
      setDismissed(true);
      if (typeof window !== "undefined") sessionStorage.setItem(SESSION_KEY, "1");
    }, AUTO_DISMISS_MS);
  }, []);

  // Complete city-level loading (called by FeedContainer when feed resolves)
  // If background work is active (rep/mayor discovery), defers until it finishes.
  const completeCityLoading = useCallback((success: boolean) => {
    if (modeRef.current !== "city") return;
    if (backgroundWorkActiveRef.current) {
      pendingCityCompletionRef.current = success;
      return;
    }
    applyCityCompletion(success);
  }, [applyCityCompletion]);

  // Start tracking a place-level job (overrides city-level if active).
  // Preserves any active found_rep notification (mayor/rep) so it finishes
  // displaying before place-level messages take over.
  const startJob = useCallback((_placeId: number, jId: string) => {
    const preservingFoundRep = statusRef.current === "found_rep";
    // Clear poll/dismiss timers but keep foundRepTimeout if preserving the notification
    clearPollTimers();
    if (autoDismissRef.current) { clearTimeout(autoDismissRef.current); autoDismissRef.current = null; }
    if (!preservingFoundRep && foundRepTimeoutRef.current) {
      clearTimeout(foundRepTimeoutRef.current); foundRepTimeoutRef.current = null;
    }
    setJobId(jId);
    setMode("place");
    // Don't wipe an active mayor/rep notification; the 4s timeout handles revert
    if (!preservingFoundRep) {
      setStatus("scanning");
    }
    setElapsed(0);
    jobStartRef.current = Date.now();

    // Remove any prior dismissal
    setDismissed(false);
    if (typeof window !== "undefined") sessionStorage.removeItem(SESSION_KEY);
  }, [clearPollTimers]);

  // Notify that rep/mayor was found (called externally from rep discovery)
  const notifyRepFound = useCallback((name: string, title?: string) => {
    // Only show if still actively scanning
    if (statusRef.current !== "scanning" && statusRef.current !== "found_rep") return;
    setRepName(name);
    setRepTitle(title ?? null);
    setStatus("found_rep");
    // Clear any prior found_rep timeout
    if (foundRepTimeoutRef.current) clearTimeout(foundRepTimeoutRef.current);
    foundRepTimeoutRef.current = setTimeout(() => {
      foundRepTimeoutRef.current = null;
      setStatus((prev) => (prev === "found_rep" ? "scanning" : prev));
    }, 4000);
  }, []);

  // Expose notifyRepFound to parent via ref
  useEffect(() => {
    if (notifyRepFoundRef) {
      notifyRepFoundRef.current = notifyRepFound;
    }
    return () => {
      if (notifyRepFoundRef) notifyRepFoundRef.current = null;
    };
  }, [notifyRepFound, notifyRepFoundRef]);

  // Background work: signal that external async work (mayor/rep discovery) is in progress
  const startBackgroundWork = useCallback(() => {
    backgroundWorkActiveRef.current = true;
    pendingCityCompletionRef.current = null;
  }, []);

  const completeBackgroundWork = useCallback(() => {
    backgroundWorkActiveRef.current = false;
    if (pendingCityCompletionRef.current !== null) {
      const success = pendingCityCompletionRef.current;
      pendingCityCompletionRef.current = null;
      applyCityCompletion(success);
    }
  }, [applyCityCompletion]);

  // Expose background work controls to parent via ref
  useEffect(() => {
    if (backgroundWorkRef) {
      backgroundWorkRef.current = { start: startBackgroundWork, complete: completeBackgroundWork };
    }
    return () => {
      if (backgroundWorkRef) backgroundWorkRef.current = null;
    };
  }, [startBackgroundWork, completeBackgroundWork, backgroundWorkRef]);

  // Dismiss helper
  const doDismiss = useCallback(() => {
    setDismissed(true);
    if (typeof window !== "undefined") sessionStorage.setItem(SESSION_KEY, "1");
  }, []);

  // Dismiss (user-initiated)
  const dismiss = useCallback(() => {
    doDismiss();
    clearAllTimers();
  }, [doDismiss, clearAllTimers]);

  // Auto-start from initialJob prop
  const initialJobConsumed = useRef<string | null>(null);
  useEffect(() => {
    if (initialJob && initialJobConsumed.current !== initialJob.jobId) {
      initialJobConsumed.current = initialJob.jobId;
      startJob(initialJob.placeId, initialJob.jobId);
    }
  }, [initialJob, startJob]);

  // Polling effect: only runs for place-level jobs (has jobId)
  useEffect(() => {
    if (!jobId) return;

    // Elapsed time ticker
    tickRef.current = setInterval(() => {
      setElapsed(Date.now() - jobStartRef.current);
    }, 2000);

    // Job status poller
    const poll = async () => {
      // Check status via ref so we don't need status in deps
      const s = statusRef.current;
      if (s === "completed" || s === "failed" || s === "idle") return;

      // Timeout: if the job has been running too long, treat it as failed
      // so users aren't stuck staring at skeleton cards forever
      if (Date.now() - jobStartRef.current > MAX_POLL_DURATION_MS) {
        setStatus("failed");
        clearPollTimers();
        autoDismissRef.current = setTimeout(doDismiss, AUTO_DISMISS_MS);
        return;
      }

      try {
        const token = await getAccessTokenSilently();
        const job = await getJob(jobId, token);

        if (job.status === "completed") {
          setStatus("completed");
          clearPollTimers();
          // Invalidate feed so new stories appear
          queryClient.invalidateQueries({ queryKey: ["feed"] });
          // Auto-dismiss after delay
          autoDismissRef.current = setTimeout(doDismiss, AUTO_DISMISS_MS);
        } else if (job.status === "failed" || job.status === "cancelled") {
          setStatus("failed");
          clearPollTimers();
          autoDismissRef.current = setTimeout(doDismiss, AUTO_DISMISS_MS);
        }
      } catch {
        // Network hiccup; keep polling
      }
    };

    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    // Initial poll immediately
    poll();

    // Cleanup only poll/tick timers (NOT auto-dismiss, which should survive)
    return () => { clearPollTimers(); };
  }, [jobId, getAccessTokenSilently, queryClient, clearPollTimers, doDismiss]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => { clearAllTimers(); };
  }, [clearAllTimers]);

  // Compute current message
  let message = "";
  if (status === "completed") {
    message = mode === "city"
      ? `Your ${cityName || "city"} feed is ready!`
      : "Neighborhood stories will appear in your feed as they\u2019re generated.";
  } else if (status === "failed") {
    message = mode === "city"
      ? `No stories in ${cityName || "your city"} yet. Here\u2019s what\u2019s trending:`
      : "Neighborhood stories will appear in your feed as they\u2019re generated.";
  } else if (status === "found_rep" && repName) {
    message = repTitle
      ? `Found ${repTitle}: ${repName}`
      : `Found your representative: ${repName}`;
  } else if (status === "scanning") {
    message = mode === "city"
      ? `Looking for stories in ${cityName || "your city"}...`
      : getPhaseMessage(elapsed);
  }

  const value: PlaceOnboardingContextValue = {
    status,
    mode,
    message,
    cityName,
    repName,
    repTitle,
    dismissed,
    dismiss,
    startJob,
    startCityLoading,
    completeCityLoading,
    notifyRepFound,
    startBackgroundWork,
    completeBackgroundWork,
  };

  return (
    <PlaceOnboardingContext.Provider value={value}>
      {children}
    </PlaceOnboardingContext.Provider>
  );
}
