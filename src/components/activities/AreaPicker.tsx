"use client";

import { useRouter } from "next/navigation";

import styles from "./ActivityPage.module.css";

type Option = { slug: string; label: string };

/** Scope the activity page to a neighborhood, a council district, or the whole city. */
export default function AreaPicker({
  basePath,
  current,
  cityName,
  neighborhoods,
  districts,
}: {
  basePath: string;
  current: string;
  cityName: string;
  neighborhoods: Option[];
  districts: Option[];
}) {
  const router = useRouter();
  return (
    <label className={styles.areaPicker}>
      <span>Show</span>
      <select
        value={current}
        onChange={(e) => {
          const v = e.target.value;
          router.push(v ? `${basePath}?area=${encodeURIComponent(v)}` : basePath);
        }}
      >
        <option value="">All of {cityName}</option>
        <optgroup label="Council districts">
          {districts.map((d) => (
            <option key={d.slug} value={d.slug}>
              {d.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Neighborhoods">
          {neighborhoods.map((n) => (
            <option key={n.slug} value={n.slug}>
              {n.label}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}
