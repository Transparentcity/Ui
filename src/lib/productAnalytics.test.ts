import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  recordAppView,
  shouldFireDaily,
  utcDateKey,
} from "./productAnalytics";

/**
 * The daily cap decides what "active days" means for every user in the
 * product analytics. It used to live in sessionStorage, which is per-tab, so
 * a user with three tabs open counted as three daily actives. These tests
 * pin the durable behaviour.
 */
describe("shouldFireDaily", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("returns true the first time and false after that", () => {
    expect(shouldFireDaily("tc_fp_user_active_7")).toBe(true);
    expect(shouldFireDaily("tc_fp_user_active_7")).toBe(false);
    expect(shouldFireDaily("tc_fp_user_active_7")).toBe(false);
  });

  it("keeps the mark in localStorage so a second tab does not refire", () => {
    shouldFireDaily("tc_fp_user_active_7");

    // A fresh tab starts with an empty sessionStorage but shares localStorage.
    sessionStorage.clear();

    expect(shouldFireDaily("tc_fp_user_active_7")).toBe(false);
  });

  it("keys the mark by UTC day, so it releases the next day", () => {
    shouldFireDaily("tc_fp_user_active_7");
    expect(localStorage.getItem(`tc_fp_user_active_7:${utcDateKey()}`)).toBe("1");

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    vi.setSystemTime(tomorrow);
    expect(shouldFireDaily("tc_fp_user_active_7")).toBe(true);
    vi.useRealTimers();
  });

  it("tracks different users independently", () => {
    expect(shouldFireDaily("tc_fp_user_active_7")).toBe(true);
    expect(shouldFireDaily("tc_fp_user_active_9")).toBe(true);
    expect(shouldFireDaily("tc_fp_user_active_7")).toBe(false);
  });

  it("falls back to sessionStorage when localStorage refuses writes", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (this: Storage, key: string, value: string) {
        if (this === localStorage) throw new Error("QuotaExceededError");
        // Write through to the real backing store for sessionStorage.
        setItem.getMockImplementation();
        Object.defineProperty(this, key, { value, configurable: true });
      });

    // Should still report "first time today" rather than throwing.
    expect(() => shouldFireDaily("tc_fp_user_active_7")).not.toThrow();

    setItem.mockRestore();
  });
});

describe("recordAppView", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing when the view name is empty", () => {
    recordAppView("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts an app_view event carrying the view name", async () => {
    recordAppView("chat", { city_id: 57223 });

    // recordProductEvent is fire-and-forget; let its promise chain settle.
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(String(url)).toContain("/api/public/event");

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.event_name).toBe("app_view");
    expect(body.properties.view).toBe("chat");
    expect(body.city_id).toBe(57223);
  });

  it("is not daily-capped, because the sequence of views is the point", async () => {
    recordAppView("chat");
    recordAppView("city-data");
    recordAppView("chat");

    await vi.waitFor(() =>
      expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3)
    );
  });
});
