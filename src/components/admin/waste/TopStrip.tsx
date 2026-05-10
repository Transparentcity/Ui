"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useAuth0 } from "@auth0/auth0-react";
import { useWasteState, type WasteDemoState } from "@/lib/admin/waste/useWasteState";
import styles from "./TopStrip.module.css";

const STATES: readonly WasteDemoState[] = ["rich", "quiet", "degraded"];

function avatarInitial(name?: string | null, email?: string | null): string {
  if (name && name.trim().length > 0) return name.trim()[0]!.toUpperCase();
  if (email && email.length > 0) return email[0]!.toUpperCase();
  return "??";
}

export function TopStrip() {
  const ui = useWasteState();
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth0();

  const setState = (next: WasteDemoState) => {
    const sp = new URLSearchParams(params?.toString() ?? "");
    if (next === "rich") sp.delete("state");
    else sp.set("state", next);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  const detectorPart = ui.city.detectors != null
    ? `${ui.detectorsActive} of ${ui.city.detectors} detectors`
    : ui.city.status;

  const healthClass =
    ui.health === "warn" ? styles.healthWarn :
    ui.health === "down" ? styles.healthDown :
    styles.healthHealthy;

  const initial = avatarInitial(user?.name, user?.email);

  return (
    <header className={styles.strip} aria-label="Waste module status">
      <div className={styles.left}>
        <div className={styles.section}>{ui.sectionLabel}</div>
        <div className={styles.cityLine}>
          {ui.city.flag} {ui.city.name} · {detectorPart}
        </div>
      </div>

      <div className={styles.spacer} />

      <div className={styles.toggle} role="tablist" aria-label="Demo state">
        {STATES.map(s => {
          const active = s === ui.state;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={active}
              className={`${styles.toggleBtn} ${active ? styles.toggleBtnActive : ""}`}
              onClick={() => setState(s)}
            >
              {s}
            </button>
          );
        })}
      </div>

      <div className={styles.timestamp}>{ui.lastRunAt}</div>

      <div className={`${styles.healthPill} ${healthClass}`} aria-live="polite">
        <span className={styles.healthDot} aria-hidden="true" />
        {ui.healthLabel}
      </div>

      <div className={styles.avatar} aria-label={user?.name || user?.email || "Signed-out admin"}>
        {user?.picture ? <img src={user.picture} alt="" /> : initial}
      </div>
    </header>
  );
}
