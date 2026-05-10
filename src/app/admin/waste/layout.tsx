import { Suspense, type ReactNode } from "react";
import { PrimaryNav } from "@/components/admin/waste/PrimaryNav";
import { TopStrip } from "@/components/admin/waste/TopStrip";
import { Readout } from "@/components/admin/waste/Readout";
import "./waste.css";
import styles from "./layout.module.css";

export const metadata = {
  title: "Waste Module · Transparent.city",
};

export default function WasteLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`waste-root ${styles.shell}`}>
      <Suspense fallback={null}>
        <PrimaryNav />
      </Suspense>
      <div className={styles.content}>
        <Suspense fallback={null}>
          <TopStrip />
        </Suspense>
        <Suspense fallback={null}>
          <Readout />
        </Suspense>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
