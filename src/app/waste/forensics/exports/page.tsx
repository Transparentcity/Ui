import { redirect } from "next/navigation"

export default function LegacyWasteRedirect() {
  redirect("/waste/reports")
}
