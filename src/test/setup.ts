import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * Web Storage polyfill for the test environment.
 *
 * Node 25 ships its own experimental `localStorage` global, which wins over
 * jsdom's and arrives as a plain object with no `getItem`/`setItem`/`clear`.
 * Any test touching storage dies with "localStorage.clear is not a function"
 * before its first assertion — including tests that were passing when they
 * were written.
 *
 * Installing a real in-memory Storage keeps jsdom's semantics: values are
 * coerced to strings, missing keys read back as null, and `length`/`key()`
 * work. Each storage is cleared between tests so nothing leaks across them.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    const value = this.store.get(String(key));
    return value === undefined ? null : value;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value));
  }
}

function installStorage(name: "localStorage" | "sessionStorage"): void {
  const existing = (globalThis as Record<string, unknown>)[name];
  if (existing && typeof (existing as Storage).setItem === "function") return;

  const storage = new MemoryStorage();
  const targets = [globalThis, typeof window === "undefined" ? null : window];
  for (const target of targets) {
    if (!target) continue;
    Object.defineProperty(target, name, {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}

installStorage("localStorage");
installStorage("sessionStorage");

/**
 * Reset storage between tests, tolerating suites that swap in their own
 * partial storage mock. Several do, and those mocks stub only the two or
 * three methods the test needs — calling clear() on them would fail the
 * suite from the setup file, which is a confusing place to be told about it.
 */
function clearIfPossible(storage: Storage | undefined): void {
  if (storage && typeof storage.clear === "function") storage.clear();
}

beforeEach(() => {
  clearIfPossible(globalThis.localStorage);
  clearIfPossible(globalThis.sessionStorage);
});

afterEach(() => {
  cleanup();
});
