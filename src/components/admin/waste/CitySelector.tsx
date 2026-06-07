"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { MapPin, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { WASTE_CITIES, getWasteCity, type WasteCity } from "@/lib/admin/waste/cities";

type Props = {
  active: WasteCity;
  /** "panel" = full-width sidebar picker, "chip" = compact header pill. */
  variant?: "panel" | "chip";
};

export function CitySelector({ active, variant = "panel" }: Props) {
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

  const launched = WASTE_CITIES.filter((c) => c.launched);
  const label = `${active.flag ? active.flag + " " : ""}${active.name}${active.state ? `, ${active.state}` : ""}`;

  const menu = open && (
    <div
      role="listbox"
      className={cn(
        "absolute top-full mt-1 z-50 bg-[var(--bg-primary)] rounded-lg shadow-lg border border-[var(--border-primary)] overflow-hidden",
        variant === "panel" ? "left-3 right-3" : "left-0 min-w-[220px]",
      )}
    >
      {launched.map((c) => {
        const isCurrent = c.id === active.id;
        return (
          <button
            key={c.id}
            type="button"
            role="option"
            aria-selected={isCurrent}
            onClick={() => select(c.id)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
              isCurrent ? "bg-[var(--brand-secondary)] text-[var(--brand-primary)]" : "hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]",
            )}
          >
            <span className="w-4 shrink-0 text-center">
              {isCurrent ? <Check className="w-3.5 h-3.5 inline" /> : null}
            </span>
            {c.flag && <span className="shrink-0">{c.flag}</span>}
            <span className="flex-1 truncate">
              {c.name}
              {c.state && <span className="text-[var(--text-tertiary)] ml-1">· {c.state}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );

  if (variant === "chip") {
    return (
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-purple-200 bg-[var(--brand-secondary)] text-xs font-medium text-[var(--brand-primary)] hover:bg-[var(--brand-secondary-hover)] transition-colors"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <MapPin className="w-3 h-3" />
          {label}
          <ChevronDown className="w-3 h-3 text-purple-500/80" />
        </button>
        {menu}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative px-3 pb-3">
      <label className="block text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wide px-1 mb-1">
        City
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] border-[var(--border-primary)]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <MapPin className="w-3.5 h-3.5 text-[var(--brand-primary)] shrink-0" />
        <span className="flex-1 min-w-0 text-left truncate font-medium text-[var(--text-primary)]">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />
      </button>
      {menu}
    </div>
  );
}

// Re-export helper so layouts can resolve the active city in one import.
export { getWasteCity };
