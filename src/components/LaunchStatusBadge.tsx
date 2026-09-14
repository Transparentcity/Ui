import {
  LAUNCH_STATUS_LABEL,
  LAUNCH_STATUS_TITLE,
  resolveLaunchStatus,
  type LaunchStatus,
} from "@/lib/launchStatus";
import styles from "./LaunchStatusBadge.module.css";

const STATUS_CLASS: Record<LaunchStatus, string> = {
  launched: styles.launched,
  dark_launched: styles.dark,
  not_launched: styles.comingSoon,
};

export default function LaunchStatusBadge({
  status,
  city,
}: {
  status?: LaunchStatus;
  city?: Parameters<typeof resolveLaunchStatus>[0];
}) {
  const resolved = status ?? (city ? resolveLaunchStatus(city) : "not_launched");
  return (
    <span
      className={`${styles.badge} ${STATUS_CLASS[resolved]}`}
      title={LAUNCH_STATUS_TITLE[resolved]}
    >
      {LAUNCH_STATUS_LABEL[resolved]}
    </span>
  );
}
