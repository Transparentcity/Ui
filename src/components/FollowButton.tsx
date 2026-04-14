"use client";

import styles from "./FollowButton.module.css";

type FollowButtonProps = {
  following: boolean;
  loading?: boolean;
  count?: number;
  size?: "default" | "compact" | "small";
  onClick: () => void;
  label?: string;
  className?: string;
};

export default function FollowButton({
  following,
  loading = false,
  count,
  size = "default",
  onClick,
  label,
  className,
}: FollowButtonProps) {
  const stateClass = following ? styles.following : styles.idle;
  const sizeClass = styles[size];

  const text = label
    ? label
    : following
      ? "Unfollow"
      : "Follow";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`${styles.btn} ${sizeClass} ${stateClass}${className ? ` ${className}` : ""}`}
    >
      {loading ? "…" : text}
      {!loading && count != null && count > 0 && (
        <span className={styles.count}>&middot; {count}</span>
      )}
    </button>
  );
}
