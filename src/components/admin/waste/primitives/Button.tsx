import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./primitives.module.css";

export type WasteButtonVariant = "primary" | "secondary" | "ghost" | "outlineWhite" | "invert";
export type WasteButtonSize = "sm" | "md" | "lg" | "hero";

const variantClass: Record<WasteButtonVariant, string> = {
  primary: styles.btnPrimary,
  secondary: styles.btnSecondary,
  ghost: styles.btnGhost,
  outlineWhite: styles.btnOutlineWhite,
  invert: styles.btnInvert,
};

const sizeClass: Record<WasteButtonSize, string> = {
  sm: styles.btnSm,
  md: styles.btnMd,
  lg: styles.btnLg,
  hero: styles.btnHero,
};

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: WasteButtonVariant;
  size?: WasteButtonSize;
  children: ReactNode;
  className?: string;
};

export function Button({ variant = "primary", size = "md", children, className, ...rest }: Props) {
  const cls = [styles.btn, variantClass[variant], sizeClass[size], className].filter(Boolean).join(" ");
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
