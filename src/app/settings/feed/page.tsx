"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TitleBar from "@/components/TitleBar";
import Sidebar from "@/components/Sidebar";
import { CATEGORY_PRESETS } from "@/lib/feed/categoryPresets";
import styles from "./feedSettings.module.css";

export default function FeedSettingsPage() {
  const { isAuthenticated, isLoading: authLoading, getAccessTokenSilently, loginWithRedirect } = useAuth0();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [initialCategories, setInitialCategories] = useState<Set<string>>(new Set());
  const [interactionCount, setInteractionCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Profile name fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [initialFirstName, setInitialFirstName] = useState("");
  const [initialLastName, setInitialLastName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Load user preferences
  useEffect(() => {
    if (!isAuthenticated || authLoading) return;

    const loadPreferences = async () => {
      try {
        const token = await getAccessTokenSilently();

        // Get user profile (includes interest model)
        const profileRes = await fetch("/api/user/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          if (profile.selected_category_ids?.length) {
            const cats = new Set<string>(profile.selected_category_ids);
            setSelectedCategories(cats);
            setInitialCategories(new Set(cats));
          }
          if (profile.interest_model) {
            setInteractionCount(profile.interest_model.interaction_count || 0);
            setLastUpdated(profile.interest_model.last_updated || null);
          }
          const fn = profile.first_name || "";
          const ln = profile.last_name || "";
          setFirstName(fn);
          setLastName(ln);
          setInitialFirstName(fn);
          setInitialLastName(ln);
        }
      } catch (err) {
        console.error("Failed to load preferences:", err);
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();
  }, [isAuthenticated, authLoading, getAccessTokenSilently]);

  const toggleCategory = useCallback((id: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const hasChanges = (() => {
    if (selectedCategories.size !== initialCategories.size) return true;
    for (const id of selectedCategories) {
      if (!initialCategories.has(id)) return true;
    }
    return false;
  })();

  const profileHasChanges =
    firstName.trim() !== initialFirstName || lastName.trim() !== initialLastName;

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setSaveMessage(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch("/api/user/me/profile", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
        }),
      });
      if (res.ok) {
        setInitialFirstName(firstName.trim());
        setInitialLastName(lastName.trim());
        setSaveMessage("Profile updated.");
      } else {
        setSaveMessage("Failed to save. Please try again.");
      }
    } catch (err) {
      console.error("Failed to save profile:", err);
      setSaveMessage("Failed to save. Please try again.");
    } finally {
      setSavingProfile(false);
      setTimeout(() => setSaveMessage(null), 4000);
    }
  };

  const handleSaveCategories = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch("/api/user/profile/categories", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selected_category_ids: [...selectedCategories],
        }),
      });
      if (res.ok) {
        setInitialCategories(new Set(selectedCategories));
        setSaveMessage("Categories saved. Your feed will adapt over time.");
      } else {
        setSaveMessage("Failed to save. Please try again.");
      }
    } catch (err) {
      console.error("Failed to save categories:", err);
      setSaveMessage("Failed to save. Please try again.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 4000);
    }
  };

  const handleResetModel = async () => {
    if (!confirm("This will reset your personalized feed ranking to defaults. Your category selections will be kept. Continue?")) {
      return;
    }
    setResetting(true);
    setSaveMessage(null);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch("/api/user/profile/reset-interest-model", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setInteractionCount(0);
        setLastUpdated(null);
        setSaveMessage("Feed preferences reset. Your feed will rebuild as you interact with stories.");
      } else {
        setSaveMessage("Failed to reset. Please try again.");
      }
    } catch (err) {
      console.error("Failed to reset interest model:", err);
      setSaveMessage("Failed to reset. Please try again.");
    } finally {
      setResetting(false);
      setTimeout(() => setSaveMessage(null), 5000);
    }
  };

  if (authLoading) {
    return (
      <div className="dashboard-layout">
        <TitleBar onMenuToggle={() => setSidebarOpen((p) => !p)} sidebarOpen={sidebarOpen} />
        <div className="dashboard-body">
          <Sidebar isOpen={sidebarOpen} onNewChat={() => router.push("/home")} />
          <main className="dashboard-main" id="main-content">
            <div className={styles.container}>
              <p>Loading...</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="dashboard-layout">
        <TitleBar onMenuToggle={() => setSidebarOpen((p) => !p)} sidebarOpen={sidebarOpen} />
        <div className="dashboard-body">
          <Sidebar isOpen={sidebarOpen} onNewChat={() => router.push("/home")} />
          <main className="dashboard-main" id="main-content">
            <div className={styles.container}>
              <h1 className={styles.pageTitle}>Feed Settings</h1>
              <p>Please sign in to manage your feed preferences.</p>
              <button
                className={styles.primaryBtn}
                onClick={() => loginWithRedirect()}
              >
                Sign In
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <TitleBar onMenuToggle={() => setSidebarOpen((p) => !p)} sidebarOpen={sidebarOpen} />
      <div className="dashboard-body">
        <Sidebar isOpen={sidebarOpen} onNewChat={() => router.push("/home")} />
        <main id="main-content" className="dashboard-main">
          <div className={styles.container}>
            <h1 className={styles.pageTitle}>Feed Settings</h1>
            <p className={styles.pageDescription}>
              Customize which topics appear in your personalized feed. Your selections
              also shape your newsletter content.
            </p>

            {loading ? (
              <p>Loading preferences...</p>
            ) : (
              <>
                {/* Profile */}
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Your Profile</h2>
                  <p className={styles.sectionDescription}>
                    How your name appears in emails and your account.
                  </p>
                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel} htmlFor="firstName">
                        First name
                      </label>
                      <input
                        id="firstName"
                        type="text"
                        className={styles.textInput}
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="First name"
                        maxLength={100}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel} htmlFor="lastName">
                        Last name
                      </label>
                      <input
                        id="lastName"
                        type="text"
                        className={styles.textInput}
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Last name"
                        maxLength={100}
                      />
                    </div>
                  </div>
                  {profileHasChanges && (
                    <button
                      className={styles.primaryBtn}
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                    >
                      {savingProfile ? "Saving..." : "Save"}
                    </button>
                  )}
                </section>

                {/* Category Selection */}
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Topics You Follow</h2>
                  <p className={styles.sectionDescription}>
                    Select the topics you care about. These influence your "For You" feed
                    ranking and newsletter content.
                  </p>
                  <div className={styles.categoryGrid}>
                    {CATEGORY_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`${styles.categoryPill} ${
                          selectedCategories.has(preset.id) ? styles.categoryPillActive : ""
                        }`}
                        onClick={() => toggleCategory(preset.id)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  {hasChanges && (
                    <button
                      className={styles.primaryBtn}
                      onClick={handleSaveCategories}
                      disabled={saving}
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  )}
                </section>

                {/* Interest Model Info */}
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Personalization</h2>
                  <p className={styles.sectionDescription}>
                    Your feed learns from your interactions. Stories you applaud, escalate,
                    investigate, or share teach the ranking engine what matters to you.
                  </p>
                  <div className={styles.statsRow}>
                    <div className={styles.stat}>
                      <span className={styles.statValue}>{interactionCount}</span>
                      <span className={styles.statLabel}>interactions logged</span>
                    </div>
                    {lastUpdated && (
                      <div className={styles.stat}>
                        <span className={styles.statValue}>
                          {new Date(lastUpdated).toLocaleDateString()}
                        </span>
                        <span className={styles.statLabel}>last updated</span>
                      </div>
                    )}
                  </div>
                  {interactionCount < 10 && (
                    <p className={styles.hint}>
                      Your feed is still learning. Interact with at least 10 stories to
                      unlock full personalization.
                    </p>
                  )}
                  <button
                    className={styles.dangerBtn}
                    onClick={handleResetModel}
                    disabled={resetting}
                  >
                    {resetting ? "Resetting..." : "Reset Feed Preferences"}
                  </button>
                </section>

                {saveMessage && (
                  <div className={styles.toast}>{saveMessage}</div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
