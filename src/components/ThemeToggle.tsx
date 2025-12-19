"use client";

import { useTheme } from "@/contexts/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme, mounted } = useTheme();

  if (!mounted) {
    // Prevent hydration mismatch by returning a placeholder
    return (
      <button
        className="theme-toggle"
        aria-label="Toggle theme"
        disabled
        style={{ opacity: 0 }}
      >
        <span>🌙</span>
      </button>
    );
  }

  return (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? (
        <span aria-hidden="true">☀️</span>
      ) : (
        <span aria-hidden="true">🌙</span>
      )}
    </button>
  );
}

