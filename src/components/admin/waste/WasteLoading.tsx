// Shared loading placeholder for waste-module screens. Used as the Suspense
// fallback so a slow backend shows an animated skeleton instead of a blank
// white content area (which reads as "broken" to users).

export function WasteLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="px-8 py-6" role="status" aria-live="polite" data-testid="waste-loading">
      <span className="sr-only">{label}</span>
      <div className="mb-5 h-4 w-2/3 max-w-xl animate-pulse rounded bg-gray-200" />
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border border-gray-200 bg-white"
          >
            <div className="m-3.5 h-3 w-3/4 rounded bg-gray-200" />
            <div className="mx-3.5 h-6 w-1/3 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default WasteLoading;
