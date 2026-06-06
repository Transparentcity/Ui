"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { WASTE_CITIES, getWasteCity, type WasteCity } from "@/lib/admin/waste/cities";
import styles from "./PrimaryNav.module.css";

type Props = {
  active: WasteCity;
};

export function CitySelector({ active }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const select = (id: string) => {
    const next = new URLSearchParams(params?.toString() ?? "");
    next.set("city", id);
    router.push(`${pathname}?${next.toString()}`);
    setOpen(false);
  };

  const launched = WASTE_CITIES.filter(c => c.launched);

  return (
    <div className={styles.cityWrap} ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} className={styles.cityButton} aria-haspopup="listbox" aria-expanded={open}>
        <span className={styles.cityFlag}>{active.flag}</span>
        <div className={styles.cityMain}>
          <div className={styles.cityName}>{active.name}</div>
          <div className={styles.cityMeta}>
            {active.state}
            {active.detectors != null ? ` · ${active.detectors} detectors` : ""}
          </div>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" aria-hidden="true">
          <path d={open ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
        </svg>
      </button>
      {open && (
        <div className={styles.cityMenu} role="listbox">
          {launched.map(c => {
            const isActive = c.id === active.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => select(c.id)}
                className={`${styles.cityItem} ${isActive ? styles.cityItemActive : ""}`}
                role="option"
                aria-selected={isActive}
              >
                <span className={styles.cityFlag} style={{ fontSize: 14 }}>{c.flag}</span>
                <div className={styles.cityMain}>
                  <div className={styles.cityItemName}>{c.name}</div>
                  <div className={styles.cityItemStatus}>{c.status}</div>
                </div>
                {isActive && <span className={styles.cityItemDot} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Re-export helper so layouts can resolve the active city in one import.
export { getWasteCity };
