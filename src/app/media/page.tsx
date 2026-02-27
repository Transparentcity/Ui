import { redirect } from "next/navigation"

/** Redirect /media to contacts with media filter (backwards compatibility) */
export default function MediaRedirect() {
  redirect("/contacts?type=media")
}
