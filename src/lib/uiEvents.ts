export const SAVED_CITIES_CHANGED_EVENT = "tc:saved-cities-changed";

export function emitSavedCitiesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SAVED_CITIES_CHANGED_EVENT));
}

/** Request the shared "edit place" modal to open for a given saved place id. */
export const OPEN_EDIT_PLACE_EVENT = "tc:open-edit-place";

export function emitOpenEditPlace(placeId: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<number>(OPEN_EDIT_PLACE_EVENT, { detail: placeId })
  );
}











