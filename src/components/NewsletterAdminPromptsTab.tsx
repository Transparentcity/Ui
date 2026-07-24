"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getNewsletterPrompts,
  updateNewsletterPrompts,
  type NewsletterPromptsResponse,
} from "@/lib/apiClient";
import Loader from "@/components/Loader";
import styles from "./NewsletterAdmin.module.css";

export default function NewsletterAdminPromptsTab() {
  const { getAccessTokenSilently } = useAuth0();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<NewsletterPromptsResponse | null>(null);
  const [sharedPrompt, setSharedPrompt] = useState("");
  const [personalizedPrompt, setPersonalizedPrompt] = useState("");
  const [unifiedPrompt, setUnifiedPrompt] = useState("");
  const [activePrompt, setActivePrompt] = useState<"unified" | "shared" | "personalized">(
    "unified"
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getAccessTokenSilently();
      const res = await getNewsletterPrompts(token);
      setData(res);
      setSharedPrompt(res.shared_newsletter_prompt);
      setPersonalizedPrompt(res.personalized_newsletter_prompt);
      setUnifiedPrompt(res.unified_newsletter_prompt ?? "");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load newsletter prompts");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await getAccessTokenSilently();
      await updateNewsletterPrompts(
        {
          shared_newsletter_prompt: sharedPrompt,
          personalized_newsletter_prompt: personalizedPrompt,
          unified_newsletter_prompt: unifiedPrompt,
        },
        token
      );
      toast.success("Newsletter prompts saved.");
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to save prompts";
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
        toast.error(
          "No active weekly_newsletter scheduled job found. Create one first in the Scheduled Jobs panel."
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleResetShared = () => {
    if (data) setSharedPrompt(data.default_shared_prompt);
  };

  const handleResetPersonalized = () => {
    if (data) setPersonalizedPrompt(data.default_personalized_prompt);
  };

  const handleResetUnified = () => {
    if (data) setUnifiedPrompt(data.default_unified_prompt);
  };

  const sharedDirty = data ? sharedPrompt !== data.shared_newsletter_prompt : false;
  const personalizedDirty = data
    ? personalizedPrompt !== data.personalized_newsletter_prompt
    : false;
  const unifiedDirty = data
    ? unifiedPrompt !== (data.unified_newsletter_prompt ?? "")
    : false;
  const anyDirty = sharedDirty || personalizedDirty || unifiedDirty;

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 0",
          gap: 12,
        }}
      >
        <Loader size="md" color="dark" />
        <span>Loading prompts…</span>
      </div>
    );
  }

  return (
    <>
      <div className={styles.infoBox}>
        These prompt templates are used by the <strong>weekly newsletter scheduled job</strong> when
        it runs Seymour to generate drafts. Changes are stored on the active{" "}
        <code>weekly_newsletter</code> CustomScheduledJob&apos;s <code>job_config</code> and applied
        on the next run.
        <br />
        <br />
        <strong>Shared prompt</strong> placeholders:{" "}
        <code>
          {"{city_name}"} {"{city_id}"} {"{district_int}"} {"{district_label_prefix}"}
          {" "}{"{district_also_citywide}"} {"{district_arg}"}
        </code>
        <br />
        <strong>Personalized prompt</strong> placeholders:{" "}
        <code>
          {"{subs_text}"} {"{instructions_block}"} {"{city_id}"} {"{district_int}"}
        </code>
        <br />
        <strong>Unified prompt</strong> placeholders:{" "}
        <code>
          {"{subs_text}"} {"{instructions_block}"} {"{city_id}"} {"{district_int}"}{" "}
          {"{city_name}"}
        </code>
        {data?.custom_job_id && (
          <span style={{ marginLeft: 12, color: "var(--text-secondary)", fontSize: 12 }}>
            (Job #{data.custom_job_id})
          </span>
        )}
        {!data?.custom_job_id && (
          <span
            style={{
              marginLeft: 12,
              color: "var(--text-warning, #f59e0b)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Warning: no active weekly_newsletter job found — saving will fail.
          </span>
        )}
      </div>

      <div className={styles.promptTabs}>
        <button
          className={`${styles.promptTab} ${activePrompt === "unified" ? styles.promptTabActive : ""}`}
          type="button"
          onClick={() => setActivePrompt("unified")}
        >
          Unified (plan-based)
          {unifiedDirty && (
            <span
              style={{
                marginLeft: 6,
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--brand-primary, #ad35fa)",
                display: "inline-block",
              }}
            />
          )}
        </button>
        <button
          className={`${styles.promptTab} ${activePrompt === "shared" ? styles.promptTabActive : ""}`}
          type="button"
          onClick={() => setActivePrompt("shared")}
        >
          Shared city / district
          {sharedDirty && (
            <span
              style={{
                marginLeft: 6,
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--brand-primary, #ad35fa)",
                display: "inline-block",
              }}
            />
          )}
        </button>
        <button
          className={`${styles.promptTab} ${
            activePrompt === "personalized" ? styles.promptTabActive : ""
          }`}
          type="button"
          onClick={() => setActivePrompt("personalized")}
        >
          Personalized
          {personalizedDirty && (
            <span
              style={{
                marginLeft: 6,
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--brand-primary, #ad35fa)",
                display: "inline-block",
              }}
            />
          )}
        </button>
      </div>

      {activePrompt === "unified" && (
        <div className={styles.promptEditor}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 10px" }}>
            Used by the <strong>unified pipeline</strong> (draft assembly). Seymour researches
            with tools guided by the pre-ranked story slate, then submits a structured plan via{" "}
            <code>submit_newsletter_plan</code> — it never writes HTML. The platform renders the
            Public Record layout and the Citywide Scorecard deterministically.
          </p>
          <textarea
            className={styles.textarea}
            value={unifiedPrompt}
            onChange={(e) => setUnifiedPrompt(e.target.value)}
            rows={18}
          />
          <div className={styles.promptActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleSave}
              disabled={saving || !anyDirty}
            >
              {saving ? "Saving…" : "Save prompts"}
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={handleResetUnified}
              disabled={saving}
            >
              Reset to default
            </button>
          </div>
        </div>
      )}

      {activePrompt === "shared" && (
        <div className={styles.promptEditor}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 10px" }}>
            Used when generating a shared draft for a city/district group. Seymour has access to{" "}
            <code>list_feed_stories</code>, <code>get_dashboard_comparisons</code>, and all standard
            metric + geo tools.
          </p>
          <textarea
            className={styles.textarea}
            value={sharedPrompt}
            onChange={(e) => setSharedPrompt(e.target.value)}
            rows={18}
          />
          <div className={styles.promptActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleSave}
              disabled={saving || !anyDirty}
            >
              {saving ? "Saving…" : "Save prompts"}
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={handleResetShared}
              disabled={saving}
            >
              Reset to default
            </button>
          </div>
        </div>
      )}

      {activePrompt === "personalized" && (
        <div className={styles.promptEditor}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 10px" }}>
            Used for subscribers with custom instructions (<em>personalized_custom</em>) or
            personal-place feed story activity (<em>personalized_place</em>). Seymour has full
            place-tool access (<code>list_user_places</code>, <code>list_feed_stories</code> with{" "}
            <code>only_my_saved_places</code>, <code>get_place_dashboard_comparisons</code>).
          </p>
          <textarea
            className={styles.textarea}
            value={personalizedPrompt}
            onChange={(e) => setPersonalizedPrompt(e.target.value)}
            rows={18}
          />
          <div className={styles.promptActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleSave}
              disabled={saving || !anyDirty}
            >
              {saving ? "Saving…" : "Save prompts"}
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={handleResetPersonalized}
              disabled={saving}
            >
              Reset to default
            </button>
          </div>
        </div>
      )}
    </>
  );
}
