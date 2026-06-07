"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Segment-level error boundary for the waste module. Without this, a thrown
// error in any waste screen bubbles to the app-level boundary and unmounts the
// whole shell, leaving a blank page. This keeps the failure scoped and offers
// a retry.
export default function WasteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Waste module error:", error);
  }, [error]);

  return (
    <div className="px-8 py-10" role="alert">
      <div className="mx-auto max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-base font-semibold text-gray-900">
          Something went wrong loading this screen
        </p>
        <p className="mt-2 text-sm text-gray-500">
          {error?.message || "An unexpected error occurred."}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button size="sm" onClick={() => reset()}>
            Try again
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Reload page
          </Button>
        </div>
      </div>
    </div>
  );
}
