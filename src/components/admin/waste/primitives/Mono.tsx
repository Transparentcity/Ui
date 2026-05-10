import type { CSSProperties, ReactNode } from "react";
import styles from "./primitives.module.css";

type Props = {
  children: ReactNode;
  color?: string;
  className?: string;
};

export function Mono({ children, color, className }: Props) {
  const style: CSSProperties | undefined = color ? { color } : undefined;
  const cls = className ? `${styles.mono} ${className}` : styles.mono;
  return <span className={cls} style={style}>{children}</span>;
}
