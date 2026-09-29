import { redirect } from "next/navigation";

/**
 * City manager activity now lives on the admin Dashboards "People" tab, which
 * covers every chat-enabled user (admins, city leads, analysts). Kept as a
 * redirect so old bookmarks still land there.
 */
export default function CityLeadsRedirect() {
  redirect("/home?view=system-stats&dash_tab=people");
}
