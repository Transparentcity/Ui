"use client";

export interface ImpersonationState {
  userId: number;
  email: string;
}

const IMPERSONATION_STORAGE_KEY = "tc_impersonation";
export const IMPERSONATION_CHANGED_EVENT = "tc:impersonation-changed";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getImpersonationState(): ImpersonationState | null {
  if (!isBrowser()) return null;

  const raw = window.sessionStorage.getItem(IMPERSONATION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ImpersonationState>;
    if (
      typeof parsed.userId === "number" &&
      Number.isFinite(parsed.userId) &&
      typeof parsed.email === "string" &&
      parsed.email.length > 0
    ) {
      return {
        userId: parsed.userId,
        email: parsed.email,
      };
    }
  } catch {
    // Ignore invalid storage and clean it up below.
  }

  window.sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
  return null;
}

export function getImpersonationUserId(): number | null {
  return getImpersonationState()?.userId ?? null;
}

export function getImpersonationCacheKey(): string {
  const impersonation = getImpersonationState();
  return impersonation ? `impersonated:${impersonation.userId}` : "self";
}

function emitImpersonationChanged(): void {
  if (!isBrowser()) return;
  window.dispatchEvent(
    new CustomEvent(IMPERSONATION_CHANGED_EVENT, {
      detail: getImpersonationState(),
    }),
  );
}

export function setImpersonation(userId: number, email: string): void {
  if (!isBrowser()) return;

  window.sessionStorage.setItem(
    IMPERSONATION_STORAGE_KEY,
    JSON.stringify({ userId, email }),
  );
  emitImpersonationChanged();
}

export function clearImpersonation(): void {
  if (!isBrowser()) return;

  window.sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
  emitImpersonationChanged();
}
