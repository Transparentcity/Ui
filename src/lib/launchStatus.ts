export type LaunchStatus = "not_launched" | "dark_launched" | "launched";

export const LAUNCH_STATUS_LABEL: Record<LaunchStatus, string> = {
  launched: "Launched",
  dark_launched: "Dark",
  not_launched: "Coming soon",
};

export const LAUNCH_STATUS_TITLE: Record<LaunchStatus, string> = {
  launched: "Public — homepage, sitemap, newsletters",
  dark_launched: "Private beta — schedules on, gated public page",
  not_launched: "Coming soon — schedules off",
};

export const LAUNCH_STATUS_RANK: Record<LaunchStatus, number> = {
  launched: 0,
  dark_launched: 1,
  not_launched: 2,
};

export function resolveLaunchStatus(city: {
  launch_status?: LaunchStatus | string | null;
  is_launched?: boolean;
  is_dark_launched?: boolean;
}): LaunchStatus {
  const raw = city.launch_status;
  if (raw === "launched" || raw === "dark_launched" || raw === "not_launched") {
    return raw;
  }
  if (city.is_dark_launched) return "dark_launched";
  if (city.is_launched) return "launched";
  return "not_launched";
}
