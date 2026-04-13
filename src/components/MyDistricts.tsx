"use client";

import { useState } from "react";
import Link from "next/link";
import { useSavedDistricts } from "@/lib/hooks/useCities";
import { slugify } from "@/lib/utils";
import Loader from "./Loader";
import styles from "./SidebarLists.module.css";

interface MyDistrictsProps {
  onDistrictClick?: (cityId: number, district: string) => void;
  activeCityId?: number | null;
  activeDistrict?: string | null;
}

export default function MyDistricts({
  onDistrictClick,
  activeCityId,
  activeDistrict,
}: MyDistrictsProps) {
  const [expanded, setExpanded] = useState(true);
  const { data: districts = [], isLoading, isError } = useSavedDistricts();

  if (isError || (!isLoading && districts.length === 0)) {
    return null;
  }

  return (
    <div id="my-districts-section" style={{ display: "block" }}>
      <div
        className={`${styles.sectionHeader} ${styles.sectionCollapsible}`}
        id="my-districts-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span>My Districts</span>
        <span id="my-districts-chevron" className={styles.sectionChevron}>
          {expanded ? "▼" : "▶"}
        </span>
      </div>
      {expanded && (
        <div id="my-districts-list">
          {isLoading ? (
            <div
              className={styles.emptyState}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                justifyContent: "center",
              }}
            >
              <Loader size="sm" color="dark" />
              <span>Loading districts...</span>
            </div>
          ) : (
            districts.map((d) => {
              const href = `/c/${slugify(d.city_name)}/district/${d.district}`;
              const isActive =
                activeCityId === d.city_id && String(activeDistrict) === d.district;
              return (
                <Link
                  key={`${d.city_id}-${d.district}`}
                  href={href}
                  className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
                  data-city-id={d.city_id}
                  data-district={d.district}
                  onClick={() => onDistrictClick?.(d.city_id, d.district)}
                >
                  <div className={styles.content}>
                    <div className={styles.myCitiesItemWrapper}>
                      <div className={styles.myCitiesName}>{d.display_name}</div>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
