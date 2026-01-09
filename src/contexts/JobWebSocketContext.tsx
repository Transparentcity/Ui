"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useAuth0 } from "@auth0/auth0-react";
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

export function JobWebSocketProvider({ children }: { children: ReactNode }) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const [token, setToken] = React.useState<string | null>(null);

  // Get token for WebSocket connection
  React.useEffect(() => {
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
  }, [isAuthenticated, getAccessTokenSilently]);

  // Single shared WebSocket connection for entire app
  const jobWebSocket = useJobWebSocket(token, isAuthenticated);

  return (
    <JobWebSocketContext.Provider value={jobWebSocket}>
      {children}
    </JobWebSocketContext.Provider>
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


