"use client";

import React, { createContext, useContext, ReactNode, Suspense } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useSearchParams } from "next/navigation";
import { useJobWebSocket, type Job } from "@/lib/useJobWebSocket";

interface JobWebSocketContextValue {
  jobs: Job[];
  activeJobs: Job[];
  isConnected: boolean;
  cancelJob: (jobId: string) => Promise<void>;
  refreshJobs: () => Promise<void>;
  fetchJob: (jobId: string) => Promise<void>;
}

const JobWebSocketContext = createContext<JobWebSocketContextValue | null>(null);

function JobWebSocketProviderInner({ children }: { children: ReactNode }) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const searchParams = useSearchParams();
  const [token, setToken] = React.useState<string | null>(null);
  
  // Check if we're in embedded mode - skip WebSocket in that case
  const isEmbedded = searchParams?.get("embedded") === "true";

  // Get token for WebSocket connection
  React.useEffect(() => {
    // Skip token fetch for embedded mode
    if (isEmbedded) {
      setToken(null);
      return;
    }
    
    if (isAuthenticated) {
      getAccessTokenSilently()
        .then((t) => {
          setToken(t);
        })
        .catch((err) => {
          console.error("Failed to get token for job WebSocket:", err);
        });
    } else {
      setToken(null);
    }
  }, [isAuthenticated, getAccessTokenSilently, isEmbedded]);

  // Single shared WebSocket connection for entire app
  // Pass isAuthenticated=false for embedded mode to skip connection
  const jobWebSocket = useJobWebSocket(token, isAuthenticated && !isEmbedded);

  return (
    <JobWebSocketContext.Provider value={jobWebSocket}>
      {children}
    </JobWebSocketContext.Provider>
  );
}

export function JobWebSocketProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<>{children}</>}>
      <JobWebSocketProviderInner>{children}</JobWebSocketProviderInner>
    </Suspense>
  );
}

export function useJobWebSocketContext() {
  const context = useContext(JobWebSocketContext);
  if (!context) {
    throw new Error(
      "useJobWebSocketContext must be used within JobWebSocketProvider"
    );
  }
  return context;
}


