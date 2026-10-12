import { useEffect, type RefObject } from "react";

/**
 * While `active`, calls `onDismiss` on a mousedown outside `ref` or on Escape.
 * Clicks inside stay put, so a popover's own controls (and any text selection
 * in it) keep working. Pass a stable `onDismiss` (useCallback) to avoid
 * re-subscribing every render.
 */
export function useDismissOnOutsideClick(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onDismiss();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ref, active, onDismiss]);
}
