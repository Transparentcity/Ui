import type { ReactNode } from "react";
import styles from "./primitives.module.css";

type Props = {
  children: ReactNode;
  right?: ReactNode;
};

export function SectionLabel({ children, right }: Props) {
  return (
    <div className={styles.sectionLabel}>
      <span className={styles.sectionLabelText}>{children}</span>
      {right}
    </div>
  );
}
