/**
 * Helpers for Auth0 PKCE transaction state during passwordless (magic link) signup.
 *
 * Magic links often open in a new tab or mail-client browser, so transaction state
 * must not live only in sessionStorage. We mirror auth0-spa-js cookie storage when
 * `useCookiesForTransactions` is enabled on Auth0Provider.
 */

export const AUTH0_TXN_STORAGE_PREFIX = "a0.spajs.txs";

export type Auth0LoginTransaction = {
  nonce: string;
  code_verifier: string;
  scope: string;
  audience: string;
  redirect_uri: string;
  state: string;
  response_type: "code";
  appState?: unknown;
  created_at?: number;
};

/** Cookie domain for production *.transparent.city hosts; omit on localhost. */
export function getAuth0CookieDomain(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const host = window.location.hostname;
  if (host === "localhost" || host.endsWith(".localhost")) return undefined;
  if (host === "transparent.city" || host.endsWith(".transparent.city")) {
    return ".transparent.city";
  }
  return undefined;
}

function setJsonCookie(
  name: string,
  value: unknown,
  options?: { daysUntilExpire?: number; cookieDomain?: string }
): void {
  if (typeof document === "undefined") return;
  let attrs = "path=/";
  if (window.location.protocol === "https:") {
    attrs += "; Secure; SameSite=None";
  }
  if (options?.daysUntilExpire) {
    attrs += `; Max-Age=${options.daysUntilExpire * 86400}`;
  }
  if (options?.cookieDomain) {
    attrs += `; Domain=${options.cookieDomain}`;
  }
  document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))}; ${attrs}`;
}

function readJsonCookie(name: string): unknown | undefined {
  if (typeof document === "undefined") return undefined;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    try {
      return JSON.parse(decodeURIComponent(trimmed.slice(prefix.length)));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function readTxnFromStorage(
  storage: Storage,
  clientId?: string
): Auth0LoginTransaction | undefined {
  if (clientId) {
    const raw = storage.getItem(`${AUTH0_TXN_STORAGE_PREFIX}.${clientId}`);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as Auth0LoginTransaction;
    } catch {
      return undefined;
    }
  }
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(`${AUTH0_TXN_STORAGE_PREFIX}.`)) continue;
    try {
      const raw = storage.getItem(key);
      if (raw) return JSON.parse(raw) as Auth0LoginTransaction;
    } catch {
      /* try next */
    }
  }
  return undefined;
}

/** Persist PKCE transaction for the magic-link return (cookies + localStorage). */
export function persistAuth0LoginTransaction(
  clientId: string,
  transaction: Auth0LoginTransaction
): void {
  const key = `${AUTH0_TXN_STORAGE_PREFIX}.${clientId}`;
  const withTimestamp: Auth0LoginTransaction = {
    ...transaction,
    created_at: Date.now(),
  };
  const serialized = JSON.stringify(withTimestamp);

  try {
    localStorage.setItem(key, serialized);
  } catch {
    /* private mode */
  }

  try {
    sessionStorage.setItem(key, serialized);
  } catch {
    /* private mode */
  }

  setJsonCookie(key, withTimestamp, {
    daysUntilExpire: 1,
    cookieDomain: getAuth0CookieDomain(),
  });
}

export function findAuth0TransactionByState(
  state: string,
  clientId?: string
): boolean {
  const matches = (txn: Auth0LoginTransaction | undefined) =>
    txn?.state === state;

  if (clientId) {
    const key = `${AUTH0_TXN_STORAGE_PREFIX}.${clientId}`;
    const cookieTxn = readJsonCookie(key) as Auth0LoginTransaction | undefined;
    if (matches(cookieTxn)) return true;
    if (typeof localStorage !== "undefined") {
      if (matches(readTxnFromStorage(localStorage, clientId))) return true;
    }
    if (typeof sessionStorage !== "undefined") {
      if (matches(readTxnFromStorage(sessionStorage, clientId))) return true;
    }
    return false;
  }

  if (typeof localStorage !== "undefined") {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`${AUTH0_TXN_STORAGE_PREFIX}.`)) continue;
      try {
        const raw = localStorage.getItem(key);
        if (raw && matches(JSON.parse(raw) as Auth0LoginTransaction)) return true;
      } catch {
        /* continue */
      }
    }
  }

  if (typeof sessionStorage !== "undefined") {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith(`${AUTH0_TXN_STORAGE_PREFIX}.`)) continue;
      try {
        const raw = sessionStorage.getItem(key);
        if (raw && matches(JSON.parse(raw) as Auth0LoginTransaction)) return true;
      } catch {
        /* continue */
      }
    }
  }

  if (typeof document !== "undefined") {
    for (const part of document.cookie.split(";")) {
      const trimmed = part.trim();
      if (!trimmed.startsWith(`${AUTH0_TXN_STORAGE_PREFIX}.`)) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      try {
        const parsed = JSON.parse(
          decodeURIComponent(trimmed.slice(eq + 1))
        ) as Auth0LoginTransaction;
        if (matches(parsed)) return true;
      } catch {
        /* continue */
      }
    }
  }

  return false;
}

const TXN_MAX_AGE_MS = 60 * 60 * 1000;

/** Remove passwordless transactions older than one hour. */
export function clearStaleAuth0Transactions(): void {
  if (typeof window === "undefined") return;
  const cutoff = Date.now() - TXN_MAX_AGE_MS;

  const isStale = (raw: string | null): boolean => {
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as Auth0LoginTransaction;
      const createdAt = parsed.created_at ?? 0;
      return createdAt > 0 && createdAt < cutoff;
    } catch {
      return true;
    }
  };

  for (const storage of [localStorage, sessionStorage]) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(AUTH0_TXN_STORAGE_PREFIX)) continue;
      if (isStale(storage.getItem(key))) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => storage.removeItem(key));
  }
}
