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

interface PlaceOnboardingContextValue {
  status: OnboardingStatus;
  message: string;
  repName: string | null;
  dismissed: boolean;
  dismiss: () => void;
  startJob: (placeId: number, jobId: string) => void;
  notifyRepFound: (name: string) => void;
}

// ---------------------------------------------------------------------------
// Progressive messages based on elapsed seconds
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
  message: "",
  repName: null,
  dismissed: false,
  dismiss: () => {},
  startJob: () => {},
  notifyRepFound: () => {},
});

export function usePlaceOnboarding() {
  return useContext(PlaceOnboardingContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const SESSION_KEY = "tc:onboarding-banner-dismissed";
const POLL_INTERVAL_MS = 2000;
const AUTO_DISMISS_MS = 5000;

interface PlaceOnboardingProviderProps {
  children: ReactNode;
  /** When set externally (e.g. after onboarding), auto-starts the job tracking */
  initialJob?: { placeId: number; jobId: string } | null;
  /** Ref that gets populated with notifyRepFound so parent can call it */
  notifyRepFoundRef?: React.MutableRefObject<((name: string) => void) | null>;
}

export function PlaceOnboardingProvider({ children, initialJob, notifyRepFoundRef }: PlaceOnboardingProviderProps) {
  const { getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<OnboardingStatus>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [repName, setRepName] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(SESSION_KEY) === "1";
  });

  // Track when the job started for phase message computation
  const jobStartRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);

  // Use refs for status so polling callback doesn't need status in its deps
  const statusRef = useRef<OnboardingStatus>("idle");
  statusRef.current = status;

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

  // Start tracking a new job
  // placeId param kept in signature for future use (e.g. refetching place data)
  const startJob = useCallback((_placeId: number, jId: string) => {
    clearAllTimers();
    setJobId(jId);
    setStatus("scanning");
    setRepName(null);
    setElapsed(0);
    jobStartRef.current = Date.now();

    // Remove any prior dismissal
    setDismissed(false);
    if (typeof window !== "undefined") sessionStorage.removeItem(SESSION_KEY);
  }, [clearAllTimers]);

  // Notify that rep was found (called externally from rep discovery)
  const notifyRepFound = useCallback((name: string) => {
    // Only show if still actively scanning
    if (statusRef.current !== "scanning" && statusRef.current !== "found_rep") return;
    setRepName(name);
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

  // Polling effect: only depends on jobId (not status) to avoid re-run churn
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
    message = "Your neighborhood feed is ready!";
  } else if (status === "failed") {
    message = "Your city feed is ready. We\u2019ll add neighborhood stories as more data becomes available.";
  } else if (status === "found_rep" && repName) {
    message = `Found your representative: ${repName}`;
  } else if (status === "scanning") {
    message = getPhaseMessage(elapsed);
  }

  const value: PlaceOnboardingContextValue = {
    status,
    message,
    repName,
    dismissed,
    dismiss,
    startJob,
    notifyRepFound,
  };

  return (
    <PlaceOnboardingContext.Provider value={value}>
      {children}
    </PlaceOnboardingContext.Provider>
  );
}
