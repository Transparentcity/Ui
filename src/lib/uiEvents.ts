export const SAVED_CITIES_CHANGED_EVENT = "tc:saved-cities-changed";

export function emitSavedCitiesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SAVED_CITIES_CHANGED_EVENT));
}


